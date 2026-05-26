"""Backend tests for employee PIN direct login via /api/auth/kiosk-pin.

NEW behavior (iteration_18):
- /api/auth/kiosk-pin now also matches active kiosk-employee PINs.
- Employee logins return {kiosk_token, employee:{id,name,pin}, admin_token=null, admin_user=null}.
- Company shared PIN still returns admin_token + admin_user (employee absent).
- PIN uniqueness across companies + employees enforced.
- Throttle (8 wrong attempts) still active.
- Regression: kiosk_token from employee login can still submit kiosk payments
  (with employee_id+pin in query) producing pending_approval.
"""
import os
import time
import pytest
import requests
import datetime as dt


def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "")
    if not url:
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


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@vastgoed.sr", "password": "admin123"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def kiosk_employees(admin_headers):
    """Return list of kiosk-role employees and ensure PINs:
       - first  → 9999 (Maria K.)
       - second → 8888 (Rayshree / other)
    """
    r = requests.get(f"{BASE_URL}/api/employees", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    emps = r.json()
    kiosk_emps = [e for e in emps if e.get("app_role") == "kiosk"]
    assert len(kiosk_emps) >= 1, "Need at least 1 kiosk employee"

    # Reset first → 9999
    r1 = requests.post(
        f"{BASE_URL}/api/employees/{kiosk_emps[0]['id']}/kiosk-pin",
        json={"pin": "9999"}, headers=admin_headers, timeout=15,
    )
    assert r1.status_code == 200, r1.text

    # If a second kiosk employee exists, reset to 8888
    if len(kiosk_emps) >= 2:
        r2 = requests.post(
            f"{BASE_URL}/api/employees/{kiosk_emps[1]['id']}/kiosk-pin",
            json={"pin": "8888"}, headers=admin_headers, timeout=15,
        )
        assert r2.status_code == 200, r2.text
    else:
        # Promote another employee to kiosk role with PIN 8888
        non_kiosk = [e for e in emps if e.get("app_role") != "kiosk"]
        if non_kiosk:
            r2 = requests.post(
                f"{BASE_URL}/api/employees/{non_kiosk[0]['id']}/kiosk-pin",
                json={"pin": "8888"}, headers=admin_headers, timeout=15,
            )
            assert r2.status_code == 200, r2.text
            kiosk_emps.append(non_kiosk[0])
    return kiosk_emps


@pytest.fixture(scope="module")
def occupied_apartment(admin_headers):
    r = requests.get(f"{BASE_URL}/api/apartments", headers=admin_headers, timeout=15)
    apts = r.json()
    occ = [a for a in apts if a.get("status") == "occupied" or a.get("tenant_id")]
    assert occ, "Need an occupied apartment"
    apt = occ[0]
    if not apt.get("tenant_id"):
        r2 = requests.get(f"{BASE_URL}/api/tenants", headers=admin_headers, timeout=15)
        tenant = next((t for t in r2.json() if t.get("apartment_id") == apt["id"]), None)
        assert tenant
        apt["tenant_id"] = tenant["id"]
    return apt


# ===== /api/auth/kiosk-pin behavior =====
class TestKioskPinLogin:
    def test_employee_pin_returns_employee_no_admin_token(self, kiosk_employees):
        # IMPORTANT: ensure throttle is fresh by waiting between bad-PIN tests in
        # other classes. We use a fresh session.
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/kiosk-pin", json={"pin": "9999"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("token"), "kiosk_token missing"
        # NEW employee branch
        assert body.get("admin_token") is None, "Employee login MUST NOT return admin_token"
        assert body.get("admin_user") is None
        emp = body.get("employee")
        assert emp and emp.get("id") == kiosk_employees[0]["id"]
        assert emp.get("name")
        assert emp.get("pin") == "9999"

    def test_company_pin_returns_admin_token(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/kiosk-pin", json={"pin": "1234"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("token")
        assert body.get("admin_token"), "Company PIN MUST return admin_token"
        assert body.get("admin_user")
        assert body["admin_user"].get("role") == "admin"
        # Employee field should NOT be present (or be falsy)
        assert not body.get("employee"), "Company-PIN login must not carry employee"

    def test_company_admin_token_usable_for_me(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/kiosk-pin", json={"pin": "1234"}, timeout=15)
        admin_tok = r.json().get("admin_token")
        assert admin_tok
        r2 = s.get(f"{BASE_URL}/api/auth/me",
                   headers={"Authorization": f"Bearer {admin_tok}"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("role") == "admin"

    def test_invalid_pin_returns_401(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/kiosk-pin", json={"pin": "0000"}, timeout=15)
        # Could be 401 (bad pin) OR 429 (already locked from prior tests). Both acceptable.
        assert r.status_code in (401, 429), r.text


# ===== PIN uniqueness =====
class TestPinUniqueness:
    def test_employee_pin_clash_with_company_pin(self, admin_headers, kiosk_employees):
        # Try setting employee PIN to '1234' (company shared PIN) → 409
        r = requests.post(
            f"{BASE_URL}/api/employees/{kiosk_employees[0]['id']}/kiosk-pin",
            json={"pin": "1234"}, headers=admin_headers, timeout=15,
        )
        assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"
        assert "PIN" in r.text or "pin" in r.text

    def test_employee_pin_clash_with_other_employee(self, admin_headers, kiosk_employees):
        if len(kiosk_employees) < 2:
            pytest.skip("Need 2 kiosk employees to test inter-employee uniqueness")
        # Try setting employee[1] PIN to '9999' (Maria's) → 409 + name in detail
        r = requests.post(
            f"{BASE_URL}/api/employees/{kiosk_employees[1]['id']}/kiosk-pin",
            json={"pin": "9999"}, headers=admin_headers, timeout=15,
        )
        assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"
        body = r.json()
        detail = body.get("detail", "")
        assert kiosk_employees[0]["name"].split()[0].lower() in detail.lower(), (
            f"Expected Maria name in detail, got: {detail}"
        )

    def test_kiosk_set_pin_clash_with_employee(self, admin_headers, kiosk_employees):
        """POST /api/auth/kiosk-set-pin with PIN equal to existing employee PIN → 409."""
        r = requests.post(
            f"{BASE_URL}/api/auth/kiosk-set-pin",
            json={"pin": "9999"}, headers=admin_headers, timeout=15,
        )
        assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "medewerker" in detail.lower(), f"Expected employee mention, got: {detail}"


# ===== Regression: kiosk payment flow still works =====
class TestKioskPaymentRegression:
    def test_employee_kiosk_token_can_submit_pending(self, occupied_apartment, kiosk_employees):
        # Sleep to clear potential throttle from earlier classes
        time.sleep(2)
        s = requests.Session()
        # Login via employee PIN to get kiosk_token
        r = s.post(f"{BASE_URL}/api/auth/kiosk-pin", json={"pin": "9999"}, timeout=15)
        if r.status_code == 429:
            pytest.skip("Throttled — wait or run earlier")
        assert r.status_code == 200, r.text
        kiosk_tok = r.json()["token"]
        emp_id = r.json()["employee"]["id"]

        now = dt.datetime.utcnow()
        payload = {
            "tenant_id": occupied_apartment["tenant_id"],
            "apartment_id": occupied_apartment["id"],
            "amount": 75.0,
            "currency": "SRD",
            "category": "huur",
            "method": "contant",
            "period_month": now.month,
            "period_year": now.year,
            "note": "TEST employee-direct-login pending",
        }
        r2 = s.post(
            f"{BASE_URL}/api/kiosk/payments?employee_id={emp_id}&employee_pin=9999",
            json=payload,
            headers={"Authorization": f"Bearer {kiosk_tok}"},
            timeout=20,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json().get("status") == "pending_approval"
        assert r2.json().get("kiosk_employee_id") == emp_id


# ===== PIN throttling (runs LAST because it locks the IP for 5min) =====
class TestZPinThrottle:
    def test_throttle_locks_after_8_bad_attempts(self):
        """Make sequential bad attempts → expect 429 by attempt #9 (or earlier).
        We use the same session/IP. Note: prior tests may have added attempts."""
        s = requests.Session()
        statuses = []
        locked = False
        for _ in range(10):
            r = s.post(f"{BASE_URL}/api/auth/kiosk-pin", json={"pin": "7777"}, timeout=15)
            statuses.append(r.status_code)
            if r.status_code == 429:
                locked = True
                break
        assert locked, f"Expected 429 lockout, got sequence: {statuses}"
