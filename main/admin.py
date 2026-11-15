from django.contrib import admin
from django.utils import timezone
from .models import ParkingSpot, SpotObservation, SpotHourStat, UserProfile, ContractCopy


@admin.register(ParkingSpot)
class ParkingSpotAdmin(admin.ModelAdmin):
    list_display = ("code", "dataset", "is_active", "block", "display_number", "is_occupied", "status_updated_at")
    list_filter = ("dataset", "is_active", "block", "is_occupied")
    list_editable = ("is_occupied",)        # статус меняется прямо в списке: на сайте цвет места сменится после обновления карты
    search_fields = ("code",)
    actions = ("mark_free", "mark_busy")

    def save_model(self, request, obj, form, change):
        if change and "is_occupied" in form.changed_data:
            obj.status_updated_at = timezone.now()
        super().save_model(request, obj, form, change)

    @admin.action(description="Отметить выбранные места свободными")
    def mark_free(self, request, queryset):
        queryset.update(is_occupied=False, status_updated_at=timezone.now())

    @admin.action(description="Отметить выбранные места занятыми")
    def mark_busy(self, request, queryset):
        queryset.update(is_occupied=True, status_updated_at=timezone.now())


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
    list_display = ("booking_ref", "title", "user", "created_at", "emailed_to")
    search_fields = ("booking_ref", "title")
    readonly_fields = ("signature",)
