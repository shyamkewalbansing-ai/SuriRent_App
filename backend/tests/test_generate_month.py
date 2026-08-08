"""Tests for POST /api/invoices/generate-month (Facturen 'Genereer maand')."""
import os
import requests
from datetime import date

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vastgoed-app.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASS = "admin123"


def _login():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS, "slug": "surirent"},
               timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


def test_no_auth_returns_401_or_403():
    r = requests.post(f"{BASE_URL}/api/invoices/generate-month",
                      json={"period_month": 1, "period_year": 2026}, timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


def test_invalid_period_month():
    s = _login()
    r = s.post(f"{BASE_URL}/api/invoices/generate-month",
               json={"period_month": 13, "period_year": 2026}, timeout=15)
    assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"


def test_invalid_period_year():
    s = _login()
    r = s.post(f"{BASE_URL}/api/invoices/generate-month",
               json={"period_month": 6, "period_year": 1999}, timeout=15)
    assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"


def test_generate_current_month_success_and_idempotent():
    s = _login()
    today = date.today()
    payload = {"period_month": today.month, "period_year": today.year}
    r1 = s.post(f"{BASE_URL}/api/invoices/generate-month", json=payload, timeout=60)
    assert r1.status_code == 200, f"first call failed: {r1.status_code} {r1.text}"
    d1 = r1.json()
    for k in ("created", "skipped", "credit_applied"):
        assert k in d1, f"missing key {k} in response: {d1}"
    assert isinstance(d1["created"], int)
    assert isinstance(d1["skipped"], int)

    # Idempotent second call
    r2 = s.post(f"{BASE_URL}/api/invoices/generate-month", json=payload, timeout=60)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["created"] <= d1["created"], f"idempotency broken: {d1} -> {d2}"


def test_generate_previous_month():
    s = _login()
    today = date.today()
    pm = today.month - 1 or 12
    py = today.year if today.month > 1 else today.year - 1
    r = s.post(f"{BASE_URL}/api/invoices/generate-month",
               json={"period_month": pm, "period_year": py}, timeout=60)
    assert r.status_code == 200, f"got {r.status_code} {r.text}"
    d = r.json()
    assert "created" in d and "skipped" in d
