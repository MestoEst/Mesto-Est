from django.db import models
from django.utils import timezone
from django.conf import settings

class ParkingZone(models.Model):
    code = models.CharField(max_length=50, primary_key=True)
    name = models.CharField(max_length=100)
    display_number = models.PositiveIntegerField()
    display_order = models.PositiveIntegerField()
    street_id = models.CharField(max_length=50)
    street_name = models.CharField(max_length=100)


class SpotIdentity(models.Model):
    """Append-only registry: even a deleted ParkingSpot must never free an ID."""
    code = models.CharField(max_length=50, primary_key=True)
    used = models.BooleanField(default=False)


class ParkingSpot(models.Model):
    code = models.CharField(max_length=50)
    dataset = models.CharField(max_length=30, default='legacy')
    is_active = models.BooleanField(default=True)
    zone = models.ForeignKey(ParkingZone, null=True, blank=True, on_delete=models.PROTECT)
    display_number = models.PositiveIntegerField(null=True, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    row_id = models.CharField(max_length=50, blank=True)
    block = models.CharField(max_length=50, blank=True)
    geometry = models.JSONField()
    is_occupied = models.BooleanField(null=True)
    status_updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['dataset', 'code'], name='spot_dataset_code_unique')]

    def __str__(self):
        return f'{self.dataset}:{self.code}'


class SpotObservation(models.Model):
    spot = models.ForeignKey(ParkingSpot, on_delete=models.CASCADE,
                             related_name="observations")
    is_occupied = models.BooleanField()
    observed_at = models.DateTimeField(default=timezone.now, db_index=True)


class SpotHourStat(models.Model):
    spot = models.ForeignKey(ParkingSpot, on_delete=models.CASCADE,
                             related_name="hour_stats")
    date = models.DateField()
    weekday = models.PositiveSmallIntegerField()
    hour = models.PositiveSmallIntegerField()
    total = models.PositiveIntegerField(default=0)
    free = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("spot", "date", "hour")
        indexes = [models.Index(fields=["spot", "weekday", "hour"])]

    @property
    def free_percent(self):
        if self.total < 5:
            return None
        return round(100 * self.free / self.total)

class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile"
    )
    patronymic = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=30)
    user_agreement = models.BooleanField(default=False)
    privacy_policy = models.BooleanField(default=False)

    def __str__(self):
        return self.user.email
