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

    # Страницы сайта. Все отдают одно и то же приложение (mesto_prototype.html),
    # а какой раздел открыть, решает адрес (см. static/js/core/app.js, блок «адреса страниц»).
    path("", RedirectView.as_view(url="/map", permanent=False), name="home"),
    re_path(r"^(?P<page>map|rent|offer|account|login|register)/?$", views.app_page, name="page"),
    re_path(r"^docs/(?P<doc>terms|offer|privacy|contract)/?$", views.app_page, name="doc"),
]
