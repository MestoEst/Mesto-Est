import base64
import json

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase

from .models import ContractCopy, ParkingSpot

# 1x1 PNG
PNG = "data:image/png;base64," + base64.b64encode(
    bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082")
).decode()


class ContractCopyTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="a@mail.by", email="a@mail.by", password="secret12")

    def post(self, payload):
        return self.client.post("/api/contracts/", data=json.dumps(payload), content_type="application/json")

    def payload(self, **kw):
        d = {"booking_ref": "b1", "listing": "l1", "title": "Крытое место", "place": "14", "owner": "Алексей",
             "when_text": "17 нояб., с 19:00, 2 ч", "total": 6, "signature": PNG}
        d.update(kw)
        return d

    def test_requires_login(self):
        self.assertEqual(self.post(self.payload()).status_code, 401)
        self.assertEqual(ContractCopy.objects.count(), 0)

    def test_saves_signature_and_emails_user_only(self):
        self.client.force_login(self.user)
        r = self.post(self.payload(email="evil@example.com"))        # адрес из запроса игнорируется
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.json()["emailed"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["a@mail.by"])
        self.assertEqual(mail.outbox[0].attachments[0][0], "podpis.png")
        c = ContractCopy.objects.get()
        self.assertEqual(c.user, self.user)
        self.assertEqual(c.emailed_to, ["a@mail.by"])
        self.assertTrue(c.signature.startswith("data:image/png"))

    def test_rejects_bad_signature_and_missing_fields(self):
        self.client.force_login(self.user)
        self.assertEqual(self.post(self.payload(signature="")).status_code, 400)
        self.assertEqual(self.post(self.payload(signature="data:image/png;base64,@@@")).status_code, 400)
        self.assertEqual(self.post(self.payload(signature="data:image/png;base64," + base64.b64encode(b"not a png").decode())).status_code, 400)
        self.assertEqual(self.post(self.payload(title="")).status_code, 400)
        self.assertEqual(self.post(self.payload(total="abc")).status_code, 400)
        self.assertEqual(ContractCopy.objects.count(), 0)


class FreeByDefaultTests(TestCase):
    def test_model_default_is_free(self):
        spot = ParkingSpot.objects.create(code="x1", geometry={"type": "Polygon", "coordinates": []})
        self.assertIs(spot.is_occupied, False)
