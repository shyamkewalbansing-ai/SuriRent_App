"""Phase 3b — Huurder Kiosk new endpoints.

Covers (NEW in iteration 10):
  - GET  /api/tenant-portal/invoices       — own invoices only
  - POST /api/tenant-portal/payments       — self-service payment (with / without invoice)
  - Cross-tenant isolation on invoices + payments (tenant A cannot touch tenant B docs)
  - tenant_id / company_id are auto-filled from session (body fields are ignored)
  - Existing /tenant-portal/login + maintenance regression
"""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL is required"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = "admin123"
TEST_PIN = "5678"
TEST_PIN_B = "5679"  # different so we can spot which tenant is logged in


# -------------------- fixtures --------------------

@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def primary_tenant(admin_headers):
    """Pick Jan de Vries (or first tenant) and set PIN."""
    r = requests.get(f"{API}/tenants", headers=admin_headers)
    assert r.status_code == 200
    tenants = r.json()
    t = next((x for x in tenants if (x.get("email") or "").lower() == "jan@example.sr"), None) or tenants[0]
    assert t.get("apartment_id"), "Primary tenant must have apartment_id"
    r = requests.post(f"{API}/auth/tenant-set-pin", headers=admin_headers,
                      json={"tenant_id": t["id"], "pin": TEST_PIN})
    assert r.status_code == 200, r.text
    return t


@pytest.fixture(scope="module")
def secondary_tenant(admin_headers, primary_tenant):
    """Another tenant in the SAME company (for cross-tenant isolation)."""
    r = requests.get(f"{API}/tenants", headers=admin_headers)
    assert r.status_code == 200
    tenants = r.json()
    other = next(
        (x for x in tenants
         if x["id"] != primary_tenant["id"]
         and x.get("company_id") == primary_tenant.get("company_id")
         and x.get("apartment_id")),
        None,
    )
    if other is None:
        pytest.skip("Need a second tenant with apartment for isolation tests")
    r = requests.post(f"{API}/auth/tenant-set-pin", headers=admin_headers,
                      json={"tenant_id": other["id"], "pin": TEST_PIN_B})
    assert r.status_code == 200, r.text
    return other


def _login(identifier, pin):
    r = requests.post(f"{API}/tenant-portal/login", json={"identifier": identifier, "pin": pin})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def tenant_a_headers(primary_tenant):
    return _login(primary_tenant.get("email") or primary_tenant.get("phone"), TEST_PIN)


@pytest.fixture(scope="module")
def tenant_b_headers(secondary_tenant):
    return _login(secondary_tenant.get("email") or secondary_tenant.get("phone"), TEST_PIN_B)


# -------------------- LOGIN --------------------

class TestTenantLogin:
    def test_login_with_email_ok(self, primary_tenant):
        ident = primary_tenant.get("email")
        if not ident:
            pytest.skip("no email")
        r = requests.post(f"{API}/tenant-portal/login", json={"identifier": ident, "pin": TEST_PIN})
        assert r.status_code == 200
        body = r.json()
        assert "token" in body and isinstance(body["token"], str) and len(body["token"]) > 20
        assert body["tenant"]["id"] == primary_tenant["id"]
        assert body["tenant"]["name"] == primary_tenant["name"]

    def test_login_wrong_pin_401(self, primary_tenant):
        ident = primary_tenant.get("email") or primary_tenant.get("phone")
        r = requests.post(f"{API}/tenant-portal/login", json={"identifier": ident, "pin": "0000"})
        assert r.status_code == 401

    def test_login_unknown_user_401(self):
        r = requests.post(f"{API}/tenant-portal/login",
                          json={"identifier": "nobody@nowhere.zz", "pin": "1111"})
        assert r.status_code == 401

    def test_login_requires_4digit_pin(self, primary_tenant):
        ident = primary_tenant.get("email") or primary_tenant.get("phone")
        r = requests.post(f"{API}/tenant-portal/login", json={"identifier": ident, "pin": "12"})
        assert r.status_code == 422


# -------------------- OVERVIEW --------------------

class TestOverview:
    def test_overview_shape(self, tenant_a_headers, primary_tenant):
        r = requests.get(f"{API}/tenant-portal/overview", headers=tenant_a_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["tenant"]["id"] == primary_tenant["id"]
        assert "apartment" in body
        assert "balance" in body and "balance" in body["balance"]

    def test_overview_requires_token(self):
        r = requests.get(f"{API}/tenant-portal/overview")
        assert r.status_code == 401


# -------------------- INVOICES (NEW) --------------------

class TestTenantInvoices:
    def test_get_invoices_ok(self, tenant_a_headers, primary_tenant):
        r = requests.get(f"{API}/tenant-portal/invoices", headers=tenant_a_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # Every returned invoice MUST belong to the logged-in tenant
        for inv in data:
            assert inv["tenant_id"] == primary_tenant["id"], (
                f"LEAK: invoice {inv.get('id')} belongs to {inv.get('tenant_id')}, not session tenant"
            )

    def test_get_invoices_requires_token(self):
        r = requests.get(f"{API}/tenant-portal/invoices")
        assert r.status_code == 401

    def test_invoices_isolation_between_tenants(self, tenant_a_headers, tenant_b_headers,
                                                 primary_tenant, secondary_tenant):
        ra = requests.get(f"{API}/tenant-portal/invoices", headers=tenant_a_headers).json()
        rb = requests.get(f"{API}/tenant-portal/invoices", headers=tenant_b_headers).json()
        a_ids = {i["id"] for i in ra}
        b_ids = {i["id"] for i in rb}
        assert a_ids.isdisjoint(b_ids), f"Cross-tenant invoice leak: {a_ids & b_ids}"
        for inv in ra:
            assert inv["tenant_id"] == primary_tenant["id"]
        for inv in rb:
            assert inv["tenant_id"] == secondary_tenant["id"]


# -------------------- PAYMENTS (NEW) --------------------

def _get_one_open_invoice(admin_headers, tenant_id):
    """Try to find an open invoice via the admin endpoint. May return None."""
    r = requests.get(f"{API}/invoices", headers=admin_headers)
    if r.status_code != 200:
        return None
    invs = [i for i in r.json() if i.get("tenant_id") == tenant_id and i.get("status") != "paid"]
    return invs[0] if invs else None


def _ensure_open_invoice(admin_headers, tenant):
    """Create an invoice for tenant via admin if no open one exists."""
    inv = _get_one_open_invoice(admin_headers, tenant["id"])
    if inv:
        return inv
    payload = {
        "tenant_id": tenant["id"],
        "apartment_id": tenant.get("apartment_id"),
        "amount": 1000.0,
        "currency": "SRD",
        "period_month": 1,
        "period_year": 2030,
        "category": "huur",
        "description": "TEST_KIOSK invoice",
    }
    r = requests.post(f"{API}/invoices", headers=admin_headers, json=payload)
    if r.status_code in (200, 201):
        return r.json()
    return None


class TestTenantSelfPayment:
    def test_free_form_payment_works(self, tenant_a_headers, primary_tenant):
        """No invoice_id — just amount/category/period."""
        body = {
            "amount": 12.34,
            "currency": "SRD",
            "method": "contant",
            "category": "huur",
            "period_month": 1,
            "period_year": 2030,
            "note": "TEST_KIOSK free-form",
        }
        r = requests.post(f"{API}/tenant-portal/payments", headers=tenant_a_headers, json=body)
        assert r.status_code in (200, 201), r.text
        out = r.json()
        assert out["tenant_id"] == primary_tenant["id"]
        assert out["amount"] == 12.34
        assert out["method"] == "contant"
        assert out["category"] == "huur"
        # company_id should be auto-filled from session
        if primary_tenant.get("company_id"):
            assert out.get("company_id") == primary_tenant["company_id"]

    def test_body_tenant_id_cannot_override_session(self, tenant_a_headers, secondary_tenant,
                                                    primary_tenant):
        """Even if body sends tenant_id for someone else, server uses session tenant."""
        body = {
            "amount": 1.0, "currency": "SRD", "method": "contant", "category": "overig",
            "tenant_id": secondary_tenant["id"],          # malicious
            "company_id": "evil-co",                       # malicious
            "note": "TEST_KIOSK override attempt",
        }
        r = requests.post(f"{API}/tenant-portal/payments", headers=tenant_a_headers, json=body)
        # Either the extra field is ignored (200) or rejected (422). Either way result must
        # belong to the session tenant, never to secondary_tenant.
        assert r.status_code in (200, 201, 422), r.text
        if r.status_code in (200, 201):
            out = r.json()
            assert out["tenant_id"] == primary_tenant["id"]
            if primary_tenant.get("company_id"):
                assert out.get("company_id") == primary_tenant["company_id"]
            assert out.get("company_id") != "evil-co"

    def test_payment_with_own_invoice_marks_paid(self, admin_headers, tenant_a_headers,
                                                  primary_tenant):
        inv = _ensure_open_invoice(admin_headers, primary_tenant)
        if not inv:
            pytest.skip("Could not obtain/create an open invoice for primary tenant")
        body = {
            "amount": float(inv["amount"]),
            "currency": inv.get("currency", "SRD"),
            "method": "contant",
            "category": inv.get("category", "huur"),
            "invoice_id": inv["id"],
            "note": "TEST_KIOSK paying own invoice",
        }
        r = requests.post(f"{API}/tenant-portal/payments", headers=tenant_a_headers, json=body)
        assert r.status_code in (200, 201), r.text
        out = r.json()
        assert out["tenant_id"] == primary_tenant["id"]
        # Verify invoice marked paid in DB (via admin GET)
        r2 = requests.get(f"{API}/invoices", headers=admin_headers)
        assert r2.status_code == 200
        upd = next((i for i in r2.json() if i["id"] == inv["id"]), None)
        assert upd is not None
        assert upd.get("status") == "paid", f"Invoice not marked paid: {upd}"

    def test_cannot_pay_other_tenants_invoice(self, admin_headers, tenant_a_headers,
                                              secondary_tenant):
        inv = _ensure_open_invoice(admin_headers, secondary_tenant)
        if not inv:
            pytest.skip("Could not obtain/create an open invoice for secondary tenant")
        body = {
            "amount": float(inv["amount"]),
            "currency": inv.get("currency", "SRD"),
            "method": "contant",
            "category": inv.get("category", "huur"),
            "invoice_id": inv["id"],
            "note": "TEST_KIOSK cross-tenant attempt",
        }
        # Tenant A tries to pay tenant B's invoice
        r = requests.post(f"{API}/tenant-portal/payments", headers=tenant_a_headers, json=body)
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"

    def test_payment_requires_token(self):
        r = requests.post(f"{API}/tenant-portal/payments",
                          json={"amount": 1.0, "currency": "SRD", "method": "contant",
                                "category": "huur"})
        assert r.status_code == 401


# -------------------- MAINTENANCE REGRESSION --------------------

class TestMaintenanceRegression:
    def test_post_maintenance_still_works(self, tenant_a_headers):
        r = requests.post(f"{API}/tenant-portal/maintenance", headers=tenant_a_headers,
                          json={"title": "TEST_KIOSK leak", "description": "drip", "priority": "low"})
        assert r.status_code in (200, 201), r.text
        out = r.json()
        assert out.get("title") == "TEST_KIOSK leak"
        assert out.get("status") == "open"

    def test_get_maintenance_returns_list(self, tenant_a_headers):
        r = requests.get(f"{API}/tenant-portal/maintenance", headers=tenant_a_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
