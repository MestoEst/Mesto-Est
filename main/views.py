import base64
import binascii
import json
import logging
import os
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import F, Sum
from django.http import JsonResponse, HttpResponseNotFound, HttpResponse, FileResponse
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST, require_http_methods
from django.template.loader import render_to_string
from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.db import transaction, IntegrityError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.conf import settings
from django.core.mail import EmailMessage
from django.core.files.storage import default_storage
from django.contrib.admin.views.decorators import staff_member_required
from .models import (
    ParkingSpot,
    SpotObservation,
    SpotHourStat,
    UserProfile,
    ParkingZone,
    ContractCopy,
    OwnerDocument,
)

from .spot_identity import DATASET

DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

WINDOW_DAYS = 56
MIN_SAMPLES = 5

def owner_payload(profile):
    submitted_at = profile.owner_submitted_at

    return {
        "is_owner": profile.is_owner,
        "status": profile.owner_status,
        "parking": profile.parking,
        "addr": profile.addr,
        "place": profile.place,
        "reject_reason": profile.reject_reason,
        "submitted_at": (
            timezone.localtime(submitted_at).strftime("%d.%m %H:%M")
            if submitted_at else ""
        ),
        "documents": [
            {
                "id": doc.id,
                "kind": doc.kind,
                "name": doc.name,
                "size": doc.size,
            }
            for doc in profile.user.owner_documents.order_by("id")
        ],
    }

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
        "owner": owner_payload(user.profile)
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
        "owner": owner_payload(profile)
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
        "owner": owner_payload(profile)
    })

@require_http_methods(["GET", "PUT"])
def owner_detail(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Войдите в аккаунт"}, status=401)

    profile = request.user.profile

    if request.method == "GET":
        return JsonResponse(owner_payload(profile))

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Некорректный JSON"}, status=400)

    if not isinstance(data, dict):
        return JsonResponse({"error": "Некорректные данные"}, status=400)

    is_owner = data.get("is_owner")
    parking = data.get("parking")
    addr = data.get("addr", "")
    place = data.get("place", "")

    if not isinstance(is_owner, bool):
        return JsonResponse({"error": "Некорректное значение is_owner"}, status=400)

    if parking not in ("s1", "s2", "s3", "s4", "s5", "other"):
        return JsonResponse({"error": "Некорректный тип парковки"}, status=400)

    if not all(isinstance(value, str) for value in (addr, place)):
        return JsonResponse({"error": "Адрес и описание должны быть строками"}, status=400)

    profile.is_owner = is_owner
    profile.parking = parking
    profile.addr = addr.strip()
    profile.place = place.strip()

    if not is_owner:
        profile.owner_status = "none"
        profile.owner_submitted_at = None
        profile.reject_reason = ""
    elif profile.owner_status == "none":
        profile.owner_status = "draft"

    profile.save()

    return JsonResponse(owner_payload(profile))


MAX_OWNER_FILE_SIZE = 10 * 1024 * 1024

OWNER_FILE_EXTENSIONS = {
    ".pdf", ".jpg", ".jpeg", ".png", ".heic", ".webp"
}


def validate_owner_file(uploaded_file):
    extension = os.path.splitext(uploaded_file.name)[1].lower()

    if extension not in OWNER_FILE_EXTENSIONS:
        return "Недопустимый формат файла"

    if uploaded_file.size > MAX_OWNER_FILE_SIZE:
        return "Размер файла не должен превышать 10 МБ"

    header = uploaded_file.read(16)
    uploaded_file.seek(0)

    is_valid = (
        (extension == ".pdf" and header.startswith(b"%PDF-"))
        or (extension in (".jpg", ".jpeg") and header.startswith(b"\xff\xd8\xff"))
        or (extension == ".png" and header.startswith(b"\x89PNG\r\n\x1a\n"))
        or (
            extension == ".webp"
            and header.startswith(b"RIFF")
            and header[8:12] == b"WEBP"
        )
        or (
            extension == ".heic"
            and header[4:8] == b"ftyp"
            and header[8:12] in (b"heic", b"heix", b"hevc", b"hevx", b"mif1")
        )
    )

    if not is_valid:
        return "Содержимое файла не соответствует его формату"

    return None


@require_POST
@transaction.atomic
def owner_document_upload(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Войдите в аккаунт"}, status=401)

    profile = request.user.profile

    if not profile.is_owner:
        return JsonResponse({"error": "Сначала включите режим владельца"}, status=400)

    kind = request.POST.get("kind")
    uploaded_file = request.FILES.get("file")

    if kind not in ("title", "tp", "other"):
        return JsonResponse({"error": "Неизвестный тип документа"}, status=400)

    if not uploaded_file:
        return JsonResponse({"error": "Выберите файл"}, status=400)

    error = validate_owner_file(uploaded_file)

    if error:
        return JsonResponse({"error": error}, status=400)

    old_document = OwnerDocument.objects.filter(
        user=request.user,
        kind=kind
    ).first()

    old_file_name = old_document.file.name if old_document else None

    if old_document:
        old_document.delete()

    document = OwnerDocument.objects.create(
        user=request.user,
        kind=kind,
        file=uploaded_file,
        name=os.path.basename(uploaded_file.name.replace("\\", "/"))[:255],
        size=uploaded_file.size,
    )

    if old_file_name:
        transaction.on_commit(
            lambda: default_storage.delete(old_file_name)
        )

    profile.owner_status = "draft"
    profile.owner_submitted_at = None
    profile.reject_reason = ""
    profile.save(update_fields=[
        "owner_status",
        "owner_submitted_at",
        "reject_reason",
    ])

    return JsonResponse({
        "id": document.id,
        "kind": document.kind,
        "name": document.name,
        "size": document.size,
    }, status=201)


@require_http_methods(["DELETE"])
@transaction.atomic
def owner_document_delete(request, document_id):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Войдите в аккаунт"}, status=401)

    document = get_object_or_404(
        OwnerDocument,
        pk=document_id,
        user=request.user
    )

    file_name = document.file.name
    document.delete()

    profile = request.user.profile

    if profile.owner_status in ("pending", "verified", "rejected"):
        profile.owner_status = "draft"
        profile.owner_submitted_at = None
        profile.reject_reason = ""
        profile.save(update_fields=[
            "owner_status",
            "owner_submitted_at",
            "reject_reason",
        ])

    transaction.on_commit(
        lambda: default_storage.delete(file_name)
    )

    return HttpResponse(status=204)


@require_POST
@transaction.atomic
def owner_submit(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Войдите в аккаунт"}, status=401)

    profile = request.user.profile

    if not profile.is_owner:
        return JsonResponse({"error": "Сначала включите режим владельца"}, status=400)

    if not profile.place.strip():
        return JsonResponse({"error": "Укажите описание парковочного места"}, status=400)

    document_kinds = set(
        request.user.owner_documents.values_list("kind", flat=True)
    )

    if not {"title", "tp"}.issubset(document_kinds):
        return JsonResponse(
            {"error": "Загрузите документ на право владения и технический паспорт"},
            status=400
        )

    profile.owner_status = "pending"
    profile.owner_submitted_at = timezone.now()
    profile.reject_reason = ""

    profile.save(update_fields=[
        "owner_status",
        "owner_submitted_at",
        "reject_reason",
    ])

    return JsonResponse(owner_payload(profile))



@staff_member_required
@require_GET
def owner_document_file(request, document_id):
    document = get_object_or_404(OwnerDocument, pk=document_id)

    if not document.file:
        return HttpResponseNotFound("Файл не найден")

    try:
        file = document.file.open("rb")
    except (FileNotFoundError, OSError):
        return HttpResponseNotFound("Файл не найден")

    response = FileResponse(
        file,
        as_attachment=False,
        filename=document.name,
    )
    response["X-Content-Type-Options"] = "nosniff"
    return response


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
