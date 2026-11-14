import json
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from main.models import ParkingSpot
from main.spot_identity import validate_geojson


class Command(BaseCommand):
    help = 'Импорт GeoJSON с обязательными properties.id и properties.zone'

    def add_arguments(self, parser):
        parser.add_argument('path')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        try:
            with open(opts['path'], encoding='utf-8') as f:
                records = validate_geojson(json.load(f))
        except (OSError, ValueError) as exc:
            raise CommandError(str(exc)) from exc
        with transaction.atomic():
            existing = list(ParkingSpot.objects.select_for_update().all())
            codes = {s.code for s in existing}
            # Do not silently create a second identity for an already imported polygon.
            for code, zone, geometry in records:
                if code not in codes and any(s.geometry == geometry for s in existing):
                    raise CommandError(f'{code}: геометрия уже есть под другим code; сначала выполните перенос')
            if not opts['dry_run']:
                for code, zone, geometry in records:
                    ParkingSpot.objects.update_or_create(code=code, defaults={'block': zone, 'geometry': geometry})
        self.stdout.write(self.style.SUCCESS(f"{'Проверено' if opts['dry_run'] else 'Загружено'} мест: {len(records)}"))
