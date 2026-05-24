"""Iteration 16: Per-company QR PNG endpoint.
Validates GET /api/companies/me/qr.png?kind=<kind>[&size=N].
The endpoint returns a PNG containing a server-built branded URL
(e.g. https://<host>/c/<slug>/kiosk).
"""
import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = "admin123"


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def auth_session(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}"})
    return s


@pytest.fixture(scope="module")
def slug(auth_session):
    r = auth_session.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    body = r.json()
    company = body.get("active_company") or body.get("company") or {}
    return company.get("slug") or "surirent"


# ---------- core kind matrix ----------

VALID_KINDS = ["login", "kiosk", "tenant_kiosk", "customer_display", "tenant_portal", "query"]


@pytest.mark.parametrize("kind", VALID_KINDS)
def test_qr_png_all_valid_kinds(auth_session, kind):
    r = auth_session.get(f"{API}/companies/me/qr.png", params={"kind": kind}, timeout=20)
    assert r.status_code == 200, f"{kind} -> {r.status_code} {r.text[:200]}"
    assert r.headers.get("content-type", "").startswith("image/png"), r.headers
    assert len(r.content) > 1024, f"{kind} body too small: {len(r.content)} bytes"
    # Validate it is actually a parsable PNG
    img = Image.open(io.BytesIO(r.content))
    img.verify()


def test_qr_kind_unknown_returns_400(auth_session):
    r = auth_session.get(f"{API}/companies/me/qr.png", params={"kind": "unknown_kind"}, timeout=15)
    assert r.status_code == 400, r.text


def test_qr_without_auth_returns_401_or_403():
    r = requests.get(f"{API}/companies/me/qr.png?kind=kiosk", timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code} {r.text[:200]}"


def test_qr_size_small(auth_session):
    r = auth_session.get(f"{API}/companies/me/qr.png", params={"kind": "kiosk", "size": 160}, timeout=15)
    assert r.status_code == 200
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (160, 160), img.size


def test_qr_size_clamped_max_800(auth_session):
    r = auth_session.get(f"{API}/companies/me/qr.png", params={"kind": "kiosk", "size": 5000}, timeout=20)
    assert r.status_code == 200
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (800, 800), f"5000 should clamp to 800, got {img.size}"


def test_qr_size_explicit_800(auth_session):
    r = auth_session.get(f"{API}/companies/me/qr.png", params={"kind": "kiosk", "size": 800}, timeout=20)
    assert r.status_code == 200
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (800, 800)


def test_qr_size_below_min_clamped_up(auth_session):
    """size<160 should clamp to the configured minimum (160)."""
    r = auth_session.get(f"{API}/companies/me/qr.png", params={"kind": "kiosk", "size": 50}, timeout=15)
    assert r.status_code == 200
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (160, 160), img.size


# ---------- decode QR contents ----------

def test_qr_decodes_to_branded_url(auth_session, slug):
    """Decode the QR PNG and verify the encoded URL matches /c/<slug>/kiosk."""
    try:
        from pyzbar.pyzbar import decode as zbar_decode
    except Exception:
        pytest.skip("pyzbar/libzbar not available")
    r = auth_session.get(f"{API}/companies/me/qr.png", params={"kind": "kiosk", "size": 480}, timeout=20)
    assert r.status_code == 200
    img = Image.open(io.BytesIO(r.content))
    found = zbar_decode(img)
    assert found, "no QR decoded from PNG"
    payload = found[0].data.decode("utf-8")
    assert payload.startswith("http"), payload
    assert f"/c/{slug}/kiosk" in payload, f"payload {payload!r} does not contain /c/{slug}/kiosk"


@pytest.mark.parametrize("kind,suffix", [
    ("login", "/c/{slug}"),
    ("kiosk", "/c/{slug}/kiosk"),
    ("tenant_kiosk", "/c/{slug}/kiosk/huurder"),
    ("customer_display", "/c/{slug}/kiosk/klant"),
    ("tenant_portal", "/c/{slug}/huurder"),
])
def test_qr_decodes_all_branded_kinds(auth_session, slug, kind, suffix):
    try:
        from pyzbar.pyzbar import decode as zbar_decode
    except Exception:
        pytest.skip("pyzbar/libzbar not available")
    r = auth_session.get(f"{API}/companies/me/qr.png", params={"kind": kind, "size": 480}, timeout=20)
    assert r.status_code == 200
    img = Image.open(io.BytesIO(r.content))
    found = zbar_decode(img)
    assert found
    payload = found[0].data.decode("utf-8")
    expected = suffix.format(slug=slug)
    assert expected in payload, f"{kind}: expected suffix {expected} in {payload}"


def test_qr_query_decodes_with_query_param(auth_session, slug):
    try:
        from pyzbar.pyzbar import decode as zbar_decode
    except Exception:
        pytest.skip("pyzbar/libzbar not available")
    r = auth_session.get(f"{API}/companies/me/qr.png", params={"kind": "query", "size": 480}, timeout=20)
    assert r.status_code == 200
    img = Image.open(io.BytesIO(r.content))
    found = zbar_decode(img)
    assert found
    payload = found[0].data.decode("utf-8")
    assert "/login" in payload and f"c={slug}" in payload, payload


# ---------- Regression: existing public branded routes still work ----------

def test_public_company_branding_still_works():
    r = requests.get(f"{API}/public/companies/surirent/branding", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("slug") == "surirent"
