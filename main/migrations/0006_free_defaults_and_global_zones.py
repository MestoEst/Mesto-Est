import re

from django.db import migrations, models


def normalize_existing_data(apps, schema_editor):
    ParkingSpot = apps.get_model("main", "ParkingSpot")
    ParkingZone = apps.get_model("main", "ParkingZone")
    database = schema_editor.connection.alias

    zones = list(ParkingZone.objects.using(database).all())
    assignments = []
    used_numbers = set()

    for zone in zones:
        match = re.fullmatch(r"z([1-9]\d*)", zone.code)

        if match is None:
            raise RuntimeError(
                f"Не удалось назначить номер зоне {zone.code!r}. "
                "Нужна явная таблица соответствия."
            )

        number = int(match.group(1))

        if number in used_numbers:
            raise RuntimeError(
                f"Повтор номера зоны при переносе: {number}"
            )

        used_numbers.add(number)
        assignments.append((zone.pk, number))

    ParkingSpot.objects.using(database).filter(
        is_occupied__isnull=True
    ).update(is_occupied=False)


    for zone_pk, number in assignments:
        ParkingZone.objects.using(database).filter(
            pk=zone_pk
        ).update(
            name=f"Зона {number}",
            display_number=number,
        )


class Migration(migrations.Migration):
    dependencies = [
        (
            "main",
            "0005_parkingspot_appearance_parkingzone_appearance",
        ),
    ]

    operations = [
        migrations.RunPython(
            normalize_existing_data,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="parkingspot",
            name="is_occupied",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name="parkingzone",
            name="name",
            field=models.CharField(max_length=100, unique=True),
        ),
        migrations.AlterField(
            model_name="parkingzone",
            name="display_number",
            field=models.PositiveIntegerField(unique=True),
        ),
    ]