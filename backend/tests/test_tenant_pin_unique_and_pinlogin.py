"""Iteration 12 — Tenant PIN uniqueness per company + PIN-only login.

Covers:
  - POST /api/auth/tenant-set-pin: per-company uniqueness (409), idempotent self,
    cross-company isolation (same PIN allowed in different companies via
    superadmin x-active-company header).
  - POST /api/tenant-portal/pin-login: success via company_slug AND company_id,
    wrong PIN → 401, missing context → 400, cross-company no-leak.
  - Regression: POST /api/tenant-portal/login (identifier+pin) still works.
"""
import os
import time
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL is required"
API = f"{BASE_URL}/api"

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_B_EMAIL, ADMIN_B_PASSWORD, SUPER_EMAIL, SUPER_PASSWORD

ADMIN_A_EMAIL = ADMIN_EMAIL
ADMIN_A_PASSWORD = ADMIN_PASSWORD

COMPANY_A_SLUG = "surirent"

BHARAT_ID = "603a112e-aced-4fd2-bd52-6744fb7756ee"
RAYSHREE_ID = "c44bf27c-c95b-4963-a301-3f0bee5f10e1"

PIN_BHARAT = "5678"
PIN_RAYSHREE = "9999"
PIN_TEMP = "4242"


# -------------------- fixtures --------------------

def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin_a():
    data = _login(ADMIN_A_EMAIL, ADMIN_A_PASSWORD)
    return {
        "headers": {"Authorization": f"Bearer {data['token']}"},
        "company_id": data.get("user", {}).get("company_id") or data.get("company", {}).get("id"),
    }


@pytest.fixture(scope="module")
def admin_b():
    data = _login(ADMIN_B_EMAIL, ADMIN_B_PASSWORD)
    return {
        "headers": {"Authorization": f"Bearer {data['token']}"},
        "company_id": data.get("user", {}).get("company_id") or data.get("company", {}).get("id"),
    }


@pytest.fixture(scope="module")
def superadmin():
    data = _login(SUPER_EMAIL, SUPER_PASSWORD)
    return {"Authorization": f"Bearer {data['token']}"}


@pytest.fixture(scope="module", autouse=True)
def _reset_pins(admin_a):
    """Ensure Bharat=5678, Rayshree=9999 at start (best effort)."""
    h = admin_a["headers"]
    # Bharat first to 4242 (to break any conflict), then Rayshree to 9999, then Bharat to 5678.
    requests.post(f"{API}/auth/tenant-set-pin", headers=h, json={"tenant_id": BHARAT_ID, "pin": "0000"})
    requests.post(f"{API}/auth/tenant-set-pin", headers=h, json={"tenant_id": RAYSHREE_ID, "pin": PIN_RAYSHREE})
    requests.post(f"{API}/auth/tenant-set-pin", headers=h, json={"tenant_id": BHARAT_ID, "pin": PIN_BHARAT})
    yield


# -------------------- /auth/tenant-set-pin --------------------

class TestTenantSetPinUniqueness:
    """Per-company PIN uniqueness for tenants."""

    def test_set_unique_pin_ok(self, admin_a):
        r = requests.post(f"{API}/auth/tenant-set-pin", headers=admin_a["headers"],
                          json={"tenant_id": BHARAT_ID, "pin": PIN_BHARAT})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_set_same_pin_on_self_idempotent(self, admin_a):
        # Same tenant + same PIN → still 200 (no false self-conflict)
        r = requests.post(f"{API}/auth/tenant-set-pin", headers=admin_a["headers"],
                          json={"tenant_id": BHARAT_ID, "pin": PIN_BHARAT})
        assert r.status_code == 200, r.text

    def test_set_pin_already_used_by_other_returns_409(self, admin_a):
        # Try setting Rayshree's PIN to Bharat's 5678 → 409 + name mentioned
        r = requests.post(f"{API}/auth/tenant-set-pin", headers=admin_a["headers"],
                          json={"tenant_id": RAYSHREE_ID, "pin": PIN_BHARAT})
        assert r.status_code == 409, r.text
        detail = (r.json().get("detail") or "").lower()
        assert "bharat" in detail or "in gebruik" in detail, f"detail not informative: {detail}"

    def test_set_different_unique_pin_ok(self, admin_a):
        # Set Rayshree to a brand-new PIN — should succeed
        r = requests.post(f"{API}/auth/tenant-set-pin", headers=admin_a["headers"],
                          json={"tenant_id": RAYSHREE_ID, "pin": PIN_TEMP})
        assert r.status_code == 200, r.text
        # restore Rayshree to 9999 for downstream tests
        r2 = requests.post(f"{API}/auth/tenant-set-pin", headers=admin_a["headers"],
                           json={"tenant_id": RAYSHREE_ID, "pin": PIN_RAYSHREE})
        assert r2.status_code == 200, r2.text

    def test_invalid_pin_format_400(self, admin_a):
        r = requests.post(f"{API}/auth/tenant-set-pin", headers=admin_a["headers"],
                          json={"tenant_id": BHARAT_ID, "pin": "abcd"})
        assert r.status_code == 400, r.text


class TestCrossCompanyPinSet:
    """Same PIN can exist on tenants of DIFFERENT companies."""

    def test_other_company_can_use_same_pin_as_company_a_tenant(self, superadmin):
        """Use superadmin + x-active-company to find ANY other company with at
        least one tenant, then set that tenant's PIN to PIN_BHARAT — must NOT
        clash with Bharat (different company)."""
        # 1) discover companies
        r = requests.get(f"{API}/companies", headers=superadmin)
        assert r.status_code == 200, r.text
        target = None
        for c in r.json():
            if c.get("slug") == COMPANY_A_SLUG:
                continue
            if (c.get("stats") or {}).get("tenants", 0) >= 1:
                target = c
                break
        if not target:
            pytest.skip("No other company with tenants for cross-company test")

        h = {**superadmin, "x-active-company": target["id"]}
        # 2) pick a tenant in target company
        r2 = requests.get(f"{API}/tenants", headers=h)
        assert r2.status_code == 200, r2.text
        tenants = r2.json()
        if not tenants:
            pytest.skip("Target company has no tenants visible via active-company header")
        other_tenant_id = tenants[0]["id"]
        # 3) set its PIN to same as Bharat — must succeed (cross-company isolation)
        r3 = requests.post(f"{API}/auth/tenant-set-pin", headers=h,
                           json={"tenant_id": other_tenant_id, "pin": PIN_BHARAT})
        assert r3.status_code == 200, f"cross-company PIN reuse blocked: {r3.status_code} {r3.text}"


# -------------------- /tenant-portal/pin-login --------------------

class TestTenantPinLogin:
    def test_login_with_company_slug_ok(self):
        r = requests.post(f"{API}/tenant-portal/pin-login",
                          json={"pin": PIN_BHARAT, "company_slug": COMPANY_A_SLUG})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and data["token"]
        assert data["tenant"]["id"] == BHARAT_ID
        assert data["tenant"]["name"]

    def test_login_with_company_id_ok(self, admin_a):
        cid = admin_a["company_id"]
        assert cid, "could not resolve admin_a company_id"
        r = requests.post(f"{API}/tenant-portal/pin-login",
                          json={"pin": PIN_RAYSHREE, "company_id": cid})
        assert r.status_code == 200, r.text
        assert r.json()["tenant"]["id"] == RAYSHREE_ID

    def test_login_wrong_pin_401(self):
        r = requests.post(f"{API}/tenant-portal/pin-login",
                          json={"pin": "0001", "company_slug": COMPANY_A_SLUG})
        assert r.status_code == 401, r.text

    def test_login_missing_company_context_400(self):
        r = requests.post(f"{API}/tenant-portal/pin-login", json={"pin": PIN_BHARAT})
        assert r.status_code == 400, r.text

    def test_login_unknown_slug_400(self):
        r = requests.post(f"{API}/tenant-portal/pin-login",
                          json={"pin": PIN_BHARAT, "company_slug": "this-slug-does-not-exist"})
        # No cid resolved → 400
        assert r.status_code == 400, r.text


class TestCrossCompanyPinLogin:
    """A PIN must NOT log a tenant in across companies."""

    def test_pin_5678_in_company_b_doesnt_return_company_a_tenant(self, admin_b):
        # Bharat is in A with PIN 5678; pin-login in company B with PIN 5678
        # must either match a B-tenant (the one we set above) OR 401 — but never Bharat.
        cid_b = admin_b["company_id"]
        assert cid_b
        r = requests.post(f"{API}/tenant-portal/pin-login",
                          json={"pin": PIN_BHARAT, "company_id": cid_b})
        if r.status_code == 200:
            assert r.json()["tenant"]["id"] != BHARAT_ID, "Leak: company-A tenant returned for company-B login!"
        else:
            assert r.status_code == 401, r.text


# -------------------- Regression: identifier+pin login still works --------------------

class TestLegacyIdentifierPinLogin:
    def test_email_pin_login_still_works(self):
        r = requests.post(f"{API}/tenant-portal/login",
                          json={"identifier": "shyam@kewalbansing.net", "pin": PIN_BHARAT})
        assert r.status_code == 200, r.text
        assert r.json()["tenant"]["id"] == BHARAT_ID

    def test_email_pin_login_wrong_pin_401(self):
        r = requests.post(f"{API}/tenant-portal/login",
                          json={"identifier": "shyam@kewalbansing.net", "pin": "0000"})
        # may be 401 or 429 if throttled from earlier — accept both as non-200
        assert r.status_code in (401, 429), r.text


class TestThrottle:
    """8 failed pin-login attempts → 429 lockout."""

    def test_throttle_after_8_failures(self):
        # Use unique company_slug-less context: pick a different (non-default) company
        # to avoid impacting the surirent throttle bucket used by other tests.
        # Strategy: hit pin-login with surirent+wrong PIN repeatedly. The previous
        # tests already produced 1 fail; we add 8 more, expect a 429 by the 9th.
        seen_429 = False
        for i in range(9):
            r = requests.post(f"{API}/tenant-portal/pin-login",
                              json={"pin": f"00{i:02d}", "company_slug": COMPANY_A_SLUG})
            if r.status_code == 429:
                seen_429 = True
                break
            assert r.status_code in (401,), f"unexpected status {r.status_code}: {r.text}"
        assert seen_429, "Expected 429 throttle after multiple failed pin-login attempts"
