from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'АРХИВ: перенос code по старой таблице больше не применяется'
    def add_arguments(self,parser):
        parser.add_argument('path',nargs='?');parser.add_argument('--dry-run',action='store_true')
    def handle(self,*args,**opts):
        raise CommandError('Геометрическое сопоставление отменено. Используйте transition_spots; история старых мест сохраняется отдельно.')
