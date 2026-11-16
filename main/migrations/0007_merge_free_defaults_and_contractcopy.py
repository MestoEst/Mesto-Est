from django.db import migrations, models


def normalize_unknown_statuses(apps, schema_editor):
    ParkingSpot = apps.get_model("main", "ParkingSpot")
    database = schema_editor.connection.alias

    ParkingSpot.objects.using(database).filter(
        is_occupied__isnull=True
    ).update(is_occupied=False)


class Migration(migrations.Migration):
    dependencies = [
        ("main", "0006_free_defaults_and_global_zones"),
        ("main", "0006_free_by_default_contractcopy"),
    ]

    operations = [
        migrations.RunPython(
            normalize_unknown_statuses,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="parkingspot",
            name="is_occupied",
            field=models.BooleanField(default=False),
        ),
    ]