"""End-to-end backend test for Payment Approval Workflow.

Covers:
- Admin login (JWT)
- Kiosk PIN login (kiosk_token)
- Reset & verify employee kiosk PIN
- Create kiosk payment WITH employee → pending_approval
- pending-count + GET /payments?status=pending_approval list
- Approve payment with signature → status=approved + invoice linkage
- Reject another pending payment → status=rejected
- Legacy path (no employee_id) → status=approved direct (backward compat)
"""
import os
import pytest
import requests
import datetime as dt

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "")
    if not url:
        # Fall back to frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return url.rstrip("/")


BASE_URL = _load_backend_url()
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

SIG = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA"
    "DUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


# ---- shared fixtures ----
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@vastgoed.sr", "password": "admin123"},
        timeout=15,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def kiosk_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/kiosk-pin", json={"pin": "1234"}, timeout=15
    )
    assert r.status_code == 200, f"Kiosk PIN failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def kiosk_headers(kiosk_token):
    return {"Authorization": f"Bearer {kiosk_token}"}


@pytest.fixture(scope="module")
def first_kiosk_employee(admin_headers):
    """Get first kiosk employee + reset PIN to '9999'."""
    r = requests.get(f"{BASE_URL}/api/employees", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    employees = r.json()
    kiosk_emps = [e for e in employees if e.get("app_role") == "kiosk"]
    assert kiosk_emps, f"No kiosk employees found. Total employees: {len(employees)}"
    emp = kiosk_emps[0]
    # Reset PIN to 9999 for stable testing
    r = requests.post(
        f"{BASE_URL}/api/employees/{emp['id']}/kiosk-pin",
        json={"pin": "9999"},
        headers=admin_headers,
        timeout=15,
    )
    assert r.status_code == 200, f"PIN reset failed: {r.text}"
    return emp


@pytest.fixture(scope="module")
def occupied_apartment(admin_headers):
    """Find first occupied apartment + its tenant."""
    r = requests.get(f"{BASE_URL}/api/apartments", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    apts = r.json()
    occupied = [a for a in apts if a.get("status") == "occupied" or a.get("tenant_id")]
    assert occupied, "No occupied apartment found"
    apt = occupied[0]
    # Get tenant
    if not apt.get("tenant_id"):
        # Fallback: lookup tenants via tenants endpoint
        r2 = requests.get(f"{BASE_URL}/api/tenants", headers=admin_headers, timeout=15)
        tenants = r2.json()
        tenant = next((t for t in tenants if t.get("apartment_id") == apt["id"]), None)
        assert tenant, f"No tenant for apartment {apt['id']}"
        apt["tenant_id"] = tenant["id"]
    return apt


# ===== Auth =====
class TestAuth:
    def test_admin_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_kiosk_pin_login(self, kiosk_token):
        assert isinstance(kiosk_token, str) and len(kiosk_token) > 20

    def test_employee_verify(self, kiosk_headers, first_kiosk_employee):
        r = requests.post(
            f"{BASE_URL}/api/kiosk/employee-verify",
            json={"pin": "9999"},
            headers=kiosk_headers,
            timeout=15,
        )
        assert r.status_code == 200, f"employee-verify failed: {r.text}"
        body = r.json()
        assert body["employee_id"] == first_kiosk_employee["id"]
        assert "employee_name" in body

    def test_employee_verify_wrong_pin(self, kiosk_headers, first_kiosk_employee):
        r = requests.post(
            f"{BASE_URL}/api/kiosk/employee-verify",
            json={"pin": "0000"},
            headers=kiosk_headers,
            timeout=15,
        )
        assert r.status_code == 401


# ===== Payment Approval Workflow =====
class TestApprovalWorkflow:
    @pytest.fixture(scope="class")
    def pending_payment(self, kiosk_headers, first_kiosk_employee, occupied_apartment, admin_headers):
        """Create a pending payment via kiosk with employee_id."""
        now = dt.datetime.utcnow()
        payload = {
            "tenant_id": occupied_apartment["tenant_id"],
            "apartment_id": occupied_apartment["id"],
            "amount": float(occupied_apartment.get("rent_amount") or 1000),
            "currency": occupied_apartment.get("rent_currency", "SRD"),
            "category": "huur",
            "method": "contant",
            "period_month": now.month,
            "period_year": now.year,
            "note": "TEST approval flow",
        }
        emp_id = first_kiosk_employee["id"]
        r = requests.post(
            f"{BASE_URL}/api/kiosk/payments?employee_id={emp_id}&employee_pin=9999",
            json=payload,
            headers=kiosk_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"kiosk payment failed: {r.status_code} {r.text}"
        p = r.json()
        assert p["status"] == "pending_approval", f"Expected pending_approval, got {p.get('status')}"
        assert p.get("kiosk_employee_id") == emp_id
        return p

    def test_payment_created_as_pending(self, pending_payment):
        assert pending_payment["status"] == "pending_approval"
        assert pending_payment.get("id")
        assert pending_payment.get("kiosk_employee_id")

    def test_pending_count_increases(self, admin_headers, pending_payment):
        r = requests.get(
            f"{BASE_URL}/api/payments/pending-count", headers=admin_headers, timeout=15
        )
        assert r.status_code == 200
        assert r.json()["count"] >= 1

    def test_pending_list_contains_payment(self, admin_headers, pending_payment):
        r = requests.get(
            f"{BASE_URL}/api/payments?status=pending_approval",
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert pending_payment["id"] in ids

    def test_approve_payment(self, admin_headers, pending_payment):
        # Snapshot pending count
        c0 = requests.get(
            f"{BASE_URL}/api/payments/pending-count", headers=admin_headers, timeout=15
        ).json()["count"]
        r = requests.post(
            f"{BASE_URL}/api/payments/{pending_payment['id']}/approve",
            json={"signature_data_url": SIG},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"approve failed: {r.text}"
        body = r.json()
        assert body["status"] == "approved"
        assert body.get("signature_data_url", "").startswith("data:image/")
        assert body.get("approved_at")
        assert body.get("approved_by")
        # Pending count should decrease
        c1 = requests.get(
            f"{BASE_URL}/api/payments/pending-count", headers=admin_headers, timeout=15
        ).json()["count"]
        assert c1 == c0 - 1

    def test_approved_payment_not_in_pending_list(self, admin_headers, pending_payment):
        r = requests.get(
            f"{BASE_URL}/api/payments?status=pending_approval",
            headers=admin_headers,
            timeout=15,
        )
        ids = [p["id"] for p in r.json()]
        assert pending_payment["id"] not in ids

    def test_approved_payment_optionally_linked_to_invoice(
        self, admin_headers, pending_payment
    ):
        # Fetch fresh payment from approved list
        r = requests.get(
            f"{BASE_URL}/api/payments?status=all",
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200
        p = next((x for x in r.json() if x["id"] == pending_payment["id"]), None)
        assert p, "approved payment not found"
        # Invoice linkage is optional (only if matching invoice existed). Just log.
        print(f"invoice_id linked: {p.get('invoice_id')}")


class TestRejectFlow:
    def test_reject_pending(
        self, kiosk_headers, admin_headers, first_kiosk_employee, occupied_apartment
    ):
        now = dt.datetime.utcnow()
        payload = {
            "tenant_id": occupied_apartment["tenant_id"],
            "apartment_id": occupied_apartment["id"],
            "amount": 250.0,
            "currency": "SRD",
            "category": "huur",
            "method": "contant",
            "period_month": now.month,
            "period_year": now.year,
            "note": "TEST reject flow",
        }
        emp_id = first_kiosk_employee["id"]
        r = requests.post(
            f"{BASE_URL}/api/kiosk/payments?employee_id={emp_id}&employee_pin=9999",
            json=payload,
            headers=kiosk_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        assert r.json()["status"] == "pending_approval"

        r2 = requests.post(
            f"{BASE_URL}/api/payments/{pid}/reject",
            json={"reason": "test"},
            headers=admin_headers,
            timeout=15,
        )
        assert r2.status_code == 200, f"reject failed: {r2.text}"
        body = r2.json()
        assert body["status"] == "rejected"
        assert body.get("rejected_reason") == "test" or body.get("reject_reason") == "test"


class TestLegacyKioskPayment:
    def test_legacy_no_employee_id_is_approved(
        self, kiosk_headers, occupied_apartment
    ):
        now = dt.datetime.utcnow()
        payload = {
            "tenant_id": occupied_apartment["tenant_id"],
            "apartment_id": occupied_apartment["id"],
            "amount": 100.0,
            "currency": "SRD",
            "category": "huur",
            "method": "contant",
            "period_month": now.month,
            "period_year": now.year,
            "note": "TEST legacy",
        }
        r = requests.post(
            f"{BASE_URL}/api/kiosk/payments",
            json=payload,
            headers=kiosk_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "approved", (
            f"Legacy path should auto-approve, got {body.get('status')}"
        )
        assert not body.get("kiosk_employee_id")
