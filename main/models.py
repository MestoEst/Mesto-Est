from django.db import models
from django.utils import timezone
from django.conf import settings

class ParkingSpot(models.Model):
    code = models.CharField(max_length=50, unique=True)
    block = models.CharField(max_length=50, blank=True)
    geometry = models.JSONField()
    is_occupied = models.BooleanField(null=True)
    status_updated_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.code


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
