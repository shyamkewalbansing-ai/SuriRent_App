"""
Test suite for auto-invoice creation on payment (bug fix iteration_39).

Scenario: When a kiosk/admin payment arrives for category='huur' and there is
no matching invoice for the tenant/period, the backend should auto-create an
invoice so that the Facturen page is not empty.
"""
import os
import datetime
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = "admin123"
COMPANY_SLUG = "surirent"
KIOSK_PIN = "1234"


def _now_period():
    d = datetime.datetime.utcnow()
    return d.month, d.year


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def kiosk_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/kiosk-pin",
        json={"pin": KIOSK_PIN, "company_slug": COMPANY_SLUG},
        timeout=30,
    )
    assert r.status_code == 200, f"kiosk-pin failed: {r.status_code} {r.text}"
    tok = r.json().get("kiosk_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# Track created ids for cleanup
_CREATED = {"apartments": [], "tenants": [], "locations": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_session):
    yield
    # Delete tenants first (removes invoices/payments via cascade in most apps;
    # if not, we still delete them manually).
    for tid in _CREATED["tenants"]:
        try:
            # remove related payments + invoices
            r_inv = admin_session.get(f"{BASE_URL}/api/invoices", timeout=15)
            if r_inv.status_code == 200:
                for inv in r_inv.json():
                    if inv.get("tenant_id") == tid:
                        admin_session.delete(f"{BASE_URL}/api/invoices/{inv['id']}", timeout=15)
            r_pay = admin_session.get(f"{BASE_URL}/api/payments", timeout=15)
            if r_pay.status_code == 200:
                for p in r_pay.json():
                    if p.get("tenant_id") == tid:
                        admin_session.delete(f"{BASE_URL}/api/payments/{p['id']}", timeout=15)
            admin_session.delete(f"{BASE_URL}/api/tenants/{tid}", timeout=15)
        except Exception as e:
            print(f"cleanup tenant {tid}: {e}")
    for aid in _CREATED["apartments"]:
        try:
            admin_session.delete(f"{BASE_URL}/api/apartments/{aid}", timeout=15)
        except Exception as e:
            print(f"cleanup apt {aid}: {e}")


def _ensure_location(admin_session) -> str:
    r = admin_session.get(f"{BASE_URL}/api/locations", timeout=15)
    if r.status_code == 200 and r.json():
        return r.json()[0]["id"]
    r = admin_session.post(
        f"{BASE_URL}/api/locations",
        json={"name": "TEST_Loc", "address": "TEST"},
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    loc = r.json()
    _CREATED["locations"].append(loc["id"])
    return loc["id"]


def _create_apartment(admin_session, rent=2500.0, currency="SRD") -> dict:
    loc_id = _ensure_location(admin_session)
    suffix = datetime.datetime.utcnow().strftime("%H%M%S%f")
    r = admin_session.post(
        f"{BASE_URL}/api/apartments",
        json={
            "number": f"TEST_{suffix}",
            "address": "TEST addr",
            "rent_amount": rent,
            "currency": currency,
            "location_id": loc_id,
        },
        timeout=15,
    )
    assert r.status_code in (200, 201), f"apartment create failed: {r.status_code} {r.text}"
    apt = r.json()
    _CREATED["apartments"].append(apt["id"])
    return apt


def _create_tenant(admin_session, apartment_id: str) -> dict:
    suffix = datetime.datetime.utcnow().strftime("%H%M%S%f")
    r = admin_session.post(
        f"{BASE_URL}/api/tenants",
        json={
            "name": f"TEST_Tenant_{suffix}",
            "phone": "+597000000",
            "email": f"test_{suffix}@example.com",
            "apartment_id": apartment_id,
        },
        timeout=15,
    )
    assert r.status_code in (200, 201), f"tenant create failed: {r.status_code} {r.text}"
    t = r.json()
    _CREATED["tenants"].append(t["id"])
    return t


def _invoices_for_tenant(session, tenant_id: str):
    r = session.get(f"{BASE_URL}/api/invoices", timeout=15)
    assert r.status_code == 200, r.text
    return [i for i in r.json() if i.get("tenant_id") == tenant_id]


def _payments_for_tenant(session, tenant_id: str):
    r = session.get(f"{BASE_URL}/api/payments", timeout=15)
    assert r.status_code == 200, r.text
    return [p for p in r.json() if p.get("tenant_id") == tenant_id]


# ---------- Tests ----------

class TestAutoInvoiceOnPayment:
    def test_admin_payment_creates_invoice(self, admin_session):
        """Bug repro: admin POST /payments for new tenant → invoice auto-created."""
        apt = _create_apartment(admin_session, rent=2500.0)
        tenant = _create_tenant(admin_session, apt["id"])

        # baseline — must be empty
        pre = _invoices_for_tenant(admin_session, tenant["id"])
        assert pre == [], f"expected no invoices, got {pre}"

        m, y = _now_period()
        r = admin_session.post(
            f"{BASE_URL}/api/payments",
            json={
                "tenant_id": tenant["id"],
                "apartment_id": apt["id"],
                "category": "huur",
                "amount": 2500,
                "currency": "SRD",
                "method": "contant",
                "period_month": m,
                "period_year": y,
                "note": "TEST auto invoice",
            },
            timeout=30,
        )
        assert r.status_code == 200, f"payment create: {r.status_code} {r.text}"

        invs = _invoices_for_tenant(admin_session, tenant["id"])
        assert len(invs) == 1, f"expected 1 auto-created invoice, got {len(invs)}: {invs}"
        inv = invs[0]
        # NOTE: auto_created_from_payment is set in Mongo but filtered by
        # InvoiceOut response model, so not exposed via API. Presence of the
        # invoice after payment (with count=0 pre-payment) is sufficient proof
        # of auto-creation.
        assert inv.get("period_month") == m
        assert inv.get("period_year") == y
        assert float(inv.get("amount", 0)) == 2500.0
        assert inv.get("status") in ("paid", "partial", "open"), inv.get("status")
        # invoice_number format F<year>-<5digit>
        num = inv.get("invoice_number", "")
        import re
        assert re.match(rf"^F{y}-\d{{5}}$", num), f"invoice_number format wrong: {num}"

        # payment must link to the invoice
        pays = _payments_for_tenant(admin_session, tenant["id"])
        assert len(pays) == 1
        assert pays[0].get("invoice_id") == inv["id"], pays[0]
        assert pays[0].get("invoice_number") == inv["invoice_number"]

    def test_existing_invoice_no_duplicate(self, admin_session):
        """REGRESSION: existing manually-created invoice → payment links to it, no duplicate."""
        apt = _create_apartment(admin_session, rent=1800.0)
        tenant = _create_tenant(admin_session, apt["id"])
        m, y = _now_period()

        # manually create invoice
        r = admin_session.post(
            f"{BASE_URL}/api/invoices",
            json={
                "tenant_id": tenant["id"],
                "apartment_id": apt["id"],
                "amount": 1800,
                "currency": "SRD",
                "period_month": m,
                "period_year": y,
            },
            timeout=15,
        )
        assert r.status_code in (200, 201), f"manual invoice: {r.status_code} {r.text}"
        manual_inv = r.json()

        # payment for same period
        r = admin_session.post(
            f"{BASE_URL}/api/payments",
            json={
                "tenant_id": tenant["id"],
                "apartment_id": apt["id"],
                "category": "huur",
                "amount": 1800,
                "currency": "SRD",
                "method": "contant",
                "period_month": m,
                "period_year": y,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text

        invs = _invoices_for_tenant(admin_session, tenant["id"])
        assert len(invs) == 1, f"expected single invoice, got {len(invs)}"
        assert invs[0]["id"] == manual_inv["id"]
        # auto_created_from_payment not exposed via API; verify it wasn't
        # auto-created by confirming the invoice_id matches the manually
        # created invoice (above).

    def test_non_huur_category_no_invoice(self, admin_session):
        """REGRESSION: category='borg' should NOT auto-create an invoice."""
        apt = _create_apartment(admin_session, rent=3000.0)
        tenant = _create_tenant(admin_session, apt["id"])
        m, y = _now_period()

        r = admin_session.post(
            f"{BASE_URL}/api/payments",
            json={
                "tenant_id": tenant["id"],
                "apartment_id": apt["id"],
                "category": "borg",
                "amount": 3000,
                "currency": "SRD",
                "method": "contant",
                "period_month": m,
                "period_year": y,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text

        invs = _invoices_for_tenant(admin_session, tenant["id"])
        assert invs == [], f"borg should not create invoice, got {invs}"

    def test_kiosk_payment_creates_invoice(self, admin_session, kiosk_session):
        """Kiosk POST /kiosk/payments (no employee_id → approved) auto-creates invoice."""
        apt = _create_apartment(admin_session, rent=2100.0)
        tenant = _create_tenant(admin_session, apt["id"])
        m, y = _now_period()

        r = kiosk_session.post(
            f"{BASE_URL}/api/kiosk/payments",
            json={
                "tenant_id": tenant["id"],
                "apartment_id": apt["id"],
                "category": "huur",
                "amount": 2100,
                "currency": "SRD",
                "method": "contant",
                "period_month": m,
                "period_year": y,
                "note": "TEST kiosk",
            },
            timeout=30,
        )
        assert r.status_code == 200, f"kiosk payment: {r.status_code} {r.text}"

        invs = _invoices_for_tenant(admin_session, tenant["id"])
        assert len(invs) == 1, f"kiosk should auto-create invoice, got {invs}"
        # auto_created_from_payment set in DB but not exposed via API.
        assert float(invs[0].get("amount")) == 2100.0

    def test_idempotency_two_payments_same_period(self, admin_session):
        """Two payments same tenant + period → only ONE auto-invoice."""
        apt = _create_apartment(admin_session, rent=1500.0)
        tenant = _create_tenant(admin_session, apt["id"])
        m, y = _now_period()

        payload = {
            "tenant_id": tenant["id"],
            "apartment_id": apt["id"],
            "category": "huur",
            "amount": 750,  # partial
            "currency": "SRD",
            "method": "contant",
            "period_month": m,
            "period_year": y,
        }
        r1 = admin_session.post(f"{BASE_URL}/api/payments", json=payload, timeout=30)
        assert r1.status_code == 200, r1.text
        r2 = admin_session.post(f"{BASE_URL}/api/payments", json=payload, timeout=30)
        assert r2.status_code == 200, r2.text

        invs = _invoices_for_tenant(admin_session, tenant["id"])
        # Only 1 invoice for the period. Overflow may create additional
        # invoices ONLY for other periods, never a duplicate for same period.
        same_period = [i for i in invs if i.get("period_month") == m and i.get("period_year") == y]
        assert len(same_period) == 1, f"expected 1 invoice for period, got {len(same_period)}: {same_period}"
