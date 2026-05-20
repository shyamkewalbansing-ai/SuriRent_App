"""
P1 Hardening tests — iteration 7.

Covers:
 - Idempotent Jan de Vries PIN re-seed (PIN '5678' works after fresh server start)
 - Brute-force lockout on /api/auth/kiosk-pin (8 fails -> 9th = 429)
 - Brute-force lockout on /api/tenant-portal/login (8 fails -> 9th = 429)
 - Counter clears after a successful login
 - /api/auth/tenant-set-pin is scoped per company (cross-company -> 404)
 - Smoke regression: kiosk PIN 1234 still matches SuriRent, companies CRUD,
   admin login, CRUD list endpoints.

Counters are in-memory and keyed by client IP (kiosk) and IP+identifier
(tenant). We pass a distinct `X-Forwarded-For` per lockout test so tests do
not pollute each other's counters.
"""

import os
import time
import pytest
import requests

def _load_backend_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if val:
        return val.rstrip("/")
    # fall back to frontend/.env (the canonical place for the public URL)
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
    env_path = os.path.abspath(env_path)
    if os.path.exists(env_path):
        for line in open(env_path):
            line = line.strip()
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

SUPER_EMAIL = "super@surirent.sr"
SUPER_PW = "super123"
ADMIN_A_EMAIL = "admin@vastgoed.sr"
ADMIN_A_PW = "admin123"
ADMIN_B_EMAIL = "adminb@test.sr"
ADMIN_B_PW = "adminb123"
JAN_EMAIL = "jan@example.sr"
JAN_PIN = "5678"
KIOSK_PIN_A = "1234"

# ---------- fixtures ----------

@pytest.fixture(scope="session")
def admin_a_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_A_EMAIL, "password": ADMIN_A_PW}, timeout=15)
    assert r.status_code == 200, f"login admin A failed: {r.status_code} {r.text}"
    return r.json()["token"]

@pytest.fixture(scope="session")
def admin_b_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_B_EMAIL, "password": ADMIN_B_PW}, timeout=15)
    assert r.status_code == 200, f"login admin B failed: {r.status_code} {r.text}"
    return r.json()["token"]

@pytest.fixture(scope="session")
def super_token():
    r = requests.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW}, timeout=15)
    assert r.status_code == 200, f"login super failed: {r.status_code} {r.text}"
    return r.json()["token"]


# ===========================================================================
# 1. Idempotent Jan PIN re-seed
# ===========================================================================
class TestJanReseed:
    def test_jan_pin_5678_works_directly(self):
        r = requests.post(
            f"{API}/tenant-portal/login",
            json={"identifier": JAN_EMAIL, "pin": JAN_PIN},
            headers={"X-Forwarded-For": "10.0.0.1"},  # unique IP -> own counter
            timeout=15,
        )
        assert r.status_code == 200, f"Jan login w/ PIN 5678 failed (re-seed broken?): {r.status_code} {r.text}"
        data = r.json()
        assert "token" in data and data["token"]
        assert data["tenant"]["email"] == JAN_EMAIL


# ===========================================================================
# 2. Kiosk brute-force lockout
# ===========================================================================
class TestKioskLockout:
    """8 bad PINs from a unique IP -> 9th request returns 429."""
    IP = "10.99.0.1"  # isolated counter

    def test_kiosk_bruteforce_lockout(self):
        # 8 bad attempts
        for i in range(8):
            r = requests.post(
                f"{API}/auth/kiosk-pin",
                json={"pin": "0000"},
                headers={"X-Forwarded-For": self.IP},
                timeout=15,
            )
            assert r.status_code == 401, f"attempt {i+1}: expected 401, got {r.status_code} {r.text}"
        # 9th attempt — must be 429
        r = requests.post(
            f"{API}/auth/kiosk-pin",
            json={"pin": "0000"},
            headers={"X-Forwarded-For": self.IP},
            timeout=15,
        )
        assert r.status_code == 429, f"9th attempt expected 429, got {r.status_code} {r.text}"
        body = r.json()
        msg = (body.get("detail") or "").lower()
        assert "te veel mislukte pogingen" in msg, f"expected lockout message, got: {body}"

    def test_kiosk_lockout_blocks_correct_pin_too(self):
        """Once locked, even the correct PIN is rejected (until lockout expires)."""
        r = requests.post(
            f"{API}/auth/kiosk-pin",
            json={"pin": KIOSK_PIN_A},
            headers={"X-Forwarded-For": self.IP},
            timeout=15,
        )
        assert r.status_code == 429, f"locked IP should be blocked even with correct PIN, got {r.status_code} {r.text}"


# ===========================================================================
# 3. Tenant portal brute-force lockout
# ===========================================================================
class TestTenantLockout:
    IP = "10.99.0.2"

    def test_tenant_bruteforce_lockout(self):
        for i in range(8):
            r = requests.post(
                f"{API}/tenant-portal/login",
                json={"identifier": JAN_EMAIL, "pin": "0000"},
                headers={"X-Forwarded-For": self.IP},
                timeout=15,
            )
            assert r.status_code == 401, f"attempt {i+1}: expected 401, got {r.status_code} {r.text}"
        r = requests.post(
            f"{API}/tenant-portal/login",
            json={"identifier": JAN_EMAIL, "pin": "0000"},
            headers={"X-Forwarded-For": self.IP},
            timeout=15,
        )
        assert r.status_code == 429, f"9th tenant attempt expected 429, got {r.status_code} {r.text}"

    def test_tenant_lockout_blocks_correct_pin(self):
        r = requests.post(
            f"{API}/tenant-portal/login",
            json={"identifier": JAN_EMAIL, "pin": JAN_PIN},
            headers={"X-Forwarded-For": self.IP},
            timeout=15,
        )
        assert r.status_code == 429, f"locked tenant IP should block correct PIN too, got {r.status_code}"


# ===========================================================================
# 4. Counter clears on successful login
# ===========================================================================
class TestCounterClearsOnSuccess:
    """
    From a fresh IP:
      - 7 bad kiosk attempts (just under the limit)
      - 1 correct kiosk login (should clear counter)
      - 8 more bad attempts -> 401 (not yet locked)
      - 9th -> 429
    Proves _pin_throttle_clear() runs on success and starts fresh.
    """
    IP = "10.99.0.3"

    def test_counter_reset_after_success(self):
        # 7 bad
        for i in range(7):
            r = requests.post(
                f"{API}/auth/kiosk-pin",
                json={"pin": "0000"},
                headers={"X-Forwarded-For": self.IP},
                timeout=15,
            )
            assert r.status_code == 401, f"attempt {i+1}: {r.status_code}"
        # correct PIN -> 200 + clear counter
        r = requests.post(
            f"{API}/auth/kiosk-pin",
            json={"pin": KIOSK_PIN_A},
            headers={"X-Forwarded-For": self.IP},
            timeout=15,
        )
        assert r.status_code == 200, f"correct kiosk PIN failed: {r.status_code} {r.text}"
        # 8 more bad attempts; should NOT lock yet (counter was cleared)
        for i in range(8):
            r = requests.post(
                f"{API}/auth/kiosk-pin",
                json={"pin": "0000"},
                headers={"X-Forwarded-For": self.IP},
                timeout=15,
            )
            assert r.status_code == 401, (
                f"counter not cleared on success! "
                f"got {r.status_code} on bad attempt {i+1} after correct login"
            )
        # 9th bad -> 429
        r = requests.post(
            f"{API}/auth/kiosk-pin",
            json={"pin": "0000"},
            headers={"X-Forwarded-For": self.IP},
            timeout=15,
        )
        assert r.status_code == 429, f"9th attempt expected 429, got {r.status_code}"


# ===========================================================================
# 5. Tenant set-pin scope (cross-company isolation)
# ===========================================================================
class TestTenantSetPinScope:
    def test_admin_a_cannot_set_pin_on_admin_b_tenant(self, admin_a_token, admin_b_token):
        # Get one tenant of B
        rb = requests.get(
            f"{API}/tenants",
            headers={"Authorization": f"Bearer {admin_b_token}"},
            timeout=15,
        )
        assert rb.status_code == 200, f"admin B /tenants: {rb.status_code} {rb.text}"
        b_tenants = rb.json()
        if not b_tenants:
            # Create a throw-away tenant for B
            r = requests.post(
                f"{API}/tenants",
                headers={"Authorization": f"Bearer {admin_b_token}"},
                json={"name": "TEST_p1_scope", "email": "test_p1_scope@example.sr", "phone": "+597 9990000"},
                timeout=15,
            )
            assert r.status_code in (200, 201), f"create tenant B: {r.status_code} {r.text}"
            b_tenant_id = r.json()["id"]
            cleanup = True
        else:
            b_tenant_id = b_tenants[0]["id"]
            cleanup = False

        try:
            r = requests.post(
                f"{API}/auth/tenant-set-pin",
                headers={"Authorization": f"Bearer {admin_a_token}"},
                json={"tenant_id": b_tenant_id, "pin": "9999"},
                timeout=15,
            )
            assert r.status_code == 404, (
                f"cross-company set-pin should be 404, got {r.status_code} {r.text}"
            )
        finally:
            if cleanup:
                requests.delete(
                    f"{API}/tenants/{b_tenant_id}",
                    headers={"Authorization": f"Bearer {admin_b_token}"},
                    timeout=15,
                )

    def test_admin_a_can_set_pin_on_own_tenant(self, admin_a_token):
        ra = requests.get(
            f"{API}/tenants",
            headers={"Authorization": f"Bearer {admin_a_token}"},
            timeout=15,
        )
        assert ra.status_code == 200
        tenants = ra.json()
        # Pick Jan if present else first tenant
        jan = next((t for t in tenants if t.get("email") == JAN_EMAIL), None)
        target = jan or (tenants[0] if tenants else None)
        if not target:
            pytest.skip("Admin A has no tenants to set PIN on")
        r = requests.post(
            f"{API}/auth/tenant-set-pin",
            headers={"Authorization": f"Bearer {admin_a_token}"},
            json={"tenant_id": target["id"], "pin": JAN_PIN if jan else "5678"},
            timeout=15,
        )
        assert r.status_code == 200, f"own-tenant set-pin: {r.status_code} {r.text}"
        assert r.json().get("ok") is True


# ===========================================================================
# 6. Regression smoke: kiosk PIN 1234, companies, CRUD endpoints
# ===========================================================================
class TestRegressionSmoke:
    def test_kiosk_pin_1234_matches_surirent(self):
        r = requests.post(
            f"{API}/auth/kiosk-pin",
            json={"pin": KIOSK_PIN_A},
            headers={"X-Forwarded-For": "10.50.0.1"},  # fresh IP
            timeout=15,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert data.get("token")
        assert data["company"]["slug"] == "surirent", f"expected slug surirent, got {data['company']}"

    def test_companies_crud_for_superadmin(self, super_token):
        r = requests.get(f"{API}/companies", headers={"Authorization": f"Bearer {super_token}"}, timeout=15)
        assert r.status_code == 200
        comps = r.json()
        assert isinstance(comps, list) and len(comps) >= 2
        slugs = [c["slug"] for c in comps]
        assert "surirent" in slugs
        # admin should NOT be able to list companies (superadmin only)
        # (do not assert -- only superadmin path is the change)
        # ensure stats present
        assert any("stats" in c for c in comps)

    def test_crud_list_endpoints_admin_a(self, admin_a_token):
        h = {"Authorization": f"Bearer {admin_a_token}"}
        for path in [
            "apartments", "tenants", "payments", "contracts", "invoices",
            "employees", "salaries", "deposits", "maintenance", "kasgeld",
        ]:
            r = requests.get(f"{API}/{path}", headers=h, timeout=15)
            assert r.status_code == 200, f"GET /api/{path}: {r.status_code} {r.text}"
            assert isinstance(r.json(), list), f"GET /api/{path} not a list"

    def test_auth_me_admin_a(self, admin_a_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_a_token}"}, timeout=15)
        assert r.status_code == 200
        me = r.json()
        assert me["email"] == ADMIN_A_EMAIL
        assert me.get("active_company_id")
