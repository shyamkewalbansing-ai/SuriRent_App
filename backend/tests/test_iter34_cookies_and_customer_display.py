"""
Iter 34 — Backend regression tests for:
  (A) httpOnly cookie auth migration (Set-Cookie on login, cookie-only /auth/me,
      Bearer fallback, logout clears all 3 cookies)
  (B) Customer Display branding includes bank_account_sr/_nl
  (C) Customer Display PUT/GET roundtrip (operator → public projection)
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vastgoed-app.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
SLUG = "surirent"


# ---------- helpers ----------
def _login(session):
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    return r


# ---------- (A) Auth cookie flow ----------
class TestAuthCookies:
    def test_login_sets_httponly_cookie(self):
        s = requests.Session()
        r = _login(s)
        assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
        # Inspect Set-Cookie header(s)
        raw_cookies = r.headers.get("set-cookie", "")
        # requests collapses multi Set-Cookie into one; cookies jar is authoritative
        names = [c.name for c in s.cookies]
        assert "access_token" in names, f"access_token cookie not set. headers={raw_cookies} names={names}"
        # Confirm HttpOnly + SameSite via raw header text
        # Lowercase compare for safety
        rc_low = raw_cookies.lower()
        assert "httponly" in rc_low, f"access_token not HttpOnly: {raw_cookies}"
        assert "samesite=lax" in rc_low, f"access_token missing SameSite=Lax: {raw_cookies}"
        # Secure flag may be controlled by COOKIE_SECURE env; default 1 per spec
        assert "secure" in rc_low, f"access_token missing Secure flag: {raw_cookies}"

        # body should also include token (Bearer fallback support)
        body = r.json()
        assert "access_token" in body or "token" in body, f"login body missing token: {body}"

    def test_me_with_cookie_only_no_bearer(self):
        s = requests.Session()
        r = _login(s)
        assert r.status_code == 200
        # Now call /auth/me using session cookies but NO Authorization header
        r2 = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r2.status_code == 200, f"/auth/me with cookie failed: {r2.status_code} {r2.text}"
        body = r2.json()
        assert body.get("email") == ADMIN_EMAIL or body.get("user", {}).get("email") == ADMIN_EMAIL, body

    def test_me_with_bearer_fallback_no_cookie(self):
        # Fresh session — read token from login body, then use a NEW session without cookies
        login_session = requests.Session()
        r = _login(login_session)
        assert r.status_code == 200
        token = r.json().get("access_token") or r.json().get("token")
        assert token, f"no token in body for bearer fallback: {r.json()}"

        s2 = requests.Session()
        r2 = s2.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert r2.status_code == 200, f"bearer fallback failed: {r2.status_code} {r2.text}"

    def test_logout_clears_all_three_cookies(self):
        s = requests.Session()
        r = _login(s)
        assert r.status_code == 200
        r2 = s.post(f"{BASE_URL}/api/auth/logout", timeout=15)
        assert r2.status_code == 200, f"logout failed: {r2.status_code} {r2.text}"
        raw = r2.headers.get("set-cookie", "").lower()
        # All three cookies should be expired/cleared
        for name in ("access_token", "kiosk_token", "tenant_token"):
            assert name in raw, f"logout did not clear {name}: {raw}"
        # cookie deletion = Max-Age=0 or Expires in past
        assert ("max-age=0" in raw) or ("expires=" in raw and "1970" in raw or "expires=" in raw), \
            f"cookies not properly expired: {raw}"


# ---------- (B) Customer Display branding bank fields ----------
class TestCustomerDisplayBranding:
    def test_branding_includes_bank_accounts(self):
        r = requests.get(f"{BASE_URL}/api/public/customer-display/{SLUG}", timeout=15)
        assert r.status_code == 200, f"public CD failed {r.status_code}: {r.text}"
        body = r.json()
        branding = body.get("branding") or {}
        # Required: bank_account_sr and bank_account_nl keys present
        assert "bank_account_sr" in branding, f"bank_account_sr missing from branding: {list(branding.keys())}"
        assert "bank_account_nl" in branding, f"bank_account_nl missing from branding: {list(branding.keys())}"


# ---------- (C) Customer Display PUT/GET roundtrip ----------
class TestCustomerDisplayRoundtrip:
    def test_put_pay_then_public_reflects(self):
        s = requests.Session()
        r = _login(s)
        assert r.status_code == 200
        # PUT operator state
        payload = {
            "step": "pay",
            "payload": {
                "amount": 150,
                "currency": "SRD",
                "categories": [{"key": "huur", "label": "Huur Jul 2025", "value": 150}],
            },
        }
        r2 = s.put(f"{BASE_URL}/api/kiosk/customer-display", json=payload, timeout=15)
        assert r2.status_code == 200, f"PUT cd failed {r2.status_code}: {r2.text}"

        # Public GET should reflect
        r3 = requests.get(f"{BASE_URL}/api/public/customer-display/{SLUG}", timeout=15)
        assert r3.status_code == 200
        state = r3.json().get("state") or {}
        assert state.get("step") == "pay", f"step not pay: {state}"
        pp = state.get("payload") or {}
        assert pp.get("amount") == 150, f"amount mismatch: {pp}"
        cats = pp.get("categories") or []
        assert any(c.get("key") == "huur" and c.get("value") == 150 for c in cats), f"category not roundtripped: {cats}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
