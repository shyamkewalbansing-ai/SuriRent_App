"""Tests for customer display (klantenscherm) endpoints — iteration 14."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def kiosk_token():
    r = requests.post(f"{API}/auth/kiosk-pin", json={"pin": "1234"}, timeout=15)
    assert r.status_code == 200, f"kiosk-pin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="module")
def kiosk_headers(kiosk_token):
    return {"Authorization": f"Bearer {kiosk_token}", "Content-Type": "application/json"}


# ----- PUT /api/kiosk/customer-display (auth) -----
class TestPutCustomerDisplay:
    def test_put_requires_auth(self):
        r = requests.put(f"{API}/kiosk/customer-display", json={"step": "idle"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_put_idle_success(self, kiosk_headers):
        r = requests.put(f"{API}/kiosk/customer-display",
                         headers=kiosk_headers, json={"step": "idle"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_put_select_with_apartment_and_tenant(self, kiosk_headers):
        body = {
            "step": "select",
            "apartment": {"id": "apt-1", "number": "A-101"},
            "tenant": {"id": "ten-1", "name": "TEST Jan de Vries"},
        }
        r = requests.put(f"{API}/kiosk/customer-display", headers=kiosk_headers, json=body, timeout=15)
        assert r.status_code == 200, r.text

    def test_put_invalid_payload_missing_step(self, kiosk_headers):
        r = requests.put(f"{API}/kiosk/customer-display", headers=kiosk_headers, json={}, timeout=15)
        assert r.status_code == 422


# ----- GET /api/public/customer-display/{slug} (public) -----
class TestGetCustomerDisplayPublic:
    def test_get_unknown_slug_returns_404(self):
        r = requests.get(f"{API}/public/customer-display/this-slug-does-not-exist-xyz", timeout=15)
        assert r.status_code == 404

    def test_get_valid_slug_returns_branding_and_state(self, kiosk_headers):
        # First ensure we have a fresh select state.
        body = {
            "step": "select",
            "apartment": {"id": "apt-x", "number": "B-202"},
            "tenant": {"id": "ten-x", "name": "TEST Customer A"},
        }
        requests.put(f"{API}/kiosk/customer-display", headers=kiosk_headers, json=body, timeout=15)

        r = requests.get(f"{API}/public/customer-display/surirent", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "branding" in data and "state" in data
        b = data["branding"]
        for k in ("id", "slug", "name", "primary_color"):
            assert k in b, f"branding missing {k}: {b}"
        assert b["slug"] == "surirent"
        state = data["state"]
        assert state.get("step") == "select"
        assert state.get("apartment", {}).get("number") == "B-202"
        assert state.get("tenant", {}).get("name") == "TEST Customer A"

    def test_no_auth_required_on_public(self):
        r = requests.get(f"{API}/public/customer-display/surirent",
                         headers={"Authorization": "Bearer invalid-token"}, timeout=15)
        # Public endpoint must ignore/allow no auth — should still 200.
        assert r.status_code == 200

    def test_delete_resets_state(self, kiosk_headers):
        # Push a non-idle state first.
        requests.put(f"{API}/kiosk/customer-display", headers=kiosk_headers,
                     json={"step": "overview", "tenant": {"name": "TEST T"}}, timeout=15)
        # Delete
        r = requests.delete(f"{API}/kiosk/customer-display", headers=kiosk_headers, timeout=15)
        assert r.status_code == 200, r.text
        # GET should now report idle.
        time.sleep(0.3)
        r2 = requests.get(f"{API}/public/customer-display/surirent", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["state"]["step"] == "idle"

    def test_delete_requires_auth(self):
        r = requests.delete(f"{API}/kiosk/customer-display", timeout=15)
        assert r.status_code in (401, 403)

    def test_state_persists_through_full_flow(self, kiosk_headers):
        steps = [
            {"step": "select", "tenant": {"name": "TEST Bob"}},
            {"step": "overview", "overview": {"total": 1500}},
            {"step": "pay", "payload": {"total": 1500}},
            {"step": "method", "payload": {"total": 1500, "method": "cash"}},
            {"step": "receipt", "payment": {"receipt_no": "TEST-RCPT-001"}},
        ]
        for body in steps:
            r = requests.put(f"{API}/kiosk/customer-display", headers=kiosk_headers, json=body, timeout=15)
            assert r.status_code == 200
            time.sleep(0.1)
            g = requests.get(f"{API}/public/customer-display/surirent", timeout=15)
            assert g.status_code == 200
            assert g.json()["state"]["step"] == body["step"]
        # Cleanup
        requests.delete(f"{API}/kiosk/customer-display", headers=kiosk_headers, timeout=15)
