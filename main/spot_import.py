from django.core.management.base import CommandError
from main.models import ParkingSpot, ParkingZone, SpotIdentity
from main.spot_identity import DATASET


def preflight(zones, records, allow_legacy=False):
    existing = {s.code:s for s in ParkingSpot.objects.select_for_update().filter(dataset=DATASET)}
    if not allow_legacy and ParkingSpot.objects.exclude(dataset=DATASET).filter(is_active=True).exists():
        raise CommandError('Есть старые активные места. Нужна отдельная команда transition_spots с резервной копией')
    final_zones = {z.code:(z.display_number,z.display_order) for z in ParkingZone.objects.select_for_update().all()}
    final_zones.update({code:(z['display_number'],z['display_order']) for code,z in zones.items()})
    if len({p[0] for p in final_zones.values()}) != len(final_zones) or len({p[1] for p in final_zones.values()}) != len(final_zones):
        raise CommandError('Конфликт номера/порядка с сохраняемой зоной')
    registry = {r.code:r for r in SpotIdentity.objects.select_for_update().all()}
    # Validate the final union: omitted records stay, and may still own display numbers.
    final = {s.code:(s.zone_id,s.display_number,s.display_order) for s in existing.values() if s.is_active}
    for code,zone,n,order,row,g in records:
        spot = existing.get(code)
        if (spot and not spot.is_active) or (not spot and code in registry and registry[code].used):
            raise CommandError(f'{code}: ID уже использован/выведен из эксплуатации; повторное использование запрещено')
        final[code] = (zone,n,order)
    numbers, orders = set(), set()
    for code,(zone,n,order) in final.items():
        if (zone,n) in numbers or (zone,order) in orders:
            raise CommandError(f'{code}: конфликт номера/порядка с сохраняемым местом')
        numbers.add((zone,n)); orders.add((zone,order))


def write_records(zones, records):
    for code,z in zones.items():
        ParkingZone.objects.update_or_create(code=code, defaults={k:z[k] for k in ('name','display_number','display_order','street_id','street_name')})
    for code,zone,n,order,row,g in records:
        SpotIdentity.objects.update_or_create(code=code, defaults={'used':True})
        ParkingSpot.objects.update_or_create(dataset=DATASET,code=code, defaults={
            'zone_id':zone,'block':zone,'display_number':n,'display_order':order,'row_id':row,'geometry':g,
        })
