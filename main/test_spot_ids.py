import copy
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from io import StringIO
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone
from main.models import ParkingSpot, SpotObservation, SpotHourStat, ParkingZone, SpotIdentity
from main.spot_identity import DATASET

ROOT=Path(__file__).resolve().parent.parent


class CanonicalSpotsTests(TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name)/'spots.geojson'
        self.data=json.loads((ROOT/'main/data/spots.geojson').read_text())

    def write(self,data=None):
        self.path.write_text(json.dumps(self.data if data is None else data));return self.path

    def small(self):
        d=copy.deepcopy(self.data);d['features']=d['features'][:3];return d

    def test_canonical_ids_and_geometry_export(self):
        self.assertEqual(len(self.data['features']),734);self.assertEqual(len(self.data['zones']),66)
        self.assertEqual(len({f['properties']['id'] for f in self.data['features']}),734)
        baseline=json.loads((ROOT/'docs/spot-ids/archive/frontend-baseline.json').read_text())
        self.assertEqual({b['id'] for b in baseline},{f['properties']['id'] for f in self.data['features']})
        call_command('import_spots',self.write(),dry_run=True)
        self.assertEqual(ParkingSpot.objects.count(),0)

    def test_roundtrip_api_database_canonical_and_reimport(self):
        call_command('import_spots',self.write());before=dict(ParkingSpot.objects.values_list('code','pk'))
        self.data['features'].reverse();self.data['zones'].reverse();call_command('import_spots',self.write())
        self.assertEqual(ParkingSpot.objects.count(),734)
        self.assertEqual(before,dict(ParkingSpot.objects.values_list('code','pk')))
        api=self.client.get('/api/spots/').json()
        self.assertEqual({f['properties']['id'] for f in api['features']},set(before))
        expected={f['properties']['id']:f for f in self.data['features']}
        for f in api['features']:
            source=expected[f['properties']['id']]
            self.assertEqual(f['geometry'],source['geometry'])
            for field in ['zone','display_number','display_order','row_id']:self.assertEqual(f['properties'][field],source['properties'][field])
            self.assertIsNone(f['properties']['is_occupied'])
        call_command('import_spots',self.write(api));self.assertEqual(ParkingSpot.objects.count(),734)

    def test_move_change_zone_and_add_does_not_change_id_or_history(self):
        d=self.small();call_command('import_spots',self.write(d));spot=ParkingSpot.objects.get(code=d['features'][0]['properties']['id'])
        SpotObservation.objects.create(spot=spot,is_occupied=True)
        f=d['features'][0];f['properties']['zone']=d['zones'][-1]['id'];f['geometry']['coordinates'][0]=[[x+.00001,y] for x,y in f['geometry']['coordinates'][0]]
        new=copy.deepcopy(d['features'][1]);new['properties'].update(id='new-uuid',display_number=99,display_order=99)
        d['features'].insert(1,new);d['features'].reverse();call_command('import_spots',self.write(d))
        after=ParkingSpot.objects.get(code=spot.code);self.assertEqual(spot.pk,after.pk);self.assertEqual(after.observations.count(),1)
        self.assertEqual(after.zone_id,d['zones'][-1]['id']);self.assertEqual(ParkingSpot.objects.count(),4)

    def test_omitted_records_are_not_removed(self):
        d=self.small();call_command('import_spots',self.write(d));d['features']=d['features'][:1]
        call_command('import_spots',self.write(d));self.assertEqual(ParkingSpot.objects.filter(is_active=True).count(),3)

    def test_invalid_last_object_is_atomic(self):
        valid=self.small();call_command('import_spots',self.write(valid));before=list(ParkingSpot.objects.values())
        for kind in ['missing','duplicate','zone','number','geometry','dataset','zone_order']:
            d=copy.deepcopy(valid);d['features'][0]['geometry']['coordinates'][0]=[[x+.001,y] for x,y in d['features'][0]['geometry']['coordinates'][0]]
            last=d['features'][-1]
            if kind=='missing':last['properties'].pop('id')
            if kind=='duplicate':last['properties']['id']=d['features'][0]['properties']['id']
            if kind=='zone':last['properties']['zone']='absent'
            if kind=='number':last['properties']['display_number']=d['features'][0]['properties']['display_number']
            if kind=='geometry':last['geometry']['coordinates'][0][0]=[999,53]
            if kind=='dataset':d['dataset']='legacy'
            if kind=='zone_order':d['zones'][-1]['display_order']=d['zones'][0]['display_order']
            with self.assertRaises(CommandError):call_command('import_spots',self.write(d))
            self.assertEqual(list(ParkingSpot.objects.values()),before)

    def test_database_failure_rolls_back_spots_zones_and_registry(self):
        original=ParkingSpot.objects.update_or_create
        fail_id=self.data['features'][1]['properties']['id']
        def fail(*a,**kw):
            if kw['code']==fail_id:raise RuntimeError('database failure')
            return original(*a,**kw)
        with patch.object(ParkingSpot.objects,'update_or_create',side_effect=fail):
            with self.assertRaises(RuntimeError):call_command('import_spots',self.write(self.small()))
        self.assertEqual(ParkingSpot.objects.count(),0);self.assertEqual(ParkingZone.objects.count(),0);self.assertEqual(SpotIdentity.objects.count(),0)

    def test_retired_or_deleted_ids_cannot_be_reused(self):
        d=self.small();call_command('import_spots',self.write(d));code=d['features'][0]['properties']['id']
        call_command('retire_spot',code,dry_run=True);self.assertTrue(ParkingSpot.objects.get(code=code).is_active)
        call_command('retire_spot',code)
        with self.assertRaises(CommandError):call_command('import_spots',self.write(d))
        ParkingSpot.objects.get(code=code).delete()
        with self.assertRaises(CommandError):call_command('import_spots',self.write(d))

    def test_uuid_reservation(self):
        out=StringIO();call_command('new_spot_id',stdout=out);code=out.getvalue().strip()
        self.assertFalse(SpotIdentity.objects.get(code=code).used)
        d=self.small();d['features'][0]['properties']['id']=code;call_command('import_spots',self.write(d))
        self.assertTrue(SpotIdentity.objects.get(code=code).used)

    def test_code_collision_never_exposes_or_updates_legacy_history(self):
        d=self.small();code=d['features'][0]['properties']['id'];g=d['features'][0]['geometry']
        old=ParkingSpot.objects.create(code=code,geometry=g)
        observation=SpotObservation.objects.create(spot=old,is_occupied=True)
        with self.assertRaises(CommandError):call_command('import_spots',self.write(d))
        call_command('transition_spots',self.write(d),dry_run=True)
        old.refresh_from_db();self.assertTrue(old.is_active);self.assertEqual(ParkingSpot.objects.count(),1)
        # simulate explicitly archived legacy record, as transition does, without matching it
        old.is_active=False;old.save(update_fields=['is_active']);call_command('import_spots',self.write(d))
        new=ParkingSpot.objects.get(dataset=DATASET,code=code);self.assertNotEqual(new.pk,old.pk)
        self.assertEqual(new.observations.count(),0);observation.refresh_from_db();self.assertEqual(observation.spot_id,old.pk)
        self.assertEqual(len(self.client.get('/api/spots/').json()['features']),3)

    def test_exact_status_persists_after_reload_and_leaves_neighbor_unknown(self):
        d=self.small();call_command('import_spots',self.write(d));code=d['features'][0]['properties']['id']
        self.assertEqual(self.client.post(f'/api/spots/{code}/status/',data=json.dumps({'is_occupied':True}),content_type='application/json').status_code,200)
        api=self.client.get('/api/spots/').json();by={f['properties']['id']:f['properties'] for f in api['features']}
        self.assertTrue(by[code]['is_occupied']);self.assertIsNone(by[d['features'][1]['properties']['id']]['is_occupied'])
        spot=ParkingSpot.objects.get(dataset=DATASET,code=code);self.assertEqual(spot.observations.count(),1);self.assertEqual(spot.hour_stats.get().total,1)
        call_command('import_spots',self.write(d));spot.refresh_from_db();self.assertTrue(spot.is_occupied)
        self.assertEqual(self.client.post('/api/spots/absent/status/',data='{"is_occupied":true}',content_type='application/json').status_code,404)

    def test_archives_and_old_remap_cannot_be_applied(self):
        with self.assertRaises(CommandError):call_command('import_spots',ROOT/'main/data/archive/spots-satellite-original.geojson')
        with self.assertRaises(CommandError):call_command('remap_spot_codes',ROOT/'docs/spot-ids/archive/code-map-confirmed.csv')
        self.assertEqual(ParkingSpot.objects.count(),0)
