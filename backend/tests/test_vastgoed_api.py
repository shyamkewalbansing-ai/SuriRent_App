"""Vastgoed Kiosk backend API tests (pytest).
Covers: auth (admin + kiosk PIN), apartments CRUD, tenants CRUD, assign/remove tenant,
payments + receipt number format, kiosk endpoints, admin stats.
"""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://b6cbd1b3-93cf-4aa3-8980-d84887d5c5aa.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = "admin123"
KIOSK_PIN = "1234"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == ADMIN_EMAIL
    return data["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def kiosk_token(session):
    r = session.post(f"{API}/auth/kiosk-pin", json={"pin": KIOSK_PIN})
    assert r.status_code == 200, f"Kiosk PIN auth failed: {r.status_code} {r.text}"
    return r.json()["token"]


# -------------------- AUTH --------------------
class TestAuth:
    def test_login_success(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "admin"
        assert isinstance(d["token"], str) and len(d["token"]) > 10

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, session, admin_headers):
        r = session.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_unauthorized(self):
        # Use a fresh session to avoid persisted cookies
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_kiosk_pin_correct(self, session):
        r = session.post(f"{API}/auth/kiosk-pin", json={"pin": KIOSK_PIN})
        assert r.status_code == 200
        assert "token" in r.json()

    def test_kiosk_pin_wrong(self, session):
        r = session.post(f"{API}/auth/kiosk-pin", json={"pin": "0000"})
        assert r.status_code == 401


# -------------------- APARTMENTS / TENANTS / ASSIGN --------------------
class TestApartmentsTenants:
    def test_full_flow(self, session, admin_headers):
        # Create apartment
        apt_payload = {
            "number": f"TEST-{uuid.uuid4().hex[:6]}",
            "address": "Teststraat 1",
            "rent_amount": 1500.0,
            "currency": "SRD",
            "description": "Test apartment",
        }
        r = session.post(f"{API}/apartments", json=apt_payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        apt = r.json()
        assert apt["status"] == "vacant"
        assert apt["number"] == apt_payload["number"]
        assert apt["tenant_id"] is None
        apt_id = apt["id"]

        # List apartments
        r = session.get(f"{API}/apartments", headers=admin_headers)
        assert r.status_code == 200
        assert any(a["id"] == apt_id for a in r.json())

        # Create tenant
        ten_payload = {"name": f"TEST Tenant {uuid.uuid4().hex[:5]}", "phone": "12345", "email": "t@x.com"}
        r = session.post(f"{API}/tenants", json=ten_payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        tenant = r.json()
        tenant_id = tenant["id"]
        assert tenant["name"] == ten_payload["name"]

        # Assign tenant
        r = session.post(f"{API}/apartments/{apt_id}/assign-tenant",
                         json={"tenant_id": tenant_id}, headers=admin_headers)
        assert r.status_code == 200
        # Verify status occupied
        r = session.get(f"{API}/apartments", headers=admin_headers)
        apt_after = next(a for a in r.json() if a["id"] == apt_id)
        assert apt_after["status"] == "occupied"
        assert apt_after["tenant_id"] == tenant_id
        assert apt_after["tenant_name"] == ten_payload["name"]

        # Update apartment
        upd = {**apt_payload, "rent_amount": 1700.0}
        r = session.put(f"{API}/apartments/{apt_id}", json=upd, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["rent_amount"] == 1700.0

        # Create payment
        pay_payload = {
            "tenant_id": tenant_id, "apartment_id": apt_id,
            "amount": 1700.0, "currency": "SRD",
            "method": "contant", "category": "huur",
            "period_month": 1, "period_year": 2026,
        }
        r = session.post(f"{API}/payments", json=pay_payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        pay = r.json()
        assert re.match(r"^KW\d{4}-\d{5}$", pay["receipt_number"]), pay["receipt_number"]
        assert pay["amount"] == 1700.0
        pay_id = pay["id"]

        # GET payments list
        r = session.get(f"{API}/payments", headers=admin_headers)
        assert r.status_code == 200
        assert any(p["id"] == pay_id for p in r.json())

        # Remove tenant
        r = session.post(f"{API}/apartments/{apt_id}/remove-tenant", headers=admin_headers)
        assert r.status_code == 200
        r = session.get(f"{API}/apartments", headers=admin_headers)
        apt_after = next(a for a in r.json() if a["id"] == apt_id)
        assert apt_after["status"] == "vacant"
        assert apt_after["tenant_id"] is None

        # Delete tenant and apartment cleanup
        r = session.delete(f"{API}/tenants/{tenant_id}", headers=admin_headers)
        assert r.status_code == 200
        r = session.delete(f"{API}/apartments/{apt_id}", headers=admin_headers)
        assert r.status_code == 200


# -------------------- KIOSK PUBLIC --------------------
class TestKiosk:
    def test_kiosk_list_apartments_public(self, session):
        r = session.get(f"{API}/kiosk/apartments")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_kiosk_tenant_overview(self, session, admin_headers):
        # find any tenant with apartment, fallback to creating
        r = session.get(f"{API}/tenants", headers=admin_headers)
        assert r.status_code == 200
        tenants = r.json()
        if not tenants:
            pytest.skip("No tenants seeded")
        t_id = tenants[0]["id"]
        r = session.get(f"{API}/kiosk/tenants/{t_id}/overview")
        assert r.status_code == 200
        data = r.json()
        assert "tenant" in data and "balance" in data
        bal = data["balance"]
        for k in ("months_due", "balance", "next_period"):
            assert k in bal

    def test_kiosk_payment_requires_token(self, session, admin_headers):
        r = session.get(f"{API}/tenants", headers=admin_headers)
        tenants = r.json()
        if not tenants:
            pytest.skip("No tenants")
        body = {
            "tenant_id": tenants[0]["id"], "amount": 100.0, "currency": "SRD",
            "method": "contant", "category": "huur",
        }
        # No token - fresh session (no cookies)
        r = requests.post(f"{API}/kiosk/payments", json=body)
        assert r.status_code == 401

    def test_kiosk_payment_with_token(self, session, admin_headers, kiosk_token):
        r = session.get(f"{API}/tenants", headers=admin_headers)
        tenants = [t for t in r.json() if t.get("apartment_id")]
        if not tenants:
            pytest.skip("No tenant with apartment")
        body = {
            "tenant_id": tenants[0]["id"], "amount": 50.0, "currency": "SRD",
            "method": "contant", "category": "huur",
        }
        r = session.post(f"{API}/kiosk/payments", json=body,
                         headers={"Authorization": f"Bearer {kiosk_token}", "Content-Type": "application/json"})
        assert r.status_code == 200, r.text
        assert re.match(r"^KW\d{4}-\d{5}$", r.json()["receipt_number"])


# -------------------- STATS --------------------
class TestStats:
    def test_admin_stats(self, session, admin_headers):
        r = session.get(f"{API}/admin/stats", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("apartments_total", "apartments_occupied", "apartments_vacant",
                  "tenants_total", "month_payments_by_currency"):
            assert k in d
        assert isinstance(d["month_payments_by_currency"], dict)
