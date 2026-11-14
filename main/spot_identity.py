"""Canonical GeoJSON contract. No coordinate/order-based identity assignment."""
import hashlib
import json
from django.core.management.base import CommandError
from shapely.geometry import shape

DATASET = 'canonical-v1'


def identity(value, label):
    if not isinstance(value, str) or not value.strip() or value != value.strip() or len(value) > 50:
        raise CommandError(f'{label}: нужна непустая строка до 50 символов без крайних пробелов')
    if any(c in value for c in '/?#') or any(ord(c) < 32 for c in value):
        raise CommandError(f'{label}: недопустимый символ')
    return value


def geometry_hash(geometry):
    return hashlib.sha256(json.dumps(geometry, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def positive(value, label):
    if type(value) is not int or value < 1:
        raise CommandError(f'{label}: нужно целое число больше нуля')
    return value


def validate_geojson(data):
    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection' or data.get('dataset') != DATASET:
        raise CommandError('Ожидается канонический FeatureCollection с dataset=canonical-v1; архивные файлы запрещены')
    if not isinstance(data.get('zones'), list) or not data['zones'] or not isinstance(data.get('features'), list) or not data['features']:
        raise CommandError('Нужны непустые zones и features')
    zones, numbers, orders = {}, set(), set()
    for z in data['zones']:
        if not isinstance(z, dict): raise CommandError('Некорректная зона')
        code = identity(z.get('id'), 'zone.id')
        n = positive(z.get('display_number'), code); order = positive(z.get('display_order'), code)
        if code in zones or n in numbers or order in orders:
            raise CommandError(f'Повтор ID, номера или порядка зоны: {code}')
        for field in ['name', 'street_id', 'street_name']:
            if not isinstance(z.get(field), str) or not z[field].strip() or len(z[field]) > (50 if field == 'street_id' else 100):
                raise CommandError(f'{code}: неверное поле {field}')
        zones[code] = z; numbers.add(n); orders.add(order)
    seen, numbers, orders, records = set(), set(), set(), []
    for i, f in enumerate(data['features'], 1):
        if not isinstance(f, dict) or f.get('type') != 'Feature' or not isinstance(f.get('properties'), dict):
            raise CommandError(f'Объект {i}: ожидается Feature с properties')
        pr = f['properties']; code = identity(pr.get('id'), f'Объект {i}, id')
        zone = identity(pr.get('zone'), f'{code}, zone')
        if code in seen or zone not in zones:
            raise CommandError(f'{code}: повтор ID или неизвестная зона {zone}')
        if ('code' in pr and pr['code'] != code) or ('block' in pr and pr['block'] != zone):
            raise CommandError(f'{code}: code/id или block/zone расходятся')
        n = positive(pr.get('display_number'), code); order = positive(pr.get('display_order'), code)
        if (zone,n) in numbers or (zone,order) in orders:
            raise CommandError(f'{code}: повтор номера или порядка места в зоне')
        row = identity(pr.get('row_id'), f'{code}, row_id')
        g = f.get('geometry')
        try:
            if not isinstance(g, dict) or g.get('type') != 'Polygon': raise ValueError('нужен Polygon')
            rings = g['coordinates']
            if not rings: raise ValueError('пустой полигон')
            for ring in rings:
                if len(ring) < 4 or ring[0] != ring[-1] or any(a == b for a,b in zip(ring,ring[1:])): raise ValueError('незамкнутое кольцо')
                for p in ring:
                    if len(p) != 2 or any(type(v) not in (int,float) for v in p) or not -180 <= p[0] <= 180 or not -90 <= p[1] <= 90:
                        raise ValueError('неверные координаты')
            polygon = shape(g)
            if not polygon.is_valid or polygon.is_empty or polygon.area < 1e-14: raise ValueError('некорректный полигон')
        except (TypeError, KeyError, ValueError, IndexError) as exc:
            raise CommandError(f'{code}: некорректная геометрия ({exc})') from exc
        seen.add(code); numbers.add((zone,n)); orders.add((zone,order)); records.append((code,zone,n,order,row,g))
    return zones, records


def read_geojson(path):
    try:
        with open(path, encoding='utf-8') as f: return validate_geojson(json.load(f))
    except (OSError, ValueError) as exc:
        raise CommandError(str(exc)) from exc
