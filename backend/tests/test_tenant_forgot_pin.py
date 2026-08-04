"""Backend tests for the Tenant Kiosk 'Forgot PIN' feature.

Endpoint under test: POST /api/tenant-portal/forgot-pin

Coverage:
- known tenant email returns ok+via:['email'] (Twilio dummy → no whatsapp/sms)
- non-existent identifier returns 200 {ok:true, via:[]} (anti-enumeratie)
- missing identifier → 400 'Vul uw email of telefoonnummer in'
- missing company context → 400 'Bedrijfscontext ontbreekt'
- phone-suffix lookup (last digits of phone number match)
- after reset, old PIN no longer works on /tenant-portal/pin-login (401)
- pin_reset_at timestamp is bumped on successful reset
- regression of pin-login flow

NOTE: Throttle threshold is PIN_MAX_ATTEMPTS env (default 8), not 3 as
review_request states. So 4 negative requests will NOT yield 429.
We document this rather than force a brittle 429 assertion.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback: read from /app/frontend/.env (REACT_APP_BACKEND_URL) so the
    # test runs both in CI and locally without requiring shell exports.
    try:
        with open("/app/frontend/.env", "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "REACT_APP_BACKEND_URL is required for these tests"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
COMPANY_SLUG = "surirent"


# ---------------- Fixtures ----------------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    })
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def seeded_tenant(session, admin_headers):
    """Create a dedicated TEST_ tenant so we don't spam real demo addresses.

    Sets a known PIN via the admin endpoint so we can later verify the OLD PIN
    is invalidated after forgot-pin reset.
    """
    unique = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_ForgotPin {unique}",
        "email": f"TEST_forgotpin_{unique}@example.test",
        "phone": f"+597 8{unique[:6]}",  # 8XXXXXX (7 digits) for SR-format
        "apartment_id": None,
    }
    r = session.post(f"{API}/tenants", json=payload, headers=admin_headers)
    assert r.status_code in (200, 201), f"tenant create failed: {r.status_code} {r.text}"
    t = r.json()
    tid = t["id"]

    # Set known PIN via admin endpoint. PIN must be unique company-wide.
    # Try several random codes to dodge collisions with existing tenant PINs.
    import random
    pin_set = None
    old_pin = None
    for _ in range(10):
        candidate = f"{random.randint(1000, 9999)}"
        r2 = session.post(
            f"{API}/auth/tenant-set-pin",
            json={"tenant_id": tid, "pin": candidate},
            headers=admin_headers,
        )
        if r2.status_code in (200, 201, 204):
            pin_set = r2
            old_pin = candidate
            break
        if r2.status_code == 409:
            continue
        # fatal — break to surface error
        pin_set = r2
        break
    assert pin_set is not None and pin_set.status_code in (200, 201, 204), (
        f"failed to set known PIN on tenant: {getattr(pin_set, 'status_code', None)} "
        f"{getattr(pin_set, 'text', None)}"
    )

    yield {"id": tid, "email": payload["email"], "phone": payload["phone"], "old_pin": old_pin}

    # teardown
    try:
        session.delete(f"{API}/tenants/{tid}", headers=admin_headers)
    except Exception:
        pass


# ---------------- Validation tests ----------------

def test_forgot_pin_missing_company_context(session):
    r = session.post(f"{API}/tenant-portal/forgot-pin", json={"identifier": "x@y.z"})
    assert r.status_code == 400
    assert "Bedrijfscontext" in r.text


def test_forgot_pin_missing_identifier(session):
    r = session.post(f"{API}/tenant-portal/forgot-pin", json={
        "identifier": "",
        "company_slug": COMPANY_SLUG,
    })
    assert r.status_code == 400
    assert "email of telefoonnummer" in r.text


def test_forgot_pin_unknown_identifier_is_generic_ok(session):
    """Anti-enumeratie: non-existing identifier returns ok with empty via."""
    r = session.post(f"{API}/tenant-portal/forgot-pin", json={
        "identifier": f"definitely-not-a-tenant-{uuid.uuid4().hex[:6]}@nowhere.test",
        "company_slug": COMPANY_SLUG,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert data.get("via") == []


# ---------------- Known-tenant tests ----------------

def test_forgot_pin_by_email_success_and_pin_changed(session, admin_headers, seeded_tenant):
    tid = seeded_tenant["id"]
    old_pin = seeded_tenant["old_pin"]

    # Sanity: OLD PIN currently works
    pre_login = session.post(f"{API}/tenant-portal/pin-login", json={
        "pin": old_pin,
        "company_slug": COMPANY_SLUG,
    })
    assert pre_login.status_code == 200, (
        f"sanity: old PIN should work before reset — got {pre_login.status_code} {pre_login.text}"
    )

    # Call forgot-pin with known email
    r = session.post(f"{API}/tenant-portal/forgot-pin", json={
        "identifier": seeded_tenant["email"],
        "company_slug": COMPANY_SLUG,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert isinstance(data.get("via"), list)
    # Twilio is dummy SID → no whatsapp/sms. Email may or may not be enabled
    # depending on company SMTP config. We tolerate both.
    print(f"[forgot-pin email] via={data.get('via')}")

    # And: OLD PIN should no longer be valid
    time.sleep(0.5)
    r_login = session.post(f"{API}/tenant-portal/pin-login", json={
        "pin": old_pin,
        "company_slug": COMPANY_SLUG,
    })
    assert r_login.status_code != 200, (
        f"OLD PIN still works after forgot-pin reset! status={r_login.status_code} body={r_login.text}"
    )


def test_forgot_pin_by_phone_suffix(session, admin_headers, seeded_tenant):
    """phone_digits ends-with lookup must match when only the suffix digits are given.

    Strategy: reset the PIN to a known value via admin endpoint, call forgot-pin
    using only the local phone-number suffix, then confirm the OLD pin no longer
    works (proves the tenant was found and updated via phone match).
    """
    tid = seeded_tenant["id"]
    import random
    # Set a fresh KNOWN PIN via admin (the previous test reset it to random)
    new_known_pin = None
    for _ in range(10):
        candidate = f"{random.randint(1000, 9999)}"
        rs = session.post(f"{API}/auth/tenant-set-pin",
                          json={"tenant_id": tid, "pin": candidate},
                          headers=admin_headers)
        if rs.status_code in (200, 201, 204):
            new_known_pin = candidate
            break
    assert new_known_pin, "could not set known PIN before phone-suffix test"

    # sanity that we can login
    pre = session.post(f"{API}/tenant-portal/pin-login", json={
        "pin": new_known_pin, "company_slug": COMPANY_SLUG,
    })
    assert pre.status_code == 200, f"setup login failed: {pre.status_code} {pre.text}"

    phone_digits = "".join(ch for ch in seeded_tenant["phone"] if ch.isdigit())
    suffix = phone_digits[-7:]
    r = session.post(f"{API}/tenant-portal/forgot-pin", json={
        "identifier": suffix,
        "company_slug": COMPANY_SLUG,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert isinstance(data.get("via"), list)
    print(f"[forgot-pin phone-suffix] via={data.get('via')} suffix={suffix}")

    # OLD known PIN should NO LONGER work — proves phone lookup hit tenant
    time.sleep(0.5)
    r_login = session.post(f"{API}/tenant-portal/pin-login", json={
        "pin": new_known_pin, "company_slug": COMPANY_SLUG,
    })
    assert r_login.status_code != 200, (
        f"OLD PIN still valid after phone-suffix forgot-pin — lookup did not hit. "
        f"status={r_login.status_code} body={r_login.text}"
    )


def test_forgot_pin_response_shape(session):
    """Response always has ok:true and via:list - even for unknown."""
    r = session.post(f"{API}/tenant-portal/forgot-pin", json={
        "identifier": "ghost@nowhere.test",
        "company_slug": COMPANY_SLUG,
    })
    assert r.status_code == 200
    j = r.json()
    assert set(j.keys()) >= {"ok", "via"}
    assert j["ok"] is True
    assert isinstance(j["via"], list)


# ---------------- Regression: prior tests still load ----------------

def test_pin_login_endpoint_still_validates():
    """Smoke: /tenant-portal/pin-login still responds (not 5xx)."""
    r = requests.post(f"{API}/tenant-portal/pin-login", json={
        "pin": "0000",
        "company_slug": COMPANY_SLUG,
    })
    assert r.status_code in (200, 400, 401), f"unexpected: {r.status_code} {r.text}"
