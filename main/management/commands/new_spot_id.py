import uuid
from django.core.management.base import BaseCommand
from main.models import SpotIdentity


class Command(BaseCommand):
    help = 'Зарезервировать новый постоянный UUID места (реестр никогда не очищается)'

    def handle(self,*args,**opts):
        record = SpotIdentity.objects.create(code=str(uuid.uuid4()))
        self.stdout.write(record.code)
