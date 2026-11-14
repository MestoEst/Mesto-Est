"""Общий контракт GeoJSON и проверка геометрии перед переносом code."""
import hashlib
import json
import math
from django.core.management.base import CommandError


def identity(value, label):
    if not isinstance(value, str) or not value.strip() or value != value.strip() or len(value) > 50:
        raise CommandError(f'{label}: нужна непустая строка до 50 символов без крайних пробелов')
    if any(c in value for c in '/?#') or any(ord(c) < 32 for c in value):
        raise CommandError(f'{label}: недопустимый символ')
    return value


def geometry_hash(geometry):
    return hashlib.sha256(json.dumps(geometry, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def validate_geojson(data):
    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list) or not data['features']:
        raise CommandError('Ожидается непустой FeatureCollection')
    result, seen = [], set()
    for i, f in enumerate(data['features'], 1):
        if not isinstance(f, dict) or f.get('type') != 'Feature' or not isinstance(f.get('properties'), dict):
            raise CommandError(f'Объект {i}: ожидается Feature с properties')
        pr = f['properties']; code = identity(pr.get('id'), f'Объект {i}, id')
        zone = identity(pr.get('zone'), f'Объект {i}, zone')
        if code in seen:
            raise CommandError(f'Повторяющийся id: {code}')
        if ('code' in pr and pr['code'] != code) or ('block' in pr and pr['block'] != zone):
            raise CommandError(f'{code}: code/id или block/zone расходятся')
        seen.add(code)
        g = f.get('geometry')
        if not isinstance(g, dict) or g.get('type') != 'Polygon' or not isinstance(g.get('coordinates'), list) or not g['coordinates']:
            raise CommandError(f'{code}: ожидается Polygon')
        for ring in g['coordinates']:
            if not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1]:
                raise CommandError(f'{code}: кольцо должно быть замкнуто')
            for point in ring:
                if not isinstance(point, list) or len(point) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in point) or not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90:
                    raise CommandError(f'{code}: неверные координаты')
            if abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring, ring[1:]))) < 1e-14:
                raise CommandError(f'{code}: нулевая площадь')
        result.append((code, zone, g))
    return result
