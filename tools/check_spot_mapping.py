"""Reproduce the geometry audit without changing source data.
Dependencies: pip install scipy shapely
Run: python tools/check_spot_mapping.py --output work/recomputed-review.json
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy.optimize import linear_sum_assignment
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    front = json.loads((ROOT / 'docs/spot-ids/frontend-baseline.json').read_text())
    features = json.loads((ROOT / 'main/data/spots.geojson').read_text())['features']
    def polygon(coords):
        return Polygon([((x - 27.66)*65450, (y - 53.95)*111320) for x, y in coords])
    source = [polygon(f['geometry']['coordinates'][0]) for f in features]
    target = [polygon(b['poly']) for b in front]
    distances = np.array([[a.centroid.distance(b.centroid) for b in target] for a in source])
    overlaps = np.array([[a.intersection(b).area/a.union(b).area if a.distance(b) < .1 else 0 for b in target] for a in source])
    costs = distances + 3*(1-overlaps)
    src, dst = linear_sum_assignment(costs)
    if len(src) != len(source) or len(dst) != len(target):
        raise ValueError('Размеры наборов различаются: полное соответствие невозможно')
    matches = []
    bad_rows = set()
    for i, j in zip(src, dst):
        candidates = np.argsort(costs[i])[:3]
        margin = min(costs[i,k] for k in range(len(target)) if k != j)-costs[i,j]
        if distances[i,j] > 1.5 or overlaps[i,j] < .4 or margin < 1:
            bad_rows.add(front[j]['fi'])
        matches.append((int(i),int(j),float(margin),list(map(int,candidates))))
    # Propagate uncertainty to neighboring candidate rows, never force a displaced match.
    while True:
        previous = bad_rows.copy()
        for i,j,margin,candidates in matches:
            if front[j]['fi'] in bad_rows:
                bad_rows.update(front[k]['fi'] for k in candidates if distances[i,k] < 2)
        if bad_rows == previous:
            break
    report = []
    for i,j,margin,candidates in matches:
        g = features[i]['geometry']
        report.append(dict(old_code=f'spot-{i+1}', id=front[j]['id'], zone=front[j]['zone'], row=front[j]['fi'],
                           status='review' if front[j]['fi'] in bad_rows else 'confirmed',
                           center=[source[i].centroid.x/65450+27.66, source[i].centroid.y/111320+53.95],
                           distance=round(float(distances[i,j]),3), iou=round(float(overlaps[i,j]),3), margin=round(margin,3),
                           geometry_sha256=hashlib.sha256(json.dumps(g,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
                           candidates=[dict(id=front[k]['id'],distance=round(float(distances[i,k]),3),iou=round(float(overlaps[i,k]),3),center=front[k]['c']) for k in candidates]))
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(f"confirmed={sum(r['status']=='confirmed' for r in report)} review={sum(r['status']=='review' for r in report)}")


if __name__ == '__main__':
    main()
