"""Explicit dataset switch. Never match legacy observations to canonical spots."""
from pathlib import Path
import sqlite3
from contextlib import closing
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction, connection
from main.models import ParkingSpot
from main.spot_identity import read_geojson, DATASET
from main.spot_import import preflight, write_records


class Command(BaseCommand):
    help = 'Архивировать старые места без удаления и загрузить новый набор; применять только после dry-run'

    def add_arguments(self, parser):
        parser.add_argument('path')
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--backup', help='Новый файл полной SQLite-копии; обязателен для применения')

    def check_links(self, legacy):
        for relation in ParkingSpot._meta.related_objects:
            if relation.related_model._meta.model_name in ('spotobservation','spothourstat'): continue
            field = relation.field.name
            if relation.related_model.objects.filter(**{f'{field}__in':legacy}).exists():
                raise CommandError(f'Переход заблокирован: связанные {relation.related_model._meta.label} (объявления/брони требуют отдельного решения)')

    def inspect(self, zones,records):
        legacy = ParkingSpot.objects.select_for_update().exclude(dataset=DATASET)
        self.check_links(legacy)
        preflight(zones,records,allow_legacy=True)
        codes = {r[0] for r in records}
        collision_codes = list(legacy.filter(code__in=codes).values_list('code',flat=True))
        collisions = len(collision_codes)
        if collision_codes: self.stdout.write('Совпадающие code (разные наборы и PK): '+', '.join(collision_codes))
        self.stdout.write(f'Старых мест: {legacy.count()}; совпадений code: {collisions}; новых мест в файле: {len(records)}. История не переносится.')

    def handle(self,*args,**opts):
        zones,records = read_geojson(opts['path'])
        with transaction.atomic(): self.inspect(zones,records)
        if opts['dry_run']:
            self.stdout.write('Dry-run: база и резервные копии не изменены'); return
        if not opts['backup']: raise CommandError('Для применения укажите --backup с новым путём полной резервной копии')
        if connection.vendor != 'sqlite':
            raise CommandError('Автоматический переход реализован только для SQLite. Для другой СУБД требуется отдельная процедура backup/restore')
        destination = Path(opts['backup']).resolve()
        source = Path(connection.settings_dict['NAME']).resolve()
        if destination == source or destination.exists(): raise CommandError('Резервная копия должна быть новым файлом вне исходной базы')
        try:
            # SQLite backup API yields a consistent complete snapshot, including unrelated tables.
            with destination.open('xb'): pass
            with closing(sqlite3.connect(f'file:{source}?mode=ro',uri=True)) as src:
                with closing(sqlite3.connect(destination)) as dst:
                    src.backup(dst)
                    if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise CommandError('Ошибка проверки резервной копии')
        except (OSError,sqlite3.Error) as exc: raise CommandError(str(exc)) from exc
        with transaction.atomic():
            self.inspect(zones,records)  # repeat all checks after backup, before any mutation
            ParkingSpot.objects.exclude(dataset=DATASET).update(is_active=False)
            write_records(zones,records)
        self.stdout.write(self.style.SUCCESS(f'Новый набор загружен. Старые PK и связи сохранены. Полная копия: {destination}'))
