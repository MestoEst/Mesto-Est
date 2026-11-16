from django.core.management.base import CommandError
from main.models import ParkingSpot, ParkingZone, SpotIdentity
from main.spot_identity import DATASET


def preflight(zones, records, allow_legacy=False):
    existing = {s.code:s for s in ParkingSpot.objects.select_for_update().filter(dataset=DATASET)}
    if not allow_legacy and ParkingSpot.objects.exclude(dataset=DATASET).filter(is_active=True).exists():
        raise CommandError('Есть старые активные места. Нужна отдельная команда transition_spots с резервной копией')
    final_zones = {
        zone.code: (
            zone.display_number,
            zone.display_order,
            zone.name,
        )
        for zone in ParkingZone.objects.select_for_update().all()
    }

    final_zones.update({
        code: (
            zone["display_number"],
            zone["display_order"],
            zone["name"],
        )
        for code, zone in zones.items()
    })

    numbers = [value[0] for value in final_zones.values()]
    orders = [value[1] for value in final_zones.values()]
    names = [value[2] for value in final_zones.values()]

    if len(numbers) != len(set(numbers)):
        raise CommandError(
            "Номер зоны конфликтует с зоной, сохраняемой в базе"
        )

    if len(orders) != len(set(orders)):
        raise CommandError(
            "Порядок зоны конфликтует с зоной, сохраняемой в базе"
        )

    if len(names) != len(set(names)):
        raise CommandError(
            "Название зоны конфликтует с зоной, сохраняемой в базе"
        )
    registry = {r.code:r for r in SpotIdentity.objects.select_for_update().all()}
    # Validate the final union: omitted records stay, and may still own display numbers.
    final = {s.code:(s.zone_id,s.display_number,s.display_order) for s in existing.values() if s.is_active}
    for code,zone,n,order,row,g,appearance in records:
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
        ParkingZone.objects.update_or_create(code=code, defaults={**{k:z[k] for k in ('name','display_number','display_order','street_id','street_name')},'appearance':z.get('appearance',{})})
    for code,zone,n,order,row,g,appearance in records:
        SpotIdentity.objects.update_or_create(code=code, defaults={'used':True})
        ParkingSpot.objects.update_or_create(dataset=DATASET,code=code, defaults={
            'zone_id':zone,'block':zone,'display_number':n,'display_order':order,'row_id':row,'geometry':g,'appearance':appearance,
        })
