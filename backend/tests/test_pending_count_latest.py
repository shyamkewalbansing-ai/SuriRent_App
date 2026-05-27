"""Iteration 25 — verifies the extended shape of /api/payments/pending-count.

Backend change: GET /api/payments/pending-count now returns
  { "count": N, "latest": null | {id, amount, currency, tenant_name,
    apartment_number, received_by, category, created_at} }

This is backward compatible (count still present).

Test plan:
  1) Get current pending count + cleanup any existing pendings via approve
  2) GET pending-count when count=0 → latest must be null
  3) Create a pending via /api/kiosk/payments → GET → latest populated
     with all expected fields
  4) Create a SECOND pending → GET → latest reflects the most recent one
     (sort by created_at desc), id differs from previous
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


# ===== Fixtures =====
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
    assert r.status_code == 200
    kiosk_emps = [e for e in r.json() if e.get("app_role") == "kiosk"]
    assert kiosk_emps, "No kiosk employees found"
    emp = kiosk_emps[0]
    # Re-seed PIN 9999
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


# ===== Helpers =====
def _create_pending(kiosk_headers, employee, apt, note="TEST iter25 pending shape"):
    now = dt.datetime.utcnow()
    payload = {
        "tenant_id": apt["tenant_id"],
        "apartment_id": apt["id"],
        "amount": 1.00,
        "currency": apt.get("rent_currency", "SRD"),
        "category": "huur",
        "method": "contant",
        "period_month": now.month,
        "period_year": now.year,
        "note": note,
    }
    r = requests.post(
        f"{BASE_URL}/api/kiosk/payments?employee_id={employee['id']}&employee_pin=9999",
        json=payload, headers=kiosk_headers, timeout=20,
    )
    assert r.status_code == 200, f"Failed to create pending: {r.text}"
    p = r.json()
    assert p["status"] == "pending_approval"
    return p


def _cleanup_pendings(admin_headers):
    """Reject all currently pending payments so count starts at 0."""
    r = requests.get(
        f"{BASE_URL}/api/payments?status=pending_approval",
        headers=admin_headers, timeout=15,
    )
    if r.status_code != 200:
        return
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    for p in items:
        if p.get("status") == "pending_approval":
            requests.post(
                f"{BASE_URL}/api/payments/{p['id']}/reject",
                json={"reason": "TEST iter25 cleanup"},
                headers=admin_headers, timeout=15,
            )


# ===== Tests =====
class TestPendingCountShape:
    """Verifies the new {count, latest} response shape."""

    def test_empty_state_latest_null(self, admin_headers):
        """When count=0, latest must be null."""
        _cleanup_pendings(admin_headers)
        time.sleep(0.5)
        r = requests.get(
            f"{BASE_URL}/api/payments/pending-count",
            headers=admin_headers, timeout=10,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "count" in data, f"missing 'count' key: {data}"
        assert "latest" in data, f"missing 'latest' key: {data}"
        assert data["count"] == 0, f"Expected 0 after cleanup, got {data['count']}"
        assert data["latest"] is None, f"Expected latest=null when count=0, got {data['latest']}"

    def test_single_pending_latest_populated(
        self, admin_headers, kiosk_headers, first_kiosk_employee, occupied_apartment
    ):
        """After creating 1 pending, latest must have all expected fields."""
        # Ensure clean state
        _cleanup_pendings(admin_headers)
        time.sleep(0.5)

        created = _create_pending(kiosk_headers, first_kiosk_employee, occupied_apartment,
                                  note="TEST iter25 single pending")
        time.sleep(0.5)

        r = requests.get(
            f"{BASE_URL}/api/payments/pending-count",
            headers=admin_headers, timeout=10,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] >= 1, data
        latest = data["latest"]
        assert latest is not None, f"latest is null but count={data['count']}"

        # Required fields per review_request
        for k in ["id", "amount", "currency", "tenant_name",
                  "apartment_number", "received_by", "category", "created_at"]:
            assert k in latest, f"Missing key '{k}' in latest: {latest}"

        # Type/value sanity
        assert latest["id"] == created["id"], (
            f"latest.id ({latest['id']}) != just-created id ({created['id']})"
        )
        assert float(latest["amount"]) == 1.00
        assert latest["currency"]
        assert latest["category"] == "huur"
        # received_by should be the kiosk employee name (Maria K.) since
        # we POSTed with employee_id+employee_pin
        assert latest["received_by"], "received_by empty (should be kiosk employee name)"
        assert latest["created_at"], "created_at missing/empty"

    def test_two_pendings_latest_is_most_recent(
        self, admin_headers, kiosk_headers, first_kiosk_employee, occupied_apartment
    ):
        """When 2 pendings exist, latest must reflect the most recent (sort by created_at desc)."""
        _cleanup_pendings(admin_headers)
        time.sleep(0.5)

        first = _create_pending(kiosk_headers, first_kiosk_employee, occupied_apartment,
                                note="TEST iter25 first")
        # Sleep so created_at differs deterministically
        time.sleep(1.2)
        second = _create_pending(kiosk_headers, first_kiosk_employee, occupied_apartment,
                                 note="TEST iter25 second")
        assert first["id"] != second["id"]

        time.sleep(0.5)
        r = requests.get(
            f"{BASE_URL}/api/payments/pending-count",
            headers=admin_headers, timeout=10,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] >= 2, data
        latest = data["latest"]
        assert latest is not None
        assert latest["id"] == second["id"], (
            f"latest.id should be most-recent ({second['id']}), got {latest['id']}"
        )

    def test_backward_compat_count_only_callers(self, admin_headers):
        """A caller reading only data.count must still work — i.e. count is an int."""
        r = requests.get(
            f"{BASE_URL}/api/payments/pending-count",
            headers=admin_headers, timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["count"], int)

    def test_cleanup_after_class(self, admin_headers):
        """Teardown — reject all pendings created during this run."""
        _cleanup_pendings(admin_headers)
        r = requests.get(
            f"{BASE_URL}/api/payments/pending-count",
            headers=admin_headers, timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["count"] == 0
