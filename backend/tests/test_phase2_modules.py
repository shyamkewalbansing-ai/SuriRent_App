"""Phase 2 tests: AI chat, PWA push (no real subscribers), AES-256 PDF + QR verify."""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@vastgoed.sr")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# --------- AI chat ---------
class TestAIChat:
    def test_unauthorized(self):
        r = requests.post(f"{BASE_URL}/api/ai/chat", json={"message": "Hoi"}, timeout=10)
        assert r.status_code == 401

    def test_chat_and_session_persistence(self, auth_headers):
        sid = "TEST_PH2_AI_SESSION"
        # Cleanup before
        requests.delete(f"{BASE_URL}/api/ai/sessions/{sid}", headers=auth_headers, timeout=10)

        r = requests.post(f"{BASE_URL}/api/ai/chat",
                          headers=auth_headers,
                          json={"message": "Welke huurders heb ik?", "session_id": sid},
                          timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["session_id"] == sid
        assert isinstance(body["reply"], str) and len(body["reply"]) > 5
        assert isinstance(body["history"], list) and len(body["history"]) >= 2

        # Second call - should preserve context
        r2 = requests.post(f"{BASE_URL}/api/ai/chat",
                           headers=auth_headers,
                           json={"message": "Hoeveel zijn dat er in totaal?", "session_id": sid},
                           timeout=60)
        assert r2.status_code == 200, r2.text
        body2 = r2.json()
        assert len(body2["history"]) >= 4

    def test_get_history(self, auth_headers):
        sid = "TEST_PH2_AI_SESSION"
        r = requests.get(f"{BASE_URL}/api/ai/sessions/{sid}", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "messages" in data
        assert len(data["messages"]) >= 4

    def test_delete_session(self, auth_headers):
        sid = "TEST_PH2_AI_SESSION"
        r = requests.delete(f"{BASE_URL}/api/ai/sessions/{sid}", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/ai/sessions/{sid}", headers=auth_headers, timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("messages") == []


# --------- PWA Push ---------
class TestPush:
    def test_vapid_public_key(self):
        r = requests.get(f"{BASE_URL}/api/push/vapid-public-key", timeout=10)
        assert r.status_code == 200
        key = r.json()["public_key"]
        assert isinstance(key, str) and key.startswith("B") and len(key) > 60

    def test_subscribe_and_unsubscribe(self, auth_headers):
        sub = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/TEST_PH2_FAKE_ENDPOINT",
            "keys": {"p256dh": "AAAA", "auth": "BBBB"},
            "user_label": "ph2-test",
        }
        r = requests.post(f"{BASE_URL}/api/push/subscribe", headers=auth_headers,
                          json=sub, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

        # Cleanup
        r2 = requests.post(f"{BASE_URL}/api/push/unsubscribe", headers=auth_headers,
                           json={"endpoint": sub["endpoint"]}, timeout=10)
        assert r2.status_code == 200

    def test_push_test_no_subs(self, auth_headers):
        # Ensure clean slate by unsubscribing the test endpoint
        r = requests.post(f"{BASE_URL}/api/push/test", headers=auth_headers,
                          json={"title": "t", "body": "b"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "sent" in data and "failed" in data
        # No real browser subs for admin user expected
        assert data["sent"] == 0

    def test_notify_overdue(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/push/notify-overdue", headers=auth_headers,
                          timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "sent" in data and "overdue_count" in data and "message" in data
        assert isinstance(data["overdue_count"], int)


# --------- Secure PDF + Verification ---------
class TestSecurePDF:
    @pytest.fixture(scope="class")
    def payment_id(self):
        # Use first payment available; admin tokens needed for /api/payments
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=10)
        tok = r.json()["token"]
        rp = requests.get(f"{BASE_URL}/api/payments",
                          headers={"Authorization": f"Bearer {tok}"}, timeout=10)
        assert rp.status_code == 200
        payments = rp.json()
        if not payments:
            pytest.skip("No payments seeded")
        return payments[0]["id"]

    def test_secure_pdf_unencrypted_with_qr(self, payment_id):
        r = requests.get(f"{BASE_URL}/api/payments/{payment_id}/secure-pdf?encrypted=false",
                         timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) >= 30_000, f"PDF too small: {len(r.content)} bytes (expected >=30KB)"
        assert r.content[:5] == b"%PDF-"

    def test_secure_pdf_encrypted(self, payment_id):
        r = requests.get(f"{BASE_URL}/api/payments/{payment_id}/secure-pdf?encrypted=true",
                         timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:5] == b"%PDF-"
        # Encrypted PDF contains /Encrypt object
        assert b"/Encrypt" in r.content

    def test_verify_valid_token(self, payment_id):
        # Fetch the secure PDF to obtain a server-issued token via the file (cant extract easily),
        # but we can recreate it by hitting endpoint and parsing for the verify token. Easier: rely on
        # the make_verify_token logic by calling secure-pdf which embeds it. Instead, use server-side
        # token by importing pdf_security would couple test; we exercise verify by simulating a flow:
        # We grab payment info, call secure-pdf to get bytes, and extract the QR via embedded URL.
        # Simpler: import pdf_security in-process (same backend deps available in CI? yes here).
        import sys
        sys.path.insert(0, "/app/backend")
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env", override=True)
        from pdf_security import make_verify_token  # type: ignore
        # Get payment data
        login = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=10).json()
        tok = login["token"]
        plist = requests.get(f"{BASE_URL}/api/payments",
                             headers={"Authorization": f"Bearer {tok}"}, timeout=10).json()
        p = next(x for x in plist if x["id"] == payment_id)
        token = make_verify_token({
            "kind": "payment", "id": payment_id, "rn": p["receipt_number"],
            "amt": p["amount"], "cur": p["currency"], "ts": 1700000000,
        })
        r = requests.get(f"{BASE_URL}/api/verify/{token}", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is True
        assert data["type"] == "Kwitantie"
        assert data["receipt_number"] == p["receipt_number"]
        assert float(data["amount"]) == float(p["amount"])
        assert data["currency"] == p["currency"]

    def test_verify_invalid_token(self):
        r = requests.get(f"{BASE_URL}/api/verify/invalid_token_xyz", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is False
        assert "reason" in data
