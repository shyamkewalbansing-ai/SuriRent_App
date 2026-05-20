"""Phase 3a — Tenant Portal endpoint tests.

Covers:
  - Admin set-pin endpoint
  - Tenant portal login (email / phone / phone-digits / wrong PIN / unknown / no-PIN)
  - GET /tenant-portal/me, /overview, /payments, /contracts, /maintenance
  - POST /tenant-portal/maintenance (creates ticket)
  - POST /tenant-portal/logout
  - Cross-tenant isolation (payments/contracts only own tenant_id)
"""
import os
import re
import pytest
import requests
from dotenv import load_dotenv

# Load backend env so we can rely on admin creds if needed
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://vastgoed-app.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = "admin123"
TEST_PIN = "5678"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def tenant_record(admin_headers):
    """Locate the test tenant (Jan de Vries) and ensure it has phone + apartment_id."""
    r = requests.get(f"{API}/tenants", headers=admin_headers)
    assert r.status_code == 200
    tenants = r.json()
    assert isinstance(tenants, list) and len(tenants) > 0, "No tenants seeded"
    t = next((x for x in tenants if (x.get("email") or "").lower() == "jan@example.sr"), None) or tenants[0]
    assert t.get("apartment_id"), f"Tenant {t.get('name')} has no apartment_id"
    return t


@pytest.fixture(scope="module")
def setup_pin(admin_headers, tenant_record):
    """Ensure tenant has PIN 5678 set (idempotent)."""
    r = requests.post(
        f"{API}/auth/tenant-set-pin",
        headers=admin_headers,
        json={"tenant_id": tenant_record["id"], "pin": TEST_PIN},
    )
    assert r.status_code == 200, f"set-pin failed: {r.status_code} {r.text}"
    assert r.json().get("ok") is True
    return True


# -------------------- admin set-pin --------------------

class TestAdminSetPin:
    def test_set_pin_requires_admin(self, tenant_record):
        r = requests.post(f"{API}/auth/tenant-set-pin", json={"tenant_id": tenant_record["id"], "pin": TEST_PIN})
        assert r.status_code == 401

    def test_set_pin_invalid_format(self, admin_headers, tenant_record):
        r = requests.post(
            f"{API}/auth/tenant-set-pin",
            headers=admin_headers,
            json={"tenant_id": tenant_record["id"], "pin": "abcd"},
        )
        assert r.status_code == 400

    def test_set_pin_unknown_tenant(self, admin_headers):
        r = requests.post(
            f"{API}/auth/tenant-set-pin",
            headers=admin_headers,
            json={"tenant_id": "nonexistent-id-xxx", "pin": TEST_PIN},
        )
        assert r.status_code == 404

    def test_set_pin_success(self, admin_headers, tenant_record):
        r = requests.post(
            f"{API}/auth/tenant-set-pin",
            headers=admin_headers,
            json={"tenant_id": tenant_record["id"], "pin": TEST_PIN},
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True


# -------------------- tenant login variations --------------------

class TestTenantLogin:
    def test_login_with_email(self, setup_pin, tenant_record):
        r = requests.post(f"{API}/tenant-portal/login", json={"identifier": tenant_record["email"], "pin": TEST_PIN})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str)
        assert data["tenant"]["id"] == tenant_record["id"]
        assert data["tenant"]["name"] == tenant_record["name"]

    def test_login_with_phone_full_string(self, setup_pin, tenant_record):
        r = requests.post(f"{API}/tenant-portal/login", json={"identifier": tenant_record["phone"], "pin": TEST_PIN})
        assert r.status_code == 200, r.text
        assert r.json()["tenant"]["id"] == tenant_record["id"]

    def test_login_with_phone_digits_only(self, setup_pin, tenant_record):
        digits = re.sub(r"\D", "", tenant_record["phone"] or "")
        assert digits, "Test tenant has no phone digits"
        r = requests.post(f"{API}/tenant-portal/login", json={"identifier": digits, "pin": TEST_PIN})
        assert r.status_code == 200, r.text
        assert r.json()["tenant"]["id"] == tenant_record["id"]

    def test_login_wrong_pin(self, setup_pin, tenant_record):
        r = requests.post(f"{API}/tenant-portal/login", json={"identifier": tenant_record["email"], "pin": "0000"})
        assert r.status_code == 401

    def test_login_unknown_identifier(self, setup_pin):
        r = requests.post(f"{API}/tenant-portal/login", json={"identifier": "nobody@nowhere.sr", "pin": TEST_PIN})
        assert r.status_code == 401

    def test_login_tenant_without_pin(self, admin_headers, tenant_record):
        """Clear pin_hash on a *secondary* tenant if exists, else create temp tenant."""
        # Create a temp tenant via admin API
        payload = {"name": "TEST_NoPin Tenant", "email": "TEST_nopin@example.sr", "phone": "+597 9990001"}
        r = requests.post(f"{API}/tenants", headers=admin_headers, json=payload)
        assert r.status_code in (200, 201), r.text
        temp = r.json()
        try:
            r2 = requests.post(f"{API}/tenant-portal/login", json={"identifier": temp["email"], "pin": TEST_PIN})
            assert r2.status_code == 401
        finally:
            requests.delete(f"{API}/tenants/{temp['id']}", headers=admin_headers)


# -------------------- /me + token-type isolation --------------------

@pytest.fixture(scope="module")
def tenant_token(setup_pin, tenant_record):
    r = requests.post(f"{API}/tenant-portal/login", json={"identifier": tenant_record["email"], "pin": TEST_PIN})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def tenant_headers(tenant_token):
    return {"Authorization": f"Bearer {tenant_token}"}


class TestTenantMe:
    def test_me_returns_tenant(self, tenant_headers, tenant_record):
        r = requests.get(f"{API}/tenant-portal/me", headers=tenant_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == tenant_record["id"]
        assert data["name"] == tenant_record["name"]

    def test_me_without_token_unauthorized(self):
        r = requests.get(f"{API}/tenant-portal/me")
        assert r.status_code == 401

    def test_me_with_admin_token_rejected(self, admin_headers):
        # admin access_token must NOT work on tenant-portal endpoints (different token type)
        r = requests.get(f"{API}/tenant-portal/me", headers=admin_headers)
        assert r.status_code == 401


# -------------------- overview / payments / contracts --------------------

class TestTenantOverview:
    def test_overview_shape(self, tenant_headers, tenant_record):
        r = requests.get(f"{API}/tenant-portal/overview", headers=tenant_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["tenant"]["id"] == tenant_record["id"]
        assert d["apartment"] is not None
        assert d["apartment"]["id"] == tenant_record["apartment_id"]
        assert "rent_amount" in d["apartment"]
        assert "balance" in d
        # balance is a dict or number — accept both, but must exist
        assert d["balance"] is not None

    def test_payments_only_own(self, tenant_headers, tenant_record):
        r = requests.get(f"{API}/tenant-portal/payments", headers=tenant_headers)
        assert r.status_code == 200
        payments = r.json()
        assert isinstance(payments, list)
        for p in payments:
            assert p["tenant_id"] == tenant_record["id"], f"Cross-tenant leak: {p}"
        # Per problem statement: tenant has 24 existing payments
        assert len(payments) >= 1, "Expected at least 1 payment for seeded tenant"

    def test_contracts_only_own(self, tenant_headers, tenant_record):
        r = requests.get(f"{API}/tenant-portal/contracts", headers=tenant_headers)
        assert r.status_code == 200
        contracts = r.json()
        assert isinstance(contracts, list)
        for c in contracts:
            assert c["tenant_id"] == tenant_record["id"]


# -------------------- maintenance --------------------

class TestTenantMaintenance:
    def test_maintenance_list(self, tenant_headers):
        r = requests.get(f"{API}/tenant-portal/maintenance", headers=tenant_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_maintenance(self, tenant_headers, tenant_record, admin_headers):
        title = "TEST_PH3 leaky tap"
        r = requests.post(
            f"{API}/tenant-portal/maintenance",
            headers=tenant_headers,
            json={"title": title, "description": "Water drips overnight", "priority": "low"},
        )
        assert r.status_code == 200, r.text
        ticket = r.json()
        assert ticket["title"] == title
        assert ticket["apartment_id"] == tenant_record["apartment_id"]
        assert ticket["created_by_tenant"] == tenant_record["id"]
        assert ticket["status"] == "open"

        # Verify it appears in tenant's list
        r2 = requests.get(f"{API}/tenant-portal/maintenance", headers=tenant_headers)
        assert r2.status_code == 200
        assert any(t["id"] == ticket["id"] for t in r2.json())

        # Cleanup via admin
        requests.delete(f"{API}/maintenance/{ticket['id']}", headers=admin_headers)

    def test_create_maintenance_no_apartment(self, admin_headers):
        # Create tenant w/o apartment + set PIN + login → POST should 400
        r = requests.post(
            f"{API}/tenants",
            headers=admin_headers,
            json={"name": "TEST_NoApt", "email": "test_noapt@example.sr", "phone": "+597 9990099"},
        )
        assert r.status_code in (200, 201), r.text
        tmp = r.json()
        try:
            sp = requests.post(
                f"{API}/auth/tenant-set-pin",
                headers=admin_headers,
                json={"tenant_id": tmp["id"], "pin": TEST_PIN},
            )
            assert sp.status_code == 200
            # Use phone digits to login (most robust regardless of email casing rules)
            lr = requests.post(f"{API}/tenant-portal/login", json={"identifier": "5979990099", "pin": TEST_PIN})
            assert lr.status_code == 200, lr.text
            tok = lr.json()["token"]
            cr = requests.post(
                f"{API}/tenant-portal/maintenance",
                headers={"Authorization": f"Bearer {tok}"},
                json={"title": "TEST_x", "description": "", "priority": "medium"},
            )
            assert cr.status_code == 400
        finally:
            requests.delete(f"{API}/tenants/{tmp['id']}", headers=admin_headers)


# -------------------- logout --------------------

class TestTenantLogout:
    def test_logout_clears_cookie(self, tenant_token):
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tenant_token}"})
        r = s.post(f"{API}/tenant-portal/logout")
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # Server response should include Set-Cookie clearing tenant_token
        sc = r.headers.get("set-cookie", "")
        assert "tenant_token" in sc.lower()
