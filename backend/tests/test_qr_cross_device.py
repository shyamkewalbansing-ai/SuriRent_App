"""Iteration 29: QR cross-device login (qr/create, qr/status, qr/claim).

Validates:
- POST /api/auth/qr/create returns token + qr_url + expires_in
- GET /api/auth/qr/status/{token} returns pending for fresh session
- POST /api/auth/qr/claim/{token} requires auth, claims the session
- After claim, status returns 'claimed' with access_token
- Claiming an already-claimed session returns 400
- Expired session claim returns 400 (simulated by direct DB poke via API not available -> mark as best-effort by mutating expires_at would need backend access; we test the 'already-claimed' rejection path which exercises the same status guard)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")


# ---------------- fixtures ----------------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture
def fresh_qr():
    """Anonymous QR create — no auth required."""
    r = requests.post(f"{API}/auth/qr/create", timeout=15,
                      headers={"Origin": "https://vastgoed-app.preview.emergentagent.com"})
    assert r.status_code == 200, f"qr/create failed: {r.status_code} {r.text}"
    body = r.json()
    return body


# ---------------- qr/create ----------------

def test_qr_create_anonymous_returns_token_url():
    r = requests.post(f"{API}/auth/qr/create", timeout=15,
                      headers={"Origin": "https://vastgoed-app.preview.emergentagent.com"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body and isinstance(body["token"], str) and len(body["token"]) >= 20
    assert "qr_url" in body and body["qr_url"].startswith("http")
    assert "/qr-link?token=" in body["qr_url"]
    assert body["qr_url"].endswith(body["token"])
    assert body.get("expires_in") == 300  # 5 min TTL


def test_qr_create_returns_absolute_qr_url():
    """qr_url must be an absolute http(s) URL pointing at /qr-link?token=."""
    custom = "https://my-preview.example.com"
    r = requests.post(f"{API}/auth/qr/create", timeout=15, headers={"Origin": custom})
    assert r.status_code == 200
    body = r.json()
    # Backend may use FRONTEND_BASE_URL env or x-forwarded-host instead of Origin
    # (cluster-internal URL is acceptable in preview env per spec).
    assert body["qr_url"].startswith("http"), body["qr_url"]
    assert "/qr-link?token=" in body["qr_url"]


# ---------------- qr/status ----------------

def test_qr_status_pending_for_fresh(fresh_qr):
    r = requests.get(f"{API}/auth/qr/status/{fresh_qr['token']}", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("status") == "pending"
    assert body.get("access_token") is None
    assert body.get("user") is None


def test_qr_status_unknown_token_returns_404():
    r = requests.get(f"{API}/auth/qr/status/nonexistent_token_xyz_123", timeout=15)
    assert r.status_code == 404, r.text


# ---------------- qr/claim ----------------

def test_qr_claim_requires_auth(fresh_qr):
    """Without bearer, claim must reject."""
    r = requests.post(f"{API}/auth/qr/claim/{fresh_qr['token']}", timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text}"


def test_qr_claim_with_admin_success_then_status_claimed(admin_token, fresh_qr):
    token = fresh_qr["token"]
    r = requests.post(f"{API}/auth/qr/claim/{token}", timeout=15,
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True

    # Poll status — should now be 'claimed' with access_token
    s = requests.get(f"{API}/auth/qr/status/{token}", timeout=15)
    assert s.status_code == 200
    sbody = s.json()
    assert sbody.get("status") == "claimed"
    assert isinstance(sbody.get("access_token"), str) and len(sbody["access_token"]) > 20
    user_summary = sbody.get("user") or {}
    assert user_summary.get("email") == ADMIN_EMAIL


def test_qr_claim_double_claim_returns_400(admin_token, fresh_qr):
    token = fresh_qr["token"]
    h = {"Authorization": f"Bearer {admin_token}"}
    first = requests.post(f"{API}/auth/qr/claim/{token}", timeout=15, headers=h)
    assert first.status_code == 200
    second = requests.post(f"{API}/auth/qr/claim/{token}", timeout=15, headers=h)
    assert second.status_code == 400, f"second claim should reject, got {second.status_code} {second.text}"


def test_qr_claim_unknown_token_returns_404(admin_token):
    r = requests.post(f"{API}/auth/qr/claim/nope_unknown_zzz", timeout=15,
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404, r.text


# ---------------- end-to-end shape ----------------

def test_e2e_qr_flow_access_token_is_valid_admin_session(admin_token, fresh_qr):
    """After claim, the issued desktop access_token should authenticate as admin."""
    token = fresh_qr["token"]
    claim = requests.post(f"{API}/auth/qr/claim/{token}", timeout=15,
                          headers={"Authorization": f"Bearer {admin_token}"})
    assert claim.status_code == 200
    status = requests.get(f"{API}/auth/qr/status/{token}", timeout=15).json()
    desktop_token = status["access_token"]
    # Use this token to call /auth/me
    me = requests.get(f"{API}/auth/me", timeout=15,
                      headers={"Authorization": f"Bearer {desktop_token}"})
    assert me.status_code == 200, me.text
    body = me.json()
    assert body.get("email") == ADMIN_EMAIL
    assert body.get("role") == "admin"
