import csv
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone
from main.models import ParkingSpot, SpotObservation, SpotHourStat
from main.spot_identity import geometry_hash


G = {'type': 'Polygon', 'coordinates': [[[27, 53], [27.0001, 53], [27.0001, 53.0001], [27, 53]]]}


class SpotIdentityTests(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)

    def geo(self, ids):
        features = []
        for i, code in enumerate(ids):
            g = json.loads(json.dumps(G))
            g['coordinates'] = [[[x + i * .001, y] for x, y in ring] for ring in g['coordinates']]
            features.append({'type': 'Feature', 'properties': {'id': code, 'zone': 'zone-a'}, 'geometry': g})
        path = self.path / 'spots.json'
        path.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}))
        return path

    def table(self, rows):
        path = self.path / 'codes.csv'
        with path.open('w', newline='') as f:
            w = csv.writer(f); w.writerow(['old_code', 'new_code', 'geometry_sha256']); w.writerows(rows)
        return path

    def test_reimport_reorder_addition_preserve_primary_keys(self):
        path = self.geo(['z1:0', 'z1:1'])
        call_command('import_spots', path)
        before = dict(ParkingSpot.objects.values_list('code', 'pk'))
        data = json.loads(path.read_text()); data['features'].reverse()
        extra = json.loads(self.geo(['z1:0', 'z1:1', 'new-uuid']).read_text())['features'][2]
        data['features'].append(extra); path.write_text(json.dumps(data))
        call_command('import_spots', path); call_command('import_spots', path)
        self.assertEqual(ParkingSpot.objects.count(), 3)
        for code, pk in before.items(): self.assertEqual(ParkingSpot.objects.get(code=code).pk, pk)

    def test_import_validates_last_feature_before_any_write(self):
        for ids in [['new', None], ['new', 'new'], ['new', ' ']]:
            with self.assertRaises(CommandError): call_command('import_spots', self.geo(ids))
            self.assertEqual(ParkingSpot.objects.count(), 0)
        path = self.geo(['a', 'b']); data = json.loads(path.read_text())
        data['features'][1]['geometry']['coordinates'][0][0] = [999, 53]
        path.write_text(json.dumps(data))
        with self.assertRaises(CommandError): call_command('import_spots', path)
        self.assertEqual(ParkingSpot.objects.count(), 0)

    def test_import_rolls_back_database_error(self):
        original = ParkingSpot.objects.update_or_create
        def fail(*args, **kw):
            if kw['code'] == 'b': raise RuntimeError('simulated database failure')
            return original(*args, **kw)
        with patch.object(ParkingSpot.objects, 'update_or_create', side_effect=fail):
            with self.assertRaises(RuntimeError): call_command('import_spots', self.geo(['a', 'b']))
        self.assertEqual(ParkingSpot.objects.count(), 0)

    def test_dry_run_and_legacy_geometry_guard(self):
        path = self.geo(['z1:0'])
        call_command('import_spots', path, dry_run=True)
        self.assertFalse(ParkingSpot.objects.exists())
        ParkingSpot.objects.create(code='spot-1', geometry=G)
        with self.assertRaises(CommandError): call_command('import_spots', path)
        self.assertEqual(ParkingSpot.objects.count(), 1)

    def test_remap_preserves_everything_except_code_and_supports_swaps(self):
        a = ParkingSpot.objects.create(code='spot-1', block='old-zone', geometry=G, is_occupied=True)
        b = ParkingSpot.objects.create(code='spot-2', geometry=G)
        now = timezone.localtime()
        observation = SpotObservation.objects.create(spot=a, is_occupied=True)
        stat = SpotHourStat.objects.create(spot=a, date=now.date(), weekday=now.isoweekday(), hour=now.hour, total=7, free=3)
        before = dict(ParkingSpot.objects.filter(pk=a.pk).values().get())
        path = self.table([['spot-1', 'spot-2', geometry_hash(G)], ['spot-2', 'spot-1', geometry_hash(G)]])
        call_command('remap_spot_codes', path, dry_run=True)
        a.refresh_from_db(); self.assertEqual(a.code, 'spot-1')
        call_command('remap_spot_codes', path)
        after = dict(ParkingSpot.objects.filter(pk=a.pk).values().get()); after['code'] = before['code']
        self.assertEqual(before, after)
        observation.refresh_from_db(); stat.refresh_from_db()
        self.assertEqual(observation.spot_id, a.pk); self.assertEqual(stat.spot_id, a.pk)
        self.assertEqual((stat.total, stat.free), (7, 3))
        self.assertEqual(ParkingSpot.objects.get(code='spot-1').pk, b.pk)

    def test_bad_tables_never_partially_remap(self):
        a = ParkingSpot.objects.create(code='spot-1', geometry=G)
        ParkingSpot.objects.create(code='taken', geometry=G)
        h = geometry_hash(G)
        for rows in [ [['spot-1','new',h],['missing','other',h]], [['spot-1','taken',h]], [['spot-1','new',h],['spot-1','other',h]], [['spot-1','new','0'*64]], [['spot-1','new',h],['taken','new',h]] ]:
            with self.assertRaises(CommandError): call_command('remap_spot_codes', self.table(rows))
            a.refresh_from_db(); self.assertEqual(a.code, 'spot-1')
        self.assertEqual(ParkingSpot.objects.count(), 2)

    def test_remap_database_failure_rolls_back_temporary_codes(self):
        a = ParkingSpot.objects.create(code='spot-1', geometry=G)
        from django.db.models.query import QuerySet
        original = QuerySet.update
        def fail(qs, **kwargs):
            if kwargs.get('code') == 'new': raise RuntimeError('simulated failure')
            return original(qs, **kwargs)
        with patch.object(QuerySet, 'update', fail):
            with self.assertRaises(RuntimeError): call_command('remap_spot_codes', self.table([['spot-1','new',geometry_hash(G)]]))
        a.refresh_from_db(); self.assertEqual(a.code, 'spot-1')

    def test_status_uses_exact_id_and_geojson_round_trips(self):
        a = ParkingSpot.objects.create(code='z1:0', block='zone-b', geometry=G)
        b = ParkingSpot.objects.create(code='z1:1', block='zone-b', geometry=G)
        response = self.client.post('/api/spots/z1:0/status/', data=json.dumps({'is_occupied': True}), content_type='application/json')
        self.assertEqual(response.status_code, 200); self.assertEqual(response.json()['id'], a.code)
        b.refresh_from_db(); self.assertIsNone(b.is_occupied)
        self.assertEqual(list(SpotObservation.objects.values_list('spot_id', flat=True)), [a.pk])
        self.assertEqual(list(SpotHourStat.objects.values_list('spot_id', flat=True)), [a.pk])
        data = self.client.get('/api/spots/').json()
        for f in data['features']:
            self.assertEqual(f['properties']['id'], f['properties']['code'])
            self.assertEqual(f['properties']['zone'], 'zone-b')
        path = self.path / 'export.json'; path.write_text(json.dumps(data)); call_command('import_spots', path)
        self.assertEqual(ParkingSpot.objects.count(), 2)


class CheckedInMappingTests(TestCase):
    def test_partial_mapping_is_explicit_and_consistent(self):
        root = Path(__file__).resolve().parent.parent
        features = json.loads((root / 'main/data/spots.geojson').read_text())['features']
        report = json.loads((root / 'docs/spot-ids/matching-review.json').read_text())
        baseline = json.loads((root / 'docs/spot-ids/frontend-baseline.json').read_text())
        table = list(csv.DictReader((root / 'docs/spot-ids/code-map-confirmed.csv').open()))
        self.assertEqual(len(features), 734)
        self.assertEqual({r['id'] for r in report}, {b['id'] for b in baseline})
        self.assertEqual(len({r['id'] for r in report}), 734)
        self.assertEqual(len({r['old_code'] for r in report}), 734)
        self.assertEqual(len(table), 434)
        by_old = {r['old_code']:r for r in table}
        for i, (f, r) in enumerate(zip(features, report), 1):
            self.assertEqual(r['old_code'], f'spot-{i}')
            self.assertEqual(r['geometry_sha256'], geometry_hash(f['geometry']))
            if r['status'] == 'confirmed':
                self.assertEqual(f['properties']['id'], r['id'])
                self.assertEqual(f['properties']['zone'], r['zone'])
                self.assertEqual(by_old[r['old_code']]['new_code'], r['id'])
            else:
                self.assertNotIn('id', f['properties'])
                self.assertNotIn(r['old_code'], by_old)
