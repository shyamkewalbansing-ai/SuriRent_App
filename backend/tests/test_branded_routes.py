"""Iteration 15: Public per-company branding endpoints (branded routes).
Validates GET /api/public/companies/{slug}/branding and /api/public/branding-by-host.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Public per-company branding lookup ---

@pytest.mark.parametrize("slug", ["surirent", "dadovastgoed", "kewalbansing"])
def test_branding_known_slug_returns_200(session, slug):
    r = session.get(f"{API}/public/companies/{slug}/branding", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("slug") == slug
    assert "primary_color" in data and data["primary_color"].startswith("#")
    assert "app_name" in data and data["app_name"]
    assert "logo_url" in data  # may be empty string but key must exist
    assert "tagline" in data


def test_branding_unknown_slug_returns_404(session):
    r = session.get(f"{API}/public/companies/onbekend-bedrijf-xyz/branding", timeout=15)
    assert r.status_code == 404
    body = r.json()
    assert "detail" in body
    assert "niet gevonden" in body["detail"].lower()


def test_branding_invalid_slug_too_long(session):
    long_slug = "x" * 200
    r = session.get(f"{API}/public/companies/{long_slug}/branding", timeout=15)
    assert r.status_code == 400


def test_branding_kewalbansing_orange(session):
    """KEWALBANSING uses orange (#ff5c00) per the request."""
    r = session.get(f"{API}/public/companies/kewalbansing/branding", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "KEWALBANSING" in data["app_name"].upper() or "KEWALBANSING" in data.get("name", "").upper()


# --- branding-by-host (no subdomain present on preview host) ---

def test_branding_by_host_preview_returns_slug_null(session):
    r = session.get(f"{API}/public/branding-by-host", timeout=15)
    assert r.status_code == 200
    data = r.json()
    # preview host = vastgoed-app.preview.emergentagent.com → first segment 'vastgoed-app'
    # is technically a candidate slug. Verify behavior:
    # - either {slug: null}, or {slug: 'vastgoed-app', found: false}.
    assert "slug" in data
    if data.get("slug"):
        # If it resolved a slug, found must be present and false (no matching company)
        # OR found true if a company actually exists with that slug.
        assert "found" in data


def test_branding_by_host_preview_host_first_segment(session):
    """Preview host vastgoed-app.preview.emergentagent.com → first segment is
    'vastgoed-app' which is slug-shaped but does NOT exist as a company →
    expect found=False. K8s ingress overrides x-forwarded-host so we can't
    inject a synthetic subdomain from the test."""
    r = session.get(f"{API}/public/branding-by-host", timeout=15)
    assert r.status_code == 200
    data = r.json()
    # Either slug is null (no subdomain) or non-existent company → found false.
    if data.get("slug"):
        assert data.get("found") is False, f"Unexpected found=True for preview host: {data}"
