from django.contrib import admin
from django.utils import timezone

from .models import (
    ContractCopy,
    ParkingSpot,
    ParkingZone,
    SpotHourStat,
    SpotObservation,
    UserProfile,
)


@admin.register(ParkingZone)
class ParkingZoneAdmin(admin.ModelAdmin):
    list_display = (
        "display_number",
        "name",
        "code",
        "street_name",
    )
    list_display_links = ("name",)
    list_filter = ("street_name",)
    search_fields = ("=code", "name", "street_name")
    ordering = ("display_number",)


@admin.register(ParkingSpot)
class ParkingSpotAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "zone",
        "display_number",
        "dataset",
        "is_active",
        "is_occupied",
        "status_updated_at",
    )
    list_filter = (
        "dataset",
        "is_active",
        ("zone", admin.RelatedOnlyFieldListFilter),
        "is_occupied",
    )
    list_editable = ("is_occupied",)
    search_fields = (
        "code",
        "=zone__code",
        "zone__name",
        "zone__street_name",
    )
    list_select_related = ("zone",)
    ordering = (
        "zone__display_number",
        "display_order",
        "code",
    )
    actions = ("mark_free", "mark_busy")

    def save_model(self, request, obj, form, change):
        if change and "is_occupied" in form.changed_data:
            obj.status_updated_at = timezone.now()

        super().save_model(request, obj, form, change)

    @admin.action(description="Отметить выбранные места свободными")
    def mark_free(self, request, queryset):
        queryset.update(
            is_occupied=False,
            status_updated_at=timezone.now(),
        )

    @admin.action(description="Отметить выбранные места занятыми")
    def mark_busy(self, request, queryset):
        queryset.update(
            is_occupied=True,
            status_updated_at=timezone.now(),
        )


@admin.register(SpotObservation)
class SpotObservationAdmin(admin.ModelAdmin):
    list_display = ("spot", "is_occupied", "observed_at")
    list_filter = ("is_occupied", "spot__block")


@admin.register(SpotHourStat)
class SpotHourStatAdmin(admin.ModelAdmin):
    list_display = ("spot", "weekday", "hour", "total", "free")
    list_filter = ("weekday", "hour")


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "patronymic", "phone")
    search_fields = ("user__email", "phone")


@admin.register(ContractCopy)
class ContractCopyAdmin(admin.ModelAdmin):
    list_display = (
        "booking_ref",
        "title",
        "user",
        "created_at",
        "emailed_to",
    )
    search_fields = ("booking_ref", "title")
    readonly_fields = ("signature",)