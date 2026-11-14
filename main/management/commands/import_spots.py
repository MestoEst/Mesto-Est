from django.core.management.base import BaseCommand
from django.db import transaction
from main.spot_identity import read_geojson
from main.spot_import import preflight, write_records


class Command(BaseCommand):
    help = 'Атомарное обновление канонических мест (архивные наборы не допускаются)'

    def add_arguments(self, parser):
        parser.add_argument('path')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        zones, records = read_geojson(opts['path'])
        with transaction.atomic():
            preflight(zones,records)
            if not opts['dry_run']: write_records(zones,records)
        self.stdout.write(self.style.SUCCESS(f"{'Проверено' if opts['dry_run'] else 'Загружено'} мест: {len(records)}; зон: {len(zones)}"))
