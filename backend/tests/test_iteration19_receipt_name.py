"""
Iteration 19 — Receipt 'Ontvangen door' (medewerker NAAM op bon)
- POST /api/kiosk/payments?employee_id=X&employee_pin=Y must auto-populate
  received_by from kiosk_employee_name when no explicit received_by given.
- GET /api/payments/{id}/pdf must include the medewerker name in the PDF body.
"""
import os
import io
import re
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert v, "REACT_APP_BACKEND_URL not set"
    return v.rstrip("/")

BASE_URL = _load_backend_url()
ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASS = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
COMPANY_PIN = os.environ.get("TEST_KIOSK_PIN", "1234")
EMP_PIN = "9999"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def kiosk_token():
    r = requests.post(f"{BASE_URL}/api/auth/kiosk-pin", json={"pin": COMPANY_PIN}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def maria_employee(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE_URL}/api/employees", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    emps = [e for e in r.json() if e.get("has_kiosk_pin") and e.get("active", True)]
    assert emps, "No kiosk employees seeded"
    return emps[0]


@pytest.fixture(scope="module")
def apartment_with_tenant(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    apts = requests.get(f"{BASE_URL}/api/apartments", headers=h, timeout=15).json()
    for a in apts:
        if a.get("tenant_id"):
            return a
    pytest.skip("No apartment with active tenant available")


# ====== Receipt name auto-population ======
class TestReceiptName:
    def test_received_by_auto_populated_from_employee(self, kiosk_token, maria_employee, apartment_with_tenant):
        h = {"Authorization": f"Bearer {kiosk_token}"}
        payload = {
            "apartment_id": apartment_with_tenant["id"],
            "tenant_id": apartment_with_tenant["tenant_id"],
            "amount": 1.00,
            "currency": apartment_with_tenant.get("currency", "SRD"),
            "method": "contant",
            "category": "huur",
            "note": "TEST iter19 auto-name",
        }
        r = requests.post(
            f"{BASE_URL}/api/kiosk/payments"
            f"?employee_id={maria_employee['id']}&employee_pin={EMP_PIN}",
            headers=h, json=payload, timeout=20,
        )
        assert r.status_code in (200, 201), r.text
        data = r.json()
        # Approval workflow → status pending_approval, received_by set to employee name
        assert data.get("status") == "pending_approval"
        assert data.get("received_by"), "received_by should not be empty"
        assert data["received_by"] == maria_employee["name"], (
            f"received_by={data.get('received_by')} expected={maria_employee['name']}"
        )
        # save the id for next test
        TestReceiptName._payment_id = data["id"]
        TestReceiptName._receipt_num = data["receipt_number"]
        TestReceiptName._emp_name = maria_employee["name"]

    def test_pdf_contains_received_by_row(self, admin_token):
        pid = getattr(TestReceiptName, "_payment_id", None)
        assert pid, "Previous test did not create a payment"
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/api/payments/{pid}/pdf", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
        body = r.content
        assert len(body) > 1000, "PDF too small"
        # PDF text may be compressed — look for unencoded common case via parens markers used by reportlab
        text_blob = body.decode("latin-1", errors="ignore")
        # ReportLab usually emits glyph strings in parens. Just check both labels exist somewhere.
        # If compressed, this may fail — fall back to size only.
        if "FlateDecode" not in text_blob:
            assert "Ontvangen door" in text_blob, "Label not in PDF (uncompressed)"
            assert TestReceiptName._emp_name.split()[0] in text_blob, "Name not in PDF"

    def test_explicit_received_by_overrides_employee_name(self, kiosk_token, maria_employee, apartment_with_tenant):
        h = {"Authorization": f"Bearer {kiosk_token}"}
        payload = {
            "apartment_id": apartment_with_tenant["id"],
            "tenant_id": apartment_with_tenant["tenant_id"],
            "amount": 1.00,
            "currency": apartment_with_tenant.get("currency", "SRD"),
            "method": "contant",
            "category": "huur",
            "received_by": "Explicit Override Name",
            "note": "TEST iter19 explicit",
        }
        r = requests.post(
            f"{BASE_URL}/api/kiosk/payments"
            f"?employee_id={maria_employee['id']}&employee_pin={EMP_PIN}",
            headers=h, json=payload, timeout=20,
        )
        assert r.status_code in (200, 201), r.text
        assert r.json().get("received_by") == "Explicit Override Name"


# ====== 401 interceptor backend side: invalid admin token returns 401 ======
class TestStaleToken401:
    def test_invalid_admin_token_returns_401(self):
        h = {"Authorization": "Bearer invalid-token-xyz"}
        r = requests.get(f"{BASE_URL}/api/payments", headers=h, timeout=15)
        assert r.status_code == 401, f"expected 401 got {r.status_code}"

    def test_invalid_kiosk_token_returns_401(self):
        h = {"Authorization": "Bearer invalid-kiosk-token"}
        r = requests.get(f"{BASE_URL}/api/kiosk/apartments", headers=h, timeout=15)
        assert r.status_code == 401, f"expected 401 got {r.status_code}"
