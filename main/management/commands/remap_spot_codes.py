import csv
import re
import uuid
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from main.models import ParkingSpot
from main.spot_identity import identity, geometry_hash


class Command(BaseCommand):
    help = 'Изменить только code существующих мест по проверенному CSV, сохраняя PK и связи'

    def add_arguments(self, parser):
        parser.add_argument('path')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        try:
            with open(opts['path'], newline='', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                if reader.fieldnames != ['old_code', 'new_code', 'geometry_sha256']:
                    raise CommandError('Нужны столбцы old_code,new_code,geometry_sha256')
                rows = list(reader)
        except (OSError, csv.Error) as exc:
            raise CommandError(str(exc)) from exc
        if not rows:
            raise CommandError('Пустая таблица')
        old, new = set(), set()
        for row in rows:
            a = identity(row.get('old_code'), 'old_code'); b = identity(row.get('new_code'), 'new_code')
            if a in old or b in new:
                raise CommandError('Повтор old_code или new_code')
            old.add(a); new.add(b)
            if not re.fullmatch('[0-9a-f]{64}', row.get('geometry_sha256') or ''):
                raise CommandError(f'{a}: неверный SHA256 геометрии')
        with transaction.atomic():
            spots = {s.code: s for s in ParkingSpot.objects.select_for_update().all()}
            missing = old - spots.keys()
            conflicts = (new & spots.keys()) - old
            if missing or conflicts:
                raise CommandError(f'Отсутствуют: {sorted(missing)}; заняты новые code: {sorted(conflicts)}')
            for row in rows:
                if geometry_hash(spots[row['old_code']].geometry) != row['geometry_sha256']:
                    raise CommandError(f"{row['old_code']}: геометрия отличается от проверенной таблицы")
            if not opts['dry_run']:
                # Temporary codes also allow swaps without violating the unique constraint.
                temporary = set()
                for row in rows:
                    s = spots[row['old_code']]
                    while True:
                        code = '_remap_' + uuid.uuid4().hex
                        if code not in spots and code not in new and code not in temporary:
                            break
                    temporary.add(code)
                    ParkingSpot.objects.filter(pk=s.pk).update(code=code)
                for row in rows:
                    ParkingSpot.objects.filter(pk=spots[row['old_code']].pk).update(code=row['new_code'])
        self.stdout.write(self.style.SUCCESS(f"{'Проверено' if opts['dry_run'] else 'Перенесено'} мест: {len(rows)}"))
