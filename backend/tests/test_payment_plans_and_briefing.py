"""Iteration 26 — Tests for Betalingsregeling (Payment Plans) + Morning Briefing.

Covers:
  - Admin CRUD on /api/payment-plans (list, create, get-by-id, mark paid, cancel)
  - Tenant portal: GET /tenant-portal/payment-plans + POST .../installments/{seq}/pay
  - Kiosk: GET /kiosk/tenants/{tenant_id}/payment-plans + POST kiosk pay
  - Admin morning briefing /api/admin/morning-briefing
"""
import os
import time
import pytest
import requests
from pathlib import Path

# Load REACT_APP_BACKEND_URL from frontend .env if not set in environment
def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")

BASE_URL = _load_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
KIOSK_PIN = "1234"
EMPLOYEE_PIN = "9999"  # Maria K.
TENANT_NAME = "Bharat Kewalbansing"
TENANT_IDENTIFIER = "shyam@kewalbansing.net"
TENANT_PIN = "4242"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def jan_tenant_id(admin_headers):
    """Find test tenant (Bharat) in current company."""
    r = requests.get(f"{API}/tenants", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    for t in r.json():
        if (t.get("name") or "").strip().lower() == TENANT_NAME.lower():
            return t["id"]
    pytest.skip(f"Tenant {TENANT_NAME} not found")


@pytest.fixture(scope="module")
def tenant_token():
    r = requests.post(f"{API}/tenant-portal/login",
                      json={"identifier": TENANT_IDENTIFIER, "pin": TENANT_PIN},
                      timeout=15)
    assert r.status_code == 200, f"tenant login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def kiosk_token():
    r = requests.post(f"{API}/auth/kiosk-pin",
                      json={"pin": KIOSK_PIN}, timeout=15)
    assert r.status_code == 200, f"kiosk-pin failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def maria_employee_id(admin_headers):
    r = requests.get(f"{API}/employees", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    for e in r.json():
        if e.get("app_role") == "kiosk" and (e.get("name") or "").startswith("Maria"):
            return e["id"]
    pytest.skip("Maria K. kiosk employee not found")


# ---------- ADMIN: Payment Plans CRUD ----------
class TestAdminPaymentPlans:
    @pytest.fixture(scope="class")
    def created_plan(self, admin_headers, jan_tenant_id):
        payload = {
            "tenant_id": jan_tenant_id,
            "invoice_ids": [],
            "total_amount": 300.0,
            "currency": "SRD",
            "num_installments": 3,
            "start_date": "2026-02-01",
            "frequency": "monthly",
            "notes": "TEST_iter26 plan",
        }
        r = requests.post(f"{API}/payment-plans", headers=admin_headers,
                          json=payload, timeout=20)
        assert r.status_code == 200, f"create plan failed: {r.status_code} {r.text}"
        d = r.json()
        assert d["total_amount"] == 300.0
        assert d["currency"] == "SRD"
        assert d["status"] == "active"
        assert len(d["installments"]) == 3
        assert sum(i["amount"] for i in d["installments"]) == pytest.approx(300.0, abs=0.05)
        return d

    def test_create_plan_persists(self, admin_headers, created_plan):
        # GET-by-id verifies persistence
        plan_id = created_plan["id"]
        r = requests.get(f"{API}/payment-plans/{plan_id}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == plan_id
        assert len(d["installments"]) == 3
        for i in d["installments"]:
            assert i["status"] == "pending"

    def test_list_plans_includes_new(self, admin_headers, created_plan):
        r = requests.get(f"{API}/payment-plans", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        ids = [p["id"] for p in r.json()]
        assert created_plan["id"] in ids

    def test_admin_pay_installment_seq1(self, admin_headers, created_plan):
        plan_id = created_plan["id"]
        r = requests.post(
            f"{API}/payment-plans/{plan_id}/installments/1/pay",
            headers=admin_headers,
            json={"method": "contant", "note": "TEST_iter26 admin pay"},
            timeout=20,
        )
        assert r.status_code == 200, f"admin pay failed: {r.status_code} {r.text}"
        d = r.json()
        # Find seq=1, expect paid
        inst1 = next(i for i in d["installments"] if i["sequence"] == 1)
        assert inst1["status"] == "paid"
        assert inst1["payment_id"]
        assert d["paid_amount"] == pytest.approx(100.0, abs=0.05)

        # Validate corresponding Payment doc has category=betalingsregeling
        pay_id = inst1["payment_id"]
        rp = requests.get(f"{API}/payments", headers=admin_headers, timeout=15)
        assert rp.status_code == 200
        match = [p for p in rp.json() if p.get("id") == pay_id]
        assert match, f"Payment doc {pay_id} not found"
        assert match[0]["category"] == "betalingsregeling"
        assert match[0]["status"] == "approved"

    def test_admin_cannot_double_pay(self, admin_headers, created_plan):
        plan_id = created_plan["id"]
        r = requests.post(
            f"{API}/payment-plans/{plan_id}/installments/1/pay",
            headers=admin_headers, json={"method": "contant"}, timeout=15,
        )
        assert r.status_code == 400

    def test_get_plan_invalid_id(self, admin_headers):
        r = requests.get(f"{API}/payment-plans/nonexistent-xyz",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 404


# ---------- TENANT PORTAL ----------
class TestTenantPortalPlans:
    @pytest.fixture(scope="class")
    def tenant_plan(self, admin_headers, jan_tenant_id):
        # Create a NEW plan separate from admin-class fixture (because
        # pytest-class fixtures don't share across classes by default).
        payload = {
            "tenant_id": jan_tenant_id,
            "invoice_ids": [],
            "total_amount": 200.0,
            "currency": "SRD",
            "num_installments": 2,
            "start_date": "2026-02-01",
            "frequency": "monthly",
            "notes": "TEST_iter26 tenant plan",
        }
        r = requests.post(f"{API}/payment-plans", headers=admin_headers,
                          json=payload, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    def test_tenant_list_plans(self, tenant_token, tenant_plan):
        h = {"Authorization": f"Bearer {tenant_token}"}
        r = requests.get(f"{API}/tenant-portal/payment-plans",
                         headers=h, timeout=15)
        assert r.status_code == 200, r.text
        ids = [p["id"] for p in r.json()]
        assert tenant_plan["id"] in ids

    def test_tenant_pay_installment(self, tenant_token, tenant_plan, admin_headers):
        h = {"Authorization": f"Bearer {tenant_token}",
             "Content-Type": "application/json"}
        plan_id = tenant_plan["id"]
        r = requests.post(
            f"{API}/tenant-portal/payment-plans/{plan_id}/installments/1/pay",
            headers=h, json={"method": "contant", "note": "TEST tenant pay"},
            timeout=20,
        )
        assert r.status_code == 200, f"tenant pay failed: {r.status_code} {r.text}"
        d = r.json()
        inst1 = next(i for i in d["installments"] if i["sequence"] == 1)
        assert inst1["status"] == "paid"
        # Payment doc visible to admin too
        pay_id = inst1["payment_id"]
        rp = requests.get(f"{API}/payments", headers=admin_headers, timeout=15)
        assert rp.status_code == 200
        match = [p for p in rp.json() if p.get("id") == pay_id]
        assert match
        assert match[0]["category"] == "betalingsregeling"


# ---------- KIOSK (Operator) ----------
class TestKioskPlans:
    @pytest.fixture(scope="class")
    def kiosk_plan(self, admin_headers, jan_tenant_id):
        payload = {
            "tenant_id": jan_tenant_id,
            "invoice_ids": [],
            "total_amount": 150.0,
            "currency": "SRD",
            "num_installments": 3,
            "start_date": "2026-02-01",
            "frequency": "monthly",
            "notes": "TEST_iter26 kiosk plan",
        }
        r = requests.post(f"{API}/payment-plans", headers=admin_headers,
                          json=payload, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    def test_kiosk_list_tenant_plans(self, kiosk_token, jan_tenant_id, kiosk_plan):
        h = {"Authorization": f"Bearer {kiosk_token}"}
        r = requests.get(
            f"{API}/kiosk/tenants/{jan_tenant_id}/payment-plans",
            headers=h, timeout=15,
        )
        assert r.status_code == 200, r.text
        ids = [p["id"] for p in r.json()]
        assert kiosk_plan["id"] in ids

    def test_kiosk_pay_installment_creates_pending(
        self, kiosk_token, kiosk_plan, maria_employee_id, admin_headers,
    ):
        h = {"Authorization": f"Bearer {kiosk_token}",
             "Content-Type": "application/json"}
        plan_id = kiosk_plan["id"]
        r = requests.post(
            f"{API}/kiosk/payment-plans/{plan_id}/installments/1/pay",
            headers=h,
            json={
                "method": "contant",
                "note": "TEST_iter26 kiosk pay",
                "employee_id": maria_employee_id,
                "employee_pin": EMPLOYEE_PIN,
            },
            timeout=20,
        )
        assert r.status_code == 200, f"kiosk pay failed: {r.status_code} {r.text}"
        d = r.json()
        inst1 = next(i for i in d["installments"] if i["sequence"] == 1)
        assert inst1["payment_id"], "expected payment_id on installment"
        # Status on installment is 'pending_payment' until admin approval
        assert inst1["status"] in ("pending_payment", "paid")
        # Validate Payment doc is pending_approval
        pay_id = inst1["payment_id"]
        # Default /api/payments may filter out pending_approval; try both
        rp = requests.get(f"{API}/payments?status=pending_approval",
                          headers=admin_headers, timeout=15)
        match = []
        if rp.status_code == 200:
            match = [p for p in rp.json() if p.get("id") == pay_id]
        if not match:
            rp2 = requests.get(f"{API}/payments", headers=admin_headers, timeout=15)
            if rp2.status_code == 200:
                match = [p for p in rp2.json() if p.get("id") == pay_id]
        assert match, f"Payment doc {pay_id} not found in admin lists"
        assert match[0]["status"] == "pending_approval"
        assert match[0]["category"] == "betalingsregeling"
        # Cleanup: reject the pending so it doesn't pollute admin badge
        rr = requests.post(
            f"{API}/payments/{pay_id}/reject",
            headers=admin_headers,
            json={"reason": "TEST_iter26 cleanup"}, timeout=15,
        )
        assert rr.status_code in (200, 204), rr.text

    def test_kiosk_pay_wrong_employee_pin(
        self, kiosk_token, kiosk_plan, maria_employee_id,
    ):
        h = {"Authorization": f"Bearer {kiosk_token}",
             "Content-Type": "application/json"}
        plan_id = kiosk_plan["id"]
        r = requests.post(
            f"{API}/kiosk/payment-plans/{plan_id}/installments/2/pay",
            headers=h,
            json={
                "method": "contant",
                "employee_id": maria_employee_id,
                "employee_pin": "0000",
            },
            timeout=15,
        )
        assert r.status_code == 401


# ---------- MORNING BRIEFING ----------
class TestMorningBriefing:
    def test_morning_briefing_shape(self, admin_headers):
        r = requests.get(f"{API}/admin/morning-briefing",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in (
            "date", "overdue_invoice_count", "overdue_tenant_count",
            "overdue_total_by_currency", "overdue_installment_count",
            "new_pending_today", "new_payments_today",
        ):
            assert key in d, f"missing key {key} in briefing: {d}"
        assert isinstance(d["overdue_invoice_count"], int)
        assert isinstance(d["overdue_tenant_count"], int)
        assert isinstance(d["overdue_installment_count"], int)
        assert isinstance(d["new_pending_today"], int)
        assert isinstance(d["new_payments_today"], int)
        assert isinstance(d["overdue_total_by_currency"], dict)


# ---------- CLEANUP — cancel TEST plans ----------
def test_zz_cleanup_test_plans(admin_token):
    h = {"Authorization": f"Bearer {admin_token}",
         "Content-Type": "application/json"}
    r = requests.get(f"{API}/payment-plans", headers=h, timeout=15)
    if r.status_code != 200:
        return
    for p in r.json():
        if "TEST_iter26" in (p.get("notes") or "") and p.get("status") == "active":
            requests.post(f"{API}/payment-plans/{p['id']}/cancel",
                          headers=h, timeout=15)
    # Cleanup TEST payments too — reject any pending tagged TEST
    rp = requests.get(f"{API}/payments?status=pending_approval",
                      headers=h, timeout=15)
    if rp.status_code == 200:
        for pay in rp.json():
            if "TEST_iter26" in (pay.get("note") or ""):
                requests.post(f"{API}/payments/{pay['id']}/reject",
                              headers=h, json={"reason": "cleanup"}, timeout=10)
