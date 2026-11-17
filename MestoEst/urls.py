from django.contrib import admin
from django.urls import path, include
from main.views import page_not_found

# Обязательные импорты для работы статики, которые нужно добавить:
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('main.urls')),
]


