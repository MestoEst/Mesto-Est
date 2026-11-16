import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


def free_by_default(apps, schema_editor):
    """Места без данных считаются свободными: старые записи с is_occupied = NULL становятся «свободно»."""
    ParkingSpot = apps.get_model('main', 'ParkingSpot')
    ParkingSpot.objects.filter(is_occupied__isnull=True).update(is_occupied=False)


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0005_parkingspot_appearance_parkingzone_appearance'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='parkingspot',
            name='is_occupied',
            field=models.BooleanField(default=False, null=True),
        ),
        migrations.RunPython(free_by_default, migrations.RunPython.noop),
        migrations.CreateModel(
            name='ContractCopy',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('booking_ref', models.CharField(db_index=True, max_length=50)),
                ('title', models.CharField(max_length=200)),
                ('place', models.CharField(blank=True, max_length=100)),
                ('owner_name', models.CharField(blank=True, max_length=200)),
                ('when_text', models.CharField(blank=True, max_length=200)),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('signature', models.TextField(blank=True)),
                ('emailed_to', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='contract_copies', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
