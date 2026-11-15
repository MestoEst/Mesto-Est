import base64
import binascii
import json
import logging
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import F, Sum
from django.http import JsonResponse, HttpResponseNotFound
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from django.template.loader import render_to_string
from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.db import transaction, IntegrityError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.conf import settings
from django.core.mail import EmailMessage

from .models import ParkingSpot, SpotObservation, SpotHourStat, UserProfile, ParkingZone, ContractCopy

from .spot_identity import DATASET

DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

WINDOW_DAYS = 56
MIN_SAMPLES = 5


@require_POST
def register(request):
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Некорректные данные"}, status=400)

    if not isinstance(data, dict):
        return JsonResponse({"error": "Некорректные данные"}, status=400)

    surname = data.get("surname", "")
    name = data.get("name", "")
    patronymic = data.get("patronymic", "")
    phone = data.get("phone", "")
    email = data.get("email", "")
    password = data.get("password", "")

    if not all(isinstance(value, str) for value in
               [surname, name, patronymic, phone, email, password]):
        return JsonResponse({"error": "Некорректные данные"}, status=400)

    surname = surname.strip()
    name = name.strip()
    patronymic = patronymic.strip()
    phone = phone.strip()
    email = email.strip().lower()

    if not surname or not name or not phone or not email:
        return JsonResponse({"error": "Заполните обязательные поля"}, status=400)

    if len(password) < 6:
        return JsonResponse(
            {"error": "Пароль должен содержать не менее 6 символов"},
            status=400
        )

    try:
        validate_email(email)
    except ValidationError:
        return JsonResponse({"error": "Проверьте электронную почту"}, status=400)

    User = get_user_model()

    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse(
            {"error": "Такая почта уже зарегистрирована"},
            status=409
        )

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=email,
                email=email,
                first_name=name,
                last_name=surname,
                password=password
            )

            UserProfile.objects.create(
                user=user,
                patronymic=patronymic,
                phone=phone
            )

        auth_login(request, user)

    except IntegrityError:
        return JsonResponse(
            {"error": "Такая почта уже зарегистрирована"},
            status=409
        )

    return JsonResponse({
        "id": user.id,
        "name": user.first_name,
        "surname": user.last_name,
        "patronymic": user.profile.patronymic,
        "phone": user.profile.phone,
        "email": user.email,
        "passport_set": False,
        "pid_masked": None,
        "passport_masked": None,
        "owner": None
    }, status=201)



def index(request):
    return render(request, 'layout.html')


@ensure_csrf_cookie
def app_page(request, **kwargs):
    """Любая страница сайта (/map, /rent, /offer, /account, /login, /register, /docs/...).
    Отдаёт приложение, нужный раздел открывает JS по адресу. Кука csrftoken нужна для POST-запросов API."""
    return render(request, 'mesto_prototype.html')



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
@transaction.atomic
def spots_geojson(request):
    """Все места в формате GeoJSON + текущий статус."""
    now = timezone.localtime()
    stats = {r["spot_id"]: percent(r["t"], r["f"])
             for r in window_stats(spot__dataset=DATASET, spot__is_active=True, weekday=now.isoweekday(), hour=now.hour)}
    features = []
    for s in ParkingSpot.objects.filter(dataset=DATASET, is_active=True).select_related("zone").order_by("zone__display_order", "display_order", "code"):
        features.append({
            "type": "Feature",
            "geometry": s.geometry,
            "properties": {
                "id": s.code,
                "zone": s.zone_id,
                "display_number": s.display_number,
                "display_order": s.display_order,
                "row_id": s.row_id,
                "appearance": s.appearance,
                "code": s.code,
                "block": s.block,
                "is_occupied": False if s.is_occupied is None else s.is_occupied,   # нет данных = свободно
                "updated_at": s.status_updated_at,
                "usual_free_percent": stats.get(s.id),
            },
        })
    zones = [{"id":z.code,"name":z.name,"display_number":z.display_number,
              "display_order":z.display_order,"street_id":z.street_id,"street_name":z.street_name,"appearance":z.appearance}
             for z in ParkingZone.objects.order_by("display_order", "code")]
    return JsonResponse({"type":"FeatureCollection", "dataset":DATASET,"zones":zones,"features":features})


@csrf_exempt
@require_POST
@transaction.atomic
def set_status(request, code):
    """Принять статус места (занято/свободно) и записать в историю."""
    spot = get_object_or_404(ParkingSpot.objects.select_for_update(), dataset=DATASET, is_active=True, code=code)
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
    return JsonResponse({"ok": True, "id": code, "code": code, "is_occupied": occupied})


@require_GET
def spot_heatmap(request, code):
    """Матрица: строки = часы 0-23, столбцы = дни Пн-Вс, значения = % свободно."""
    spot = get_object_or_404(ParkingSpot, dataset=DATASET, is_active=True, code=code)
    matrix = [[None] * 7 for _ in range(24)]
    for r in window_stats(spot=spot):
        matrix[r["hour"]][r["weekday"] - 1] = percent(r["t"], r["f"])
    return JsonResponse({"code": code, "days": DAYS,
                         "hours": list(range(24)), "matrix": matrix,
                         "window_days": WINDOW_DAYS})



def page_not_found(request, exception):
    return HttpResponseNotFound("<h1>Страница не найдена</h1>") #обработчик 404

@require_POST
def login(request):
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Некорректные данные"}, status=400)

    if not isinstance(data, dict):
        return JsonResponse({"error": "Некорректные данные"}, status=400)

    email = data.get("email", "")
    password = data.get("password", "")

    if not isinstance(email, str) or not isinstance(password, str):
        return JsonResponse({"error": "Некорректные данные"}, status=400)

    email = email.strip().lower()

    user_model = get_user_model()
    user = user_model.objects.filter(email__iexact=email).first()

    if user is None:
        return JsonResponse(
            {"error": "Неверная почта или пароль"},
            status=401
        )

    user = authenticate(request, username=user.username, password=password)

    if user is None:
        return JsonResponse(
            {"error": "Неверная почта или пароль"},
            status=401
        )

    auth_login(request, user)

    profile = user.profile

    return JsonResponse({
        "id": user.id,
        "name": user.first_name,
        "surname": user.last_name,
        "patronymic": profile.patronymic,
        "phone": profile.phone,
        "email": user.email,
        "passport_set": False,
        "pid_masked": None,
        "passport_masked": None,
        "owner": None
    })

@require_POST
def logout(request):
    auth_logout(request)
    return JsonResponse({}, status=204)

@require_GET
def me(request):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": "Пользователь не авторизован"},
            status=401
        )

    user = request.user
    profile = user.profile

    return JsonResponse({
        "id": user.id,
        "name": user.first_name,
        "surname": user.last_name,
        "patronymic": profile.patronymic,
        "phone": profile.phone,
        "email": user.email,
        "passport_set": False,
        "pid_masked": None,
        "passport_masked": None,
        "owner": None
    })


log = logging.getLogger(__name__)
MAX_SIGNATURE_CHARS = 400_000           # ~300 КБ картинки в base64


def owner_email_for(listing_id):
    """Почта владельца места по номеру объявления. Объявлений на сервере пока нет (флаг listings выключен),
    поэтому возвращаем None: владелец получит копию, когда появятся объявления и брони (docs/API.md, «Аренда»)."""
    return None


@require_POST
def contract_copy(request):
    """Принять договор с подписью, сохранить и выслать копию на почту человека (и владельца, когда его почта известна).
    Адресат берётся только из аккаунта на сервере, не из запроса: иначе через этот адрес можно было бы слать письма кому угодно."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Войдите в аккаунт"}, status=401)
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({"error": "invalid JSON"}, status=400)
    if not isinstance(data, dict):
        return JsonResponse({"error": "invalid JSON"}, status=400)

    title = str(data.get("title") or "").strip()[:200]
    booking_ref = str(data.get("booking_ref") or "").strip()[:50]
    if not title or not booking_ref:
        return JsonResponse({"error": "Не хватает данных договора"}, status=400)
    try:
        total = Decimal(str(data.get("total") or 0))
        if total < 0 or total > Decimal("99999.99"):
            raise InvalidOperation
    except InvalidOperation:
        return JsonResponse({"error": "Проверьте сумму договора"}, status=400)

    sig = data.get("signature")
    prefix = "data:image/png;base64,"
    if not isinstance(sig, str) or not sig.startswith(prefix) or len(sig) > MAX_SIGNATURE_CHARS:
        return JsonResponse({"error": "Поставьте подпись в окошке"}, status=400)
    try:
        png = base64.b64decode(sig[len(prefix):], validate=True)
    except (binascii.Error, ValueError):
        return JsonResponse({"error": "Подпись не читается"}, status=400)
    if not png.startswith(b"\x89PNG"):
        return JsonResponse({"error": "Подпись не читается"}, status=400)

    place = str(data.get("place") or "").strip()[:100]
    owner = str(data.get("owner") or "").strip()[:200]
    when_text = str(data.get("when_text") or "").strip()[:200]
    copy = ContractCopy.objects.create(
        booking_ref=booking_ref, user=request.user, title=title, place=place, owner_name=owner,
        when_text=when_text, total=total, signature=sig)

    recipients = [request.user.email] if request.user.email else []
    owner_email = owner_email_for(data.get("listing"))
    if owner_email:
        recipients.append(owner_email)
    sent = False
    if recipients:
        name = (request.user.get_full_name() or request.user.email).strip()
        body = (
            "Договор аренды парковочного места принят в приложении «Место есть».\n\n"
            f"Место: {title}" + (f", № {place}" if place else "") + "\n"
            f"Владелец: {owner or 'не указан'}\n"
            f"Пользователь: {name}\n"
            f"Срок: {when_text or 'не указан'}\n"
            f"Цена: {'бесплатно' if not total else str(total) + ' руб.'}\n\n"
            "Подпись пользователя во вложении (podpis.png)."
        )
        mail = EmailMessage(subject=f"Договор аренды места: {title}", body=body,
                            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None), to=recipients)
        mail.attach("podpis.png", png, "image/png")
        try:
            mail.send(fail_silently=False)
            sent = True
            copy.emailed_to = recipients
            copy.save(update_fields=["emailed_to"])
        except Exception:                       # письмо не ушло: договор и подпись всё равно сохранены
            log.exception("contract copy email failed for %s", booking_ref)
    return JsonResponse({"ok": True, "id": copy.id, "emailed": sent}, status=201)
