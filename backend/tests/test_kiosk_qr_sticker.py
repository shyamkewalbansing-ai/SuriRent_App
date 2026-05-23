"""Iteration 11 — Per-apartment QR Sticker for Tenant Kiosk.

Covers (NEW):
  - GET /api/tenant-portal/lookup-apartment/{id} — PUBLIC, no auth
  - GET /api/apartments/{id}/kiosk-sticker.pdf — PUBLIC A4 PDF with QR
"""
import os
import re
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL is required"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = "admin123"

# happy-path tenant from review_request
HAPPY_APT_ID = "ad90db5f-d0e1-4029-8c20-9f2d9d6e4f66"
HAPPY_TENANT_ID = "603a112e-aced-4fd2-bd52-6744fb7756ee"
HAPPY_PIN = "5678"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module", autouse=True)
def ensure_pin(admin_headers):
    """Make sure the happy-path tenant has PIN 5678 set."""
    r = requests.post(
        f"{API}/auth/tenant-set-pin",
        headers=admin_headers,
        json={"tenant_id": HAPPY_TENANT_ID, "pin": HAPPY_PIN},
    )
    assert r.status_code == 200, r.text
    return True


# -------------------- lookup-apartment --------------------

class TestLookupApartment:
    def test_lookup_happy_path_public(self):
        """Public — no auth header. Returns expected shape."""
        r = requests.get(f"{API}/tenant-portal/lookup-apartment/{HAPPY_APT_ID}")
        assert r.status_code == 200, r.text
        data = r.json()
        # Apartment block
        assert "apartment" in data
        assert data["apartment"]["id"] == HAPPY_APT_ID
        assert isinstance(data["apartment"].get("number"), str)
        assert len(data["apartment"]["number"]) > 0
        # Tenant block (name, email, first_name) — NO pin_hash
        assert "tenant" in data
        assert isinstance(data["tenant"].get("name"), str)
        assert data["tenant"].get("first_name")
        assert "@" in (data["tenant"].get("email") or "")
        # PII leak guard
        assert "pin_hash" not in data["tenant"], "LEAK: pin_hash exposed"
        assert "phone" not in data["tenant"], "LEAK: phone exposed"
        # Company block
        assert "company" in data
        assert "name" in data["company"]

    def test_lookup_unknown_apartment_404(self):
        r = requests.get(f"{API}/tenant-portal/lookup-apartment/does-not-exist-xyz")
        assert r.status_code == 404

    def test_lookup_does_not_require_auth(self):
        """Explicit: no Authorization header → still 200."""
        s = requests.Session()
        s.headers.pop("Authorization", None)
        r = s.get(f"{API}/tenant-portal/lookup-apartment/{HAPPY_APT_ID}")
        assert r.status_code == 200

    def test_lookup_apartment_without_tenant_404(self, admin_headers):
        """Find an apartment without a tenant and assert 404 (per spec)."""
        r = requests.get(f"{API}/apartments", headers=admin_headers)
        assert r.status_code == 200
        empty = next((a for a in r.json() if not a.get("tenant_id")), None)
        if not empty:
            pytest.skip("No apartment without tenant available")
        r2 = requests.get(f"{API}/tenant-portal/lookup-apartment/{empty['id']}")
        assert r2.status_code == 404


# -------------------- kiosk-sticker.pdf --------------------

class TestKioskStickerPdf:
    def test_pdf_content_type_and_magic(self):
        r = requests.get(f"{API}/apartments/{HAPPY_APT_ID}/kiosk-sticker.pdf")
        assert r.status_code == 200, r.text[:300]
        ctype = r.headers.get("content-type", "").lower()
        assert "application/pdf" in ctype, f"Unexpected content-type: {ctype}"
        # Magic bytes
        assert r.content[:4] == b"%PDF", "Body does not start with %PDF"
        # Sanity: PDF size reasonable
        assert len(r.content) > 1000, "PDF suspiciously small"

    def test_pdf_public_no_auth_required(self):
        s = requests.Session()
        s.headers.pop("Authorization", None)
        r = s.get(f"{API}/apartments/{HAPPY_APT_ID}/kiosk-sticker.pdf")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_pdf_404_unknown_apartment(self):
        r = requests.get(f"{API}/apartments/no-such-id-xyz/kiosk-sticker.pdf")
        assert r.status_code == 404

    def test_pdf_does_not_crash_for_apartment_without_tenant(self, admin_headers):
        r = requests.get(f"{API}/apartments", headers=admin_headers)
        assert r.status_code == 200
        empty = next((a for a in r.json() if not a.get("tenant_id")), None)
        if not empty:
            pytest.skip("No apartment without tenant available")
        r2 = requests.get(f"{API}/apartments/{empty['id']}/kiosk-sticker.pdf")
        assert r2.status_code == 200
        assert r2.content[:4] == b"%PDF"


# -------------------- regression — login still works after lookup --------------------

class TestLookupThenLoginFlow:
    def test_lookup_then_login_with_returned_email(self):
        """End-to-end: scan QR → lookup → login with returned email + PIN."""
        r = requests.get(f"{API}/tenant-portal/lookup-apartment/{HAPPY_APT_ID}")
        assert r.status_code == 200
        email = r.json()["tenant"]["email"]
        r2 = requests.post(
            f"{API}/tenant-portal/login",
            json={"identifier": email, "pin": HAPPY_PIN},
        )
        assert r2.status_code == 200, r2.text
        token = r2.json().get("token")
        assert isinstance(token, str) and len(token) > 20
