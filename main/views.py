import json
from datetime import timedelta

from django.db.models import F, Sum
from django.http import JsonResponse, HttpResponseNotFound
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from django.template.loader import render_to_string
from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout

from .models import ParkingSpot, SpotObservation, SpotHourStat

DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

WINDOW_DAYS = 56
MIN_SAMPLES = 5

def index(request):
    return render(request, 'layout.html')



def percent(total, free):
    """Процент свободных замеров или None, если данных мало."""
    if not total or total < MIN_SAMPLES:
        return None
    return round(100 * free / total)


def window_stats(**filters):
    """Суммы замеров по (место, день недели, час) за последние WINDOW_DAYS дней."""
    since = timezone.localdate() - timedelta(days=WINDOW_DAYS)
    return (SpotHourStat.objects
            .filter(date__gte=since, **filters)
            .values("spot_id", "weekday", "hour")
            .annotate(t=Sum("total"), f=Sum("free")))


@require_GET
def spots_geojson(request):
    """Все места в формате GeoJSON + текущий статус."""
    now = timezone.localtime()
    stats = {r["spot_id"]: percent(r["t"], r["f"])
             for r in window_stats(weekday=now.isoweekday(), hour=now.hour)}
    features = []
    for s in ParkingSpot.objects.all():
        features.append({
            "type": "Feature",
            "geometry": s.geometry,
            "properties": {
                "code": s.code,
                "block": s.block,
                "is_occupied": s.is_occupied,
                "updated_at": s.status_updated_at,
                "usual_free_percent": stats.get(s.id),
            },
        })
    return JsonResponse({"type": "FeatureCollection", "features": features})


@csrf_exempt
@require_POST
def set_status(request, code):
    """Принять статус места (занято/свободно) и записать в историю."""
    spot = get_object_or_404(ParkingSpot, code=code)
    try:
        occupied = json.loads(request.body).get("is_occupied")
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({"error": "invalid JSON"}, status=400)
    if not isinstance(occupied, bool):
        return JsonResponse({"error": "is_occupied must be true or false"},
                            status=400)

    now = timezone.localtime()
    SpotObservation.objects.create(spot=spot, is_occupied=occupied)
    spot.is_occupied = occupied
    spot.status_updated_at = now
    spot.save(update_fields=["is_occupied", "status_updated_at"])

    stat, _ = SpotHourStat.objects.get_or_create(
        spot=spot, date=now.date(), hour=now.hour,
        defaults={"weekday": now.isoweekday()})
    SpotHourStat.objects.filter(pk=stat.pk).update(
        total=F("total") + 1,
        free=F("free") + (0 if occupied else 1),
    )
    return JsonResponse({"ok": True, "code": code, "is_occupied": occupied})


@require_GET
def spot_heatmap(request, code):
    """Матрица: строки = часы 0-23, столбцы = дни Пн-Вс, значения = % свободно."""
    spot = get_object_or_404(ParkingSpot, code=code)
    matrix = [[None] * 7 for _ in range(24)]
    for r in window_stats(spot=spot):
        matrix[r["hour"]][r["weekday"] - 1] = percent(r["t"], r["f"])
    return JsonResponse({"code": code, "days": DAYS,
                         "hours": list(range(24)), "matrix": matrix,
                         "window_days": WINDOW_DAYS})



def page_not_found(request, exception):
    return HttpResponseNotFound("<h1>Страница не найдена</h1>") #обработчик 404