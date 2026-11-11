from django.urls import path
from django.views.generic import TemplateView
from django.views.decorators.csrf import ensure_csrf_cookie

from . import views


urlpatterns = [
    path("api/spots/", views.spots_geojson),
    path("api/spots/<str:code>/status/", views.set_status),
    path("api/spots/<str:code>/heatmap/", views.spot_heatmap),
    path("", ensure_csrf_cookie(TemplateView.as_view(template_name="mesto_prototype.html"))),
    path('', views.index),
    path("api/auth/register/", views.register),
    path("api/auth/login/", views.login),
    path("api/auth/logout/", views.logout),
    path("api/me/", views.me),
]
