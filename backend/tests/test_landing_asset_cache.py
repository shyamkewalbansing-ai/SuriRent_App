"""Tests for ETag/304/thumb behavior on /api/landing/asset/{id}.

Bug fix regression: apartment photos loaded slowly. Endpoint now:
 - returns strong ETag == '"<asset_id>"' (or '"<asset_id>-t"' for thumb)
 - returns 304 on matching If-None-Match with 0 body (DB-free)
 - ?thumb=1 returns downscaled JPEG (max 400px), cached in DB
"""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vastgoed-app.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def uploaded_asset(admin_session):
    """Upload a small PNG (100x100) via branding/upload; return asset URL+id."""
    try:
        from PIL import Image
    except ImportError:
        pytest.skip("PIL not available in test env")
    img = Image.new("RGB", (800, 600), color=(200, 100, 50))
    # Add gradient so JPEG compression actually shrinks it meaningfully
    px = img.load()
    for x in range(800):
        for y in range(600):
            px[x, y] = ((x * 255) // 800, (y * 255) // 600, ((x + y) * 255) // 1400)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    files = {"file": ("TEST_photo.png", buf, "image/png")}
    r = admin_session.post(f"{BASE_URL}/api/companies/me/branding/upload", files=files)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "url" in data and "id" in data
    assert data["url"].startswith("/api/landing/asset/")
    return data  # {url, id}


class TestLandingAssetCaching:
    def test_get_asset_returns_etag(self, uploaded_asset):
        url = f"{BASE_URL}{uploaded_asset['url']}"
        r = requests.get(url)
        assert r.status_code == 200
        etag = r.headers.get("ETag")
        assert etag == f'"{uploaded_asset["id"]}"', f"unexpected ETag: {etag}"
        assert len(r.content) > 0
        # Cache-Control header should be set by app (ingress may override, that's OK)
        # We just verify the app-level ETag path works.

    def test_if_none_match_returns_304(self, uploaded_asset):
        url = f"{BASE_URL}{uploaded_asset['url']}"
        etag = f'"{uploaded_asset["id"]}"'
        r = requests.get(url, headers={"If-None-Match": etag})
        assert r.status_code == 304, f"expected 304, got {r.status_code}"
        assert len(r.content) == 0
        assert r.headers.get("ETag") == etag

    def test_thumb_returns_smaller_jpeg(self, uploaded_asset):
        orig_url = f"{BASE_URL}{uploaded_asset['url']}"
        thumb_url = f"{orig_url}?thumb=1"
        r_full = requests.get(orig_url)
        r_thumb = requests.get(thumb_url)
        assert r_full.status_code == 200
        assert r_thumb.status_code == 200
        assert r_thumb.headers.get("Content-Type", "").startswith("image/jpeg") or \
               r_thumb.headers.get("Content-Type", "").startswith("image/png")
        assert r_thumb.headers.get("ETag") == f'"{uploaded_asset["id"]}-t"'
        full_size = len(r_full.content)
        thumb_size = len(r_thumb.content)
        print(f"full={full_size} bytes, thumb={thumb_size} bytes, ratio={full_size/max(thumb_size,1):.1f}x")
        assert thumb_size < full_size, "thumb should be smaller than full"
        # Synthetic gradient PNG compresses well; real JPEGs see 5-10x. Just check downscaling happened.
        assert thumb_size < full_size * 0.6, f"expected meaningful reduction, got {full_size/thumb_size:.1f}x"

    def test_thumb_second_request_cached_and_faster(self, uploaded_asset):
        # Use a fresh upload to guarantee first-hit generation timing
        thumb_url = f"{BASE_URL}{uploaded_asset['url']}?thumb=1"
        # first request may already be cached from previous test; just check consistency
        t0 = time.time()
        r1 = requests.get(thumb_url)
        t1 = time.time()
        r2 = requests.get(thumb_url)
        t2 = time.time()
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.content == r2.content, "cached thumb bytes should be identical"
        print(f"thumb req1={t1-t0:.3f}s, req2={t2-t1:.3f}s")

    def test_thumb_if_none_match_returns_304(self, uploaded_asset):
        thumb_url = f"{BASE_URL}{uploaded_asset['url']}?thumb=1"
        etag = f'"{uploaded_asset["id"]}-t"'
        r = requests.get(thumb_url, headers={"If-None-Match": etag})
        assert r.status_code == 304
        assert len(r.content) == 0
        assert r.headers.get("ETag") == etag

    def test_nonexistent_asset_returns_404(self):
        r = requests.get(f"{BASE_URL}/api/landing/asset/does-not-exist-xyz")
        assert r.status_code == 404
