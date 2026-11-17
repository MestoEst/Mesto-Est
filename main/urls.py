from django.urls import path, re_path
from django.views.generic import RedirectView

from . import views

urlpatterns = [
    # API
    path("api/spots/", views.spots_geojson),
    path("api/spots/<str:code>/status/", views.set_status),
    path("api/spots/<str:code>/heatmap/", views.spot_heatmap),
    path("api/auth/register/", views.register),
    path("api/auth/login/", views.login),
    path("api/auth/logout/", views.logout),
    path("api/me/", views.me),
    path("api/me/owner/", views.owner_detail),
    path("api/me/owner/documents/", views.owner_document_upload),
    path("api/me/owner/documents/<int:document_id>/", views.owner_document_delete),
    path("api/me/owner/submit/", views.owner_submit),
    path("api/contracts/", views.contract_copy),

    # Страницы сайта. Все отдают одно и то же приложение (mesto_prototype.html),
    # а какой раздел открыть, решает адрес (см. static/js/core/app.js, блок «адреса страниц»).
    path("", RedirectView.as_view(url="/map", permanent=False), name="home"),
    path(
        "staff/owner-documents/<int:document_id>/file/",
        views.owner_document_file,
        name="owner_document_file",
    ),
    re_path(r"^(?P<page>map|rent|offer|account|login|register)/?$", views.app_page, name="page"),
    re_path(r"^docs/(?P<doc>terms|offer|privacy|contract)/?$", views.app_page, name="doc"),
]
