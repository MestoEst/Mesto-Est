from django.contrib import admin
from django.utils import timezone
from django.urls import reverse
from django.utils.html import format_html, format_html_join
from django import forms

from .models import (
    ContractCopy,
    OwnerDocument,
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


class UserProfileAdminForm(forms.ModelForm):
    class Meta:
        model = UserProfile
        fields = "__all__"

    def clean(self):
        cleaned_data = super().clean()

        owner_status = cleaned_data.get("owner_status")
        reject_reason = cleaned_data.get("reject_reason", "")

        if owner_status == "rejected" and not reject_reason.strip():
            self.add_error(
                "reject_reason",
                "Укажите причину отклонения заявки."
            )

        return cleaned_data

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    form = UserProfileAdminForm
    list_display = ("user", "phone", "is_owner", "owner_status")
    list_filter = ("is_owner", "owner_status")
    search_fields = ("user__email", "phone")


    readonly_fields = (
        "user",
        "patronymic",
        "phone",
        "owner_documents_display",
    )

    fieldsets = (
        ("Пользователь", {
            "fields": ("user", "patronymic", "phone"),
        }),
        ("Данные владельца", {
            "fields": (
                "is_owner",
                "owner_status",
                "parking",
                "addr",
                "place",
                "owner_submitted_at",
                "reject_reason",
                "owner_documents_display",
            ),
        }),
    )

    @admin.display(description="Документы владельца")
    def owner_documents_display(self, obj):
        if not obj or not obj.pk:
            return "Сначала сохраните профиль"

        documents = obj.user.owner_documents.all()

        if not documents.exists():
            return "Документы не загружены"

        return format_html_join(
            "",
            '<div><b>{}</b>: <a href="{}" target="_blank" '
            'rel="noopener noreferrer">Просмотреть</a></div>',
            (
                (
                    document.get_kind_display(),
                    reverse("owner_document_file", args=[document.pk]),
                )
                for document in documents
            ),
        )

@admin.register(OwnerDocument)
class OwnerDocumentAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "name", "size", "uploaded_at")
    list_filter = ("kind", "uploaded_at")
    search_fields = ("user__email", "name")
    readonly_fields = (
        "user",
        "kind",
        "name",
        "size",
        "uploaded_at",
        "file_link",
    )

    @admin.display(description="Файл")
    def file_link(self, obj):
        if not obj or not obj.pk or not obj.file:
            return "Файл отсутствует"

        return format_html(
            '<a href="{}" target="_blank" rel="noopener noreferrer">Просмотреть документ</a>',
            reverse("owner_document_file", args=[obj.pk]),
        )


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

