"""Tests for new push-device management endpoints (iteration_21).

- GET /api/push/devices: lists devices with label derived from user_agent.
- DELETE /api/push/devices/{id}: removes a specific device.
- POST /api/push/subscribe with user_agent: stores UA + last_seen_at + id via $setOnInsert; upsert keeps id stable.
- _device_label_from_ua() helper (imported directly).
"""
import os
import pytest
import requests
import importlib.util
import sys


def _load_react_url():
    # Read from frontend/.env since this var is not exported into the pytest shell.
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_react_url()
ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PW = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PW},
                      timeout=10)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"}


# ---------- Helper: load _device_label_from_ua from server.py ----------
# Veiligere variant zonder exec(): we importeren de module via importlib en
# halen de functie eruit met getattr. Importeren van server.py is iets
# zwaarder dan exec() van een gehapt fragment, maar veiliger en
# onderhoudbaarder — als de signature/implementatie wijzigt, blijven de
# tests werken zonder string-parsing.
def _load_label_fn():
    if "_srv_under_test" not in sys.modules:
        # Voorkom dat de app uvicorn opstart: spec.loader.exec_module
        # voert top-level code uit; server.py heeft `if __name__ == "__main__"`
        # blokken voor runtime, dus dit is veilig voor onze function-import.
        sys.path.insert(0, "/app/backend")
        spec = importlib.util.spec_from_file_location(
            "_srv_under_test", "/app/backend/server.py"
        )
        mod = importlib.util.module_from_spec(spec)
        sys.modules["_srv_under_test"] = mod
        spec.loader.exec_module(mod)
    fn = getattr(sys.modules["_srv_under_test"], "_device_label_from_ua", None)
    if fn is None:
        raise RuntimeError("_device_label_from_ua not found in server.py")
    return fn


_label_fn = _load_label_fn()


class TestDeviceLabel:
    def test_iphone_safari(self):
        ua = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
              "AppleWebKit/605 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
        assert _label_fn(ua) == "iPhone · Safari"

    def test_windows_chrome(self):
        ua = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        assert _label_fn(ua) == "Windows · Chrome"

    def test_android_chrome(self):
        ua = ("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")
        assert _label_fn(ua) == "Android · Chrome"

    def test_mac_safari(self):
        ua = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
              "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")
        assert _label_fn(ua) == "Mac · Safari"

    def test_edge(self):
        ua = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0")
        assert _label_fn(ua) == "Windows · Edge"

    def test_empty_ua(self):
        assert _label_fn("") == "Apparaat"

    def test_unknown_ua(self):
        assert _label_fn("CustomBot/1.0") == "Apparaat"


# ---------- API tests ----------
class TestPushDevicesAPI:
    """End-to-end: subscribe a fake device, list it, delete it."""

    FAKE_ENDPOINT = "https://example.com/push/TEST_iter21_devices_fake_endpoint_AAAAAAAAAAAAAAAA"
    FAKE_KEYS = {"p256dh": "BNc" + "A" * 84, "auth": "TEST" + "A" * 18}
    FAKE_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
               "AppleWebKit/605 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")

    def test_01_subscribe_creates_device_with_id_and_ua(self, auth_headers):
        body = {
            "endpoint": self.FAKE_ENDPOINT,
            "keys": self.FAKE_KEYS,
            "user_label": "test-iter21",
            "user_agent": self.FAKE_UA,
        }
        r = requests.post(f"{BASE_URL}/api/push/subscribe",
                          headers=auth_headers, json=body, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

    def test_02_list_devices_includes_new_device(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/push/devices",
                         headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        match = [d for d in data if d["endpoint"] == self.FAKE_ENDPOINT]
        assert len(match) == 1, f"new device not in list (devices={len(data)})"
        dev = match[0]
        # id, user_agent, last_seen_at must exist
        assert dev["id"] and isinstance(dev["id"], str)
        assert dev["user_agent"] == self.FAKE_UA
        assert dev["last_seen_at"]
        assert dev["created_at"]
        # label derived from UA
        assert dev["label"] == "iPhone · Safari"
        # Stash id for later test cases (use class attr)
        TestPushDevicesAPI._device_id = dev["id"]
        TestPushDevicesAPI._created_at_first = dev["created_at"]

    def test_03_resubscribe_same_endpoint_upserts_keeps_id_and_created_at(self, auth_headers):
        # Resubscribe with same endpoint → must NOT duplicate, id stays the same.
        body = {
            "endpoint": self.FAKE_ENDPOINT,
            "keys": self.FAKE_KEYS,
            "user_agent": self.FAKE_UA,
        }
        r = requests.post(f"{BASE_URL}/api/push/subscribe",
                          headers=auth_headers, json=body, timeout=10)
        assert r.status_code == 200, r.text

        r2 = requests.get(f"{BASE_URL}/api/push/devices",
                          headers=auth_headers, timeout=10)
        match = [d for d in r2.json() if d["endpoint"] == self.FAKE_ENDPOINT]
        assert len(match) == 1, "duplicate device created on resubscribe"
        assert match[0]["id"] == TestPushDevicesAPI._device_id, "id changed on upsert!"
        assert match[0]["created_at"] == TestPushDevicesAPI._created_at_first, "created_at changed on upsert!"

    def test_04_delete_nonexistent_returns_404(self, auth_headers):
        r = requests.delete(f"{BASE_URL}/api/push/devices/non-existent-id-zzz",
                            headers=auth_headers, timeout=10)
        assert r.status_code == 404, r.text
        body = r.json()
        assert "Apparaat niet gevonden" in str(body)

    def test_05_delete_existing_device_decrements_status(self, auth_headers):
        # status before
        before = requests.get(f"{BASE_URL}/api/push/status",
                              headers=auth_headers, timeout=10).json()["devices"]
        dev_id = TestPushDevicesAPI._device_id
        r = requests.delete(f"{BASE_URL}/api/push/devices/{dev_id}",
                            headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
        # status after = before - 1
        after = requests.get(f"{BASE_URL}/api/push/status",
                             headers=auth_headers, timeout=10).json()["devices"]
        assert after == before - 1, f"device count not decremented: {before} → {after}"

        # GET devices should no longer include the deleted device
        listing = requests.get(f"{BASE_URL}/api/push/devices",
                               headers=auth_headers, timeout=10).json()
        assert not any(d["endpoint"] == self.FAKE_ENDPOINT for d in listing)

    def test_06_delete_already_deleted_returns_404(self, auth_headers):
        dev_id = TestPushDevicesAPI._device_id
        r = requests.delete(f"{BASE_URL}/api/push/devices/{dev_id}",
                            headers=auth_headers, timeout=10)
        assert r.status_code == 404

    def test_07_unauthenticated_devices_list_rejected(self):
        r = requests.get(f"{BASE_URL}/api/push/devices", timeout=10)
        assert r.status_code in (401, 403)
