from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from main.models import ParkingSpot
from main.spot_identity import DATASET


class Command(BaseCommand):
    help = 'Явно вывести место из эксплуатации, сохранив ID, историю и статистику'

    def add_arguments(self,parser):
        parser.add_argument('id'); parser.add_argument('--dry-run',action='store_true')

    def handle(self,*args,**opts):
        with transaction.atomic():
            spot = ParkingSpot.objects.filter(dataset=DATASET,code=opts['id']).first()
            if not spot: raise CommandError('Место не найдено')
            if not opts['dry_run']:
                spot.is_active=False;spot.save(update_fields=['is_active'])
        self.stdout.write('Проверено' if opts['dry_run'] else 'Место выведено из эксплуатации; ID зарезервирован навсегда')
