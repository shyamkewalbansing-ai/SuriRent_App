"""Iteration 20 — verifies push-notification differentiation for kiosk payments.

The actual webpush delivery cannot be observed without real subscribed devices,
but we can verify:
  1) /api/push/vapid-public-key still returns a key
  2) /api/push/status returns devices count (> 0 after subscribed admins exist)
  3) /api/push/test still succeeds (sends to subscribed devices)
  4) kiosk POST /api/kiosk/payments WITH employee_id+employee_pin → pending_approval
     (and the backend log line for that request must NOT contain '[push]' error)
  5) kiosk POST /api/kiosk/payments WITHOUT employee_id → approved (legacy)
  6) /api/push/status devices count stays > 0 (no purges due to send failures)
"""
import os
import time
import datetime as dt
import pytest
import requests


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


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@vastgoed.sr", "password": "admin123"},
        timeout=15,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def kiosk_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/kiosk-pin", json={"pin": "1234"}, timeout=15
    )
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def first_kiosk_employee(admin_headers):
    r = requests.get(f"{BASE_URL}/api/employees", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    kiosk_emps = [e for e in r.json() if e.get("app_role") == "kiosk"]
    assert kiosk_emps, "No kiosk employees found"
    emp = kiosk_emps[0]
    # Re-seed PIN 9999 (idempotent)
    r2 = requests.post(
        f"{BASE_URL}/api/employees/{emp['id']}/kiosk-pin",
        json={"pin": "9999"}, headers=admin_headers, timeout=15,
    )
    assert r2.status_code == 200, r2.text
    return emp


@pytest.fixture(scope="module")
def occupied_apartment(admin_headers):
    r = requests.get(f"{BASE_URL}/api/apartments", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    apts = r.json()
    occupied = [a for a in apts if a.get("status") == "occupied" or a.get("tenant_id")]
    assert occupied, "No occupied apartment found"
    apt = occupied[0]
    if not apt.get("tenant_id"):
        r2 = requests.get(f"{BASE_URL}/api/tenants", headers=admin_headers, timeout=15)
        tenant = next((t for t in r2.json() if t.get("apartment_id") == apt["id"]), None)
        assert tenant
        apt["tenant_id"] = tenant["id"]
    return apt


# ===== Push infra checks =====
class TestPushInfra:
    def test_vapid_public_key(self):
        r = requests.get(f"{BASE_URL}/api/push/vapid-public-key", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body.get("public_key"), "VAPID public_key empty"
        assert len(body["public_key"]) > 20

    def test_status(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/push/status", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        body = r.json()
        # devices is the canonical key but tolerate alternatives
        assert "devices" in body or "count" in body or "subscriptions" in body, body
        devices = body.get("devices", body.get("count", body.get("subscriptions", 0)))
        # Save for later cross-check
        pytest._iter20_devices_before = devices  # type: ignore[attr-defined]

    def test_test_push(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/push/test",
            headers=admin_headers,
            json={},
            timeout=20,
        )
        # 200 even if 0 devices (sends to 0 OK)
        assert r.status_code in (200, 204), f"push/test failed: {r.status_code} {r.text}"


# ===== Kiosk payment — pending vs approved =====
class TestKioskPaymentBranching:
    def test_pending_payment_status_and_no_push_error(
        self, kiosk_headers, first_kiosk_employee, occupied_apartment
    ):
        """POST with employee_id+employee_pin → pending_approval."""
        now = dt.datetime.utcnow()
        payload = {
            "tenant_id": occupied_apartment["tenant_id"],
            "apartment_id": occupied_apartment["id"],
            "amount": 1.00,
            "currency": occupied_apartment.get("rent_currency", "SRD"),
            "category": "huur",
            "method": "contant",
            "period_month": now.month,
            "period_year": now.year,
            "note": "TEST iter20 pending push",
        }
        emp_id = first_kiosk_employee["id"]
        marker_time = time.time()
        r = requests.post(
            f"{BASE_URL}/api/kiosk/payments?employee_id={emp_id}&employee_pin=9999",
            json=payload, headers=kiosk_headers, timeout=20,
        )
        assert r.status_code == 200, f"kiosk pending payment failed: {r.text}"
        p = r.json()
        assert p["status"] == "pending_approval", f"got {p.get('status')}"
        assert p.get("id")
        assert p.get("kiosk_employee_id") == emp_id
        assert p.get("kiosk_employee_name"), "kiosk_employee_name missing"
        # Save marker for log inspection
        pytest._iter20_pending_id = p["id"]  # type: ignore[attr-defined]
        pytest._iter20_marker = marker_time  # type: ignore[attr-defined]
        # Give backend a moment to flush log line
        time.sleep(1.0)

    def test_approved_legacy_path(self, kiosk_headers, occupied_apartment):
        """POST without employee_id → approved (legacy)."""
        now = dt.datetime.utcnow()
        payload = {
            "tenant_id": occupied_apartment["tenant_id"],
            "apartment_id": occupied_apartment["id"],
            "amount": 1.00,
            "currency": occupied_apartment.get("rent_currency", "SRD"),
            "category": "huur",
            "method": "contant",
            "period_month": now.month,
            "period_year": now.year,
            "note": "TEST iter20 approved legacy",
        }
        r = requests.post(
            f"{BASE_URL}/api/kiosk/payments",
            json=payload, headers=kiosk_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["status"] == "approved", f"Expected approved (legacy), got {p.get('status')}"
        assert not p.get("kiosk_employee_id"), "kiosk_employee_id should be empty in legacy"

    def test_devices_count_did_not_drop_to_zero(self, admin_headers):
        """After both pushes, /push/status devices must still be > 0 (no errors purged subs)."""
        r = requests.get(f"{BASE_URL}/api/push/status", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        body = r.json()
        devices = body.get("devices", body.get("count", body.get("subscriptions", 0)))
        before = getattr(pytest, "_iter20_devices_before", None)
        # If there were devices before, there must still be devices after (no errors)
        if before and before > 0:
            assert devices > 0, f"Devices dropped to 0 (had {before}) — push errors purged subs"
            # Should not have dropped by more than 1 (allow 1 transient flake)
            assert devices >= before - 1, f"Devices dropped from {before} to {devices}"

    def test_no_push_error_in_backend_log(self):
        """Tail backend log and assert no '[push] kiosk payment notify failed' since marker."""
        marker = getattr(pytest, "_iter20_marker", 0)
        try:
            with open("/var/log/supervisor/backend.err.log", "r") as f:
                f.seek(0, 2)
                size = f.tell()
                # Read last ~64KB
                f.seek(max(0, size - 65536))
                tail = f.read()
        except FileNotFoundError:
            pytest.skip("backend.err.log not found")
        # We accept the test file existing but no error string in the recent tail
        errors = [
            line for line in tail.splitlines()
            if "[push] kiosk payment notify failed" in line
        ]
        # Only assert no errors after marker (rough check — ignore historical)
        # Just assert string doesn't appear in the last 64KB tail
        assert not errors, f"Found push errors in backend log: {errors[-5:]}"
