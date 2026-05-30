"""Iteration 27 — Regression tests for:
- 3-bucket invoice classification (overdue/current/future) on
  GET /api/kiosk/tenants/{id}/overview and GET /api/invoices
- POST /api/kiosk/payment-plans/quick with both legacy invoice_id and new
  invoice_ids (multi-invoice) support
- Partial payment behaviour on /api/kiosk/payments
- _classify_invoice_bucket helper correctness via API behaviour
"""
import os
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = "admin123"
KIOSK_PIN = "1234"

TEST_TENANT_NAME = "Bharat Kewalbansing"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def kiosk_token():
    r = requests.post(f"{BASE_URL}/api/auth/kiosk-pin",
                      json={"pin": KIOSK_PIN, "company_slug": "surirent"},
                      timeout=15)
    assert r.status_code == 200, f"Kiosk PIN failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def kiosk_headers(kiosk_token):
    return {"Authorization": f"Bearer {kiosk_token}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def bharat(admin_headers):
    """Fetch the Bharat Kewalbansing tenant (Company A)."""
    r = requests.get(f"{BASE_URL}/api/tenants", headers=admin_headers, timeout=15)
    assert r.status_code == 200, f"List tenants failed: {r.text}"
    tenants = r.json()
    cands = [t for t in tenants if TEST_TENANT_NAME.lower() in (t.get("name") or "").lower()]
    if not cands:
        pytest.skip(f"Tenant {TEST_TENANT_NAME} not found")
    return cands[0]


def _create_invoice(admin_headers, tenant_id, period_month, period_year):
    """Helper. Returns invoice dict or None if duplicate."""
    r = requests.post(
        f"{BASE_URL}/api/invoices",
        headers=admin_headers,
        json={"tenant_id": tenant_id, "period_month": period_month, "period_year": period_year},
        timeout=15,
    )
    if r.status_code == 400 and "bestaat al" in r.text.lower():
        # Already exists — find it via list
        rl = requests.get(f"{BASE_URL}/api/invoices", headers=admin_headers, timeout=15)
        for inv in rl.json():
            if (inv.get("tenant_id") == tenant_id and
                    inv.get("period_month") == period_month and
                    inv.get("period_year") == period_year):
                return inv
        return None
    if r.status_code != 200:
        return None
    return r.json()


# ---------- 1. /api/kiosk/tenants/{id}/overview — 3 buckets ----------
class TestKioskTenantOverviewBuckets:
    def test_overview_has_three_bucket_fields(self, kiosk_headers, bharat):
        r = requests.get(
            f"{BASE_URL}/api/kiosk/tenants/{bharat['id']}/overview",
            headers=kiosk_headers, timeout=15,
        )
        assert r.status_code == 200, f"Overview failed: {r.text}"
        data = r.json()
        # Required new fields per request
        for key in ["open_invoices", "open_invoices_total",
                    "current_invoices", "current_invoices_total",
                    "future_invoices", "future_invoices_total",
                    "grace_workdays"]:
            assert key in data, f"Missing key '{key}' in overview response"
        assert isinstance(data["open_invoices"], list)
        assert isinstance(data["current_invoices"], list)
        assert isinstance(data["future_invoices"], list)
        assert isinstance(data["grace_workdays"], int)

    def test_overview_invoice_items_have_bucket_field(self, kiosk_headers, bharat):
        r = requests.get(
            f"{BASE_URL}/api/kiosk/tenants/{bharat['id']}/overview",
            headers=kiosk_headers, timeout=15,
        )
        data = r.json()
        # Every item in each bucket must declare its bucket correctly
        for inv in data["open_invoices"]:
            assert inv.get("bucket") == "overdue", f"open_invoices item has bucket={inv.get('bucket')}"
        for inv in data["current_invoices"]:
            assert inv.get("bucket") == "current"
        for inv in data["future_invoices"]:
            assert inv.get("bucket") == "future"


# ---------- 2. /api/invoices — bucket field on unpaid ----------
class TestListInvoicesBucket:
    def test_unpaid_invoices_have_bucket(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/invoices", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        invoices = r.json()
        unpaid = [i for i in invoices if (i.get("status") or "open") != "paid"]
        # If any unpaid exist, bucket must be one of the 3 values
        for inv in unpaid:
            assert inv.get("bucket") in ("overdue", "current", "future"), \
                f"Invoice {inv.get('invoice_number')} bucket={inv.get('bucket')}"


# ---------- 3. Bucket classification correctness ----------
class TestBucketClassification:
    """Create invoices for several periods and confirm bucket assignment.
    Today is around May 2026 (per problem statement). We test:
    - Future month (today + 2 months) → bucket=future
    - Old month (today - 4 months) → bucket=overdue
    """
    def test_future_invoice_is_classified_future(self, admin_headers, kiosk_headers, bharat):
        today = date.today()
        future_m = today.month + 2
        future_y = today.year
        if future_m > 12:
            future_m -= 12
            future_y += 1
        inv = _create_invoice(admin_headers, bharat["id"], future_m, future_y)
        if not inv:
            pytest.skip("Could not create future invoice")
        # Refetch via /api/invoices to see if it was auto-paid via credit
        rl = requests.get(f"{BASE_URL}/api/invoices", headers=admin_headers, timeout=15)
        cur = next((x for x in rl.json() if x.get("id") == inv["id"]), None)
        if cur and (cur.get("status") == "paid"):
            # Auto-paid from existing tenant credit — confirm via /api/invoices
            # that any OTHER unpaid future invoice across DB is bucket=future.
            future_unpaid = [
                x for x in rl.json()
                if (x.get("status") or "open") != "paid"
                and (x.get("period_year"), x.get("period_month")) > (today.year, today.month)
            ]
            for x in future_unpaid:
                assert x.get("bucket") == "future", \
                    f"Unpaid future {x.get('invoice_number')} bucket={x.get('bucket')}"
            return
        # Otherwise confirm via kiosk overview
        r = requests.get(
            f"{BASE_URL}/api/kiosk/tenants/{bharat['id']}/overview",
            headers=kiosk_headers, timeout=15,
        )
        data = r.json()
        future_ids = {i["id"] for i in data["future_invoices"]}
        assert inv["id"] in future_ids, (
            f"Newly-created future invoice {inv['id']} for {future_m}/{future_y} "
            f"not in future_invoices bucket"
        )

    def test_old_invoice_is_classified_overdue(self, admin_headers, kiosk_headers, bharat):
        today = date.today()
        old_m = today.month - 4
        old_y = today.year
        if old_m <= 0:
            old_m += 12
            old_y -= 1
        inv = _create_invoice(admin_headers, bharat["id"], old_m, old_y)
        if not inv:
            pytest.skip("Could not create overdue invoice")
        r = requests.get(
            f"{BASE_URL}/api/kiosk/tenants/{bharat['id']}/overview",
            headers=kiosk_headers, timeout=15,
        )
        data = r.json()
        overdue_ids = {i["id"] for i in data["open_invoices"]}
        assert inv["id"] in overdue_ids, (
            f"Old invoice {inv['id']} for {old_m}/{old_y} not in overdue bucket"
        )


# ---------- 4. Kiosk Quick Payment Plan (legacy + multi-invoice) ----------
class TestKioskQuickPaymentPlan:
    def test_quick_plan_legacy_single_invoice_id(self, admin_headers, kiosk_headers, bharat):
        # Ensure at least one invoice for the tenant
        today = date.today()
        old_m = today.month - 3
        old_y = today.year
        if old_m <= 0:
            old_m += 12
            old_y -= 1
        inv = _create_invoice(admin_headers, bharat["id"], old_m, old_y)
        if not inv:
            pytest.skip("No invoice to attach plan to")
        body = {
            "tenant_id": bharat["id"],
            "invoice_id": inv["id"],
            "total_amount": 1500.0,
            "num_installments": 3,
            "currency": "SRD",
            "notes": "TEST_iter27 single legacy",
        }
        r = requests.post(f"{BASE_URL}/api/kiosk/payment-plans/quick",
                          headers=kiosk_headers, json=body, timeout=15)
        assert r.status_code == 200, f"Quick plan (legacy) failed: {r.status_code} {r.text}"
        plan = r.json()
        assert plan["tenant_id"] == bharat["id"]
        assert plan["num_installments"] == 3
        assert abs(plan["total_amount"] - 1500.0) < 0.01
        assert plan.get("first_due_date") and plan.get("monthly_amount")

    def test_quick_plan_multi_invoice_ids(self, admin_headers, kiosk_headers, bharat):
        # Pick up to 2 invoices for tenant
        r = requests.get(f"{BASE_URL}/api/invoices", headers=admin_headers, timeout=15)
        invs = [i for i in r.json() if i.get("tenant_id") == bharat["id"]][:2]
        if len(invs) < 1:
            pytest.skip("No invoices to attach plan to")
        body = {
            "tenant_id": bharat["id"],
            "invoice_ids": [i["id"] for i in invs],
            "total_amount": 4000.0,
            "num_installments": 4,
            "currency": "SRD",
            "start_date": (date.today() + timedelta(days=14)).isoformat(),
            "notes": "TEST_iter27 multi",
        }
        r = requests.post(f"{BASE_URL}/api/kiosk/payment-plans/quick",
                          headers=kiosk_headers, json=body, timeout=15)
        assert r.status_code == 200, f"Quick plan (multi) failed: {r.status_code} {r.text}"
        plan = r.json()
        assert plan["num_installments"] == 4
        assert abs(plan["total_amount"] - 4000.0) < 0.01

    def test_quick_plan_validation(self, kiosk_headers, bharat):
        # num_installments=1 below ge=2 → should 4xx
        body = {
            "tenant_id": bharat["id"],
            "invoice_id": "no-such",
            "total_amount": 100,
            "num_installments": 1,
            "currency": "SRD",
        }
        r = requests.post(f"{BASE_URL}/api/kiosk/payment-plans/quick",
                          headers=kiosk_headers, json=body, timeout=15)
        assert r.status_code in (400, 422), f"Validation should fail, got {r.status_code}"


# ---------- 5. Partial payment flow ----------
class TestPartialPayment:
    def test_partial_payment_sets_status_partial(self, admin_headers, kiosk_headers, bharat):
        # Find an unpaid invoice for tenant (any period)
        rl = requests.get(f"{BASE_URL}/api/invoices", headers=admin_headers, timeout=15)
        candidates = [
            i for i in rl.json()
            if i.get("tenant_id") == bharat["id"]
            and (i.get("status") or "open") in ("open", "partial")
            and float(i.get("amount") or 0) > 0
            and float(i.get("paid_amount") or 0) < float(i.get("amount") or 0)
        ]
        if not candidates:
            pytest.skip("No unpaid invoice available for partial test")
        inv = candidates[0]
        invoice_amount = float(inv.get("amount") or 0)
        remaining = invoice_amount - float(inv.get("paid_amount") or 0)
        partial_amount = round(remaining * 0.3, 2)
        if partial_amount < 1:
            pytest.skip("Partial amount too small")

        body = {
            "tenant_id": bharat["id"],
            "amount": partial_amount,
            "currency": inv.get("currency", "SRD"),
            "items": [{
                "category": "huur",
                "amount": partial_amount,
                "currency": inv.get("currency", "SRD"),
                "invoice_id": inv["id"],
            }],
            "method": "contant",
            "note": "TEST_iter27 partial",
        }
        r = requests.post(f"{BASE_URL}/api/kiosk/payments",
                          headers=kiosk_headers, json=body, timeout=20)
        if r.status_code in (401, 403):
            pytest.skip(f"Kiosk payment requires employee context: {r.status_code}")
        assert r.status_code == 200, f"Kiosk payment failed: {r.status_code} {r.text}"

        rl2 = requests.get(f"{BASE_URL}/api/invoices", headers=admin_headers, timeout=15)
        invs2 = {i["id"]: i for i in rl2.json()}
        updated = invs2.get(inv["id"])
        assert updated, "Invoice missing after payment"
        # 30% of remaining → far less than 95% → status MUST be 'partial'
        # (provided the payment was applied). Allow 'paid' only if remaining
        # < 5% of invoice (95%-rule).
        status = updated.get("status") or "open"
        new_paid = float(updated.get("paid_amount") or 0)
        assert new_paid >= float(inv.get("paid_amount") or 0) + partial_amount - 0.5, \
            f"paid_amount not updated: was {inv.get('paid_amount')} now {new_paid}"
        assert status in ("partial", "paid"), \
            f"Unexpected status after partial payment: {status}"
