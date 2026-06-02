"""
Iteration 30 - Test SaaS billing/plans/cancellation workflow.
Tests 7 features:
 1. Plans admin GET/POST/PUT
 2. Billing enforcement (402 when cancelled)
 3. Cancel-subscription self-service
 4. Reactivate-subscription (superadmin)
 5. Manual billing checks (cronjob)
 6. Public /api/billing/plans seeded from DB
 7. Exempt endpoints (auth/login, billing/*, health) still accessible
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vastgoed-app.preview.emergentagent.com").rstrip("/")

SUPERADMIN = {"email": "super@surirent.sr", "password": "super123"}
ADMIN = {"email": "admin@vastgoed.sr", "password": "admin123"}


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERADMIN)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def super_headers(super_token):
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture(scope="module")
def surirent_company_id(super_headers):
    r = requests.get(f"{BASE_URL}/api/companies", headers=super_headers)
    assert r.status_code == 200
    for c in r.json():
        if c.get("slug") == "surirent":
            return c["id"]
    pytest.skip("surirent company not found")


# ---------- Feature 7: Public plans seeded from DB ----------
def test_public_billing_plans_seeded():
    r = requests.get(f"{BASE_URL}/api/billing/plans")
    assert r.status_code == 200
    plans = r.json()
    assert isinstance(plans, list) and len(plans) >= 2
    ids = {p["id"] for p in plans}
    assert "starter" in ids
    assert "professional" in ids
    starter = next(p for p in plans if p["id"] == "starter")
    assert starter["amount"] == 3000
    assert starter["currency"] == "SRD"


# ---------- Feature 2: Plans admin GET ----------
def test_superadmin_plans_list(super_headers):
    r = requests.get(f"{BASE_URL}/api/superadmin/plans", headers=super_headers)
    assert r.status_code == 200
    plans = r.json()
    assert any(p["id"] == "starter" for p in plans)
    assert any(p["id"] == "professional" for p in plans)


def test_superadmin_plans_requires_superadmin():
    # admin should be rejected (but admin@vastgoed is on cancelled company so login may 402-block)
    # Use anonymous request
    r = requests.get(f"{BASE_URL}/api/superadmin/plans")
    assert r.status_code in (401, 403)


# ---------- Feature 2: Create/update/delete plans ----------
def test_create_update_delete_enterprise_plan(super_headers):
    # Cleanup any existing
    requests.delete(f"{BASE_URL}/api/superadmin/plans/enterprise", headers=super_headers)

    payload = {
        "id": "enterprise",
        "name": "Enterprise",
        "amount": 10000,
        "currency": "SRD",
        "interval": "month",
        "description": "Voor grote organisaties",
        "features": ["Alles uit Professional", "SLA", "Dedicated support"],
        "active": True,
        "sort_order": 30,
    }
    r = requests.post(f"{BASE_URL}/api/superadmin/plans", headers=super_headers, json=payload)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    assert created["id"] == "enterprise"
    assert created["amount"] == 10000

    # Verify GET reflects it
    r = requests.get(f"{BASE_URL}/api/superadmin/plans", headers=super_headers)
    assert any(p["id"] == "enterprise" and p["amount"] == 10000 for p in r.json())

    # Update
    r = requests.put(
        f"{BASE_URL}/api/superadmin/plans/enterprise",
        headers=super_headers,
        json={"name": "Enterprise Pro", "amount": 12000, "features": ["A", "B"]},
    )
    assert r.status_code == 200, r.text
    upd = r.json()
    assert upd["amount"] == 12000
    assert upd["name"] == "Enterprise Pro"

    # Verify public endpoint sees it
    r = requests.get(f"{BASE_URL}/api/billing/plans")
    assert any(p["id"] == "enterprise" and p["amount"] == 12000 for p in r.json())

    # Delete
    r = requests.delete(f"{BASE_URL}/api/superadmin/plans/enterprise", headers=super_headers)
    assert r.status_code in (200, 204), r.text
    r = requests.get(f"{BASE_URL}/api/superadmin/plans", headers=super_headers)
    assert not any(p["id"] == "enterprise" for p in r.json())


# ---------- Feature 5: Billing-checks cronjob ----------
def test_run_billing_checks(super_headers):
    r = requests.post(f"{BASE_URL}/api/superadmin/run-billing-checks", headers=super_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert "expired_count" in data
    assert "expired_companies" in data
    assert isinstance(data["expired_companies"], list)


# ---------- Feature 3 & 4: Cancel + Reactivate flow ----------
class TestBillingEnforcement:
    """
    Verify that admin@vastgoed.sr (which belongs to cancelled company surirent)
    is billing-blocked on protected endpoints. Also tests reactivate restores access.
    Uses module-scoped fixture so we restore state at end via reactivate.
    """

    def test_admin_login_works_even_when_cancelled(self):
        # Login itself must be exempt
        r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        assert token

    def test_admin_blocked_on_protected_endpoint(self, surirent_company_id, super_headers):
        # Ensure company is cancelled state
        # First reactivate to known state, then cancel to known state
        # Actually just check current — if not cancelled, this whole test scenario doesn't apply
        # We'll explicitly cancel via superadmin path below to make this deterministic.
        # The company starts cancelled per env. Verify.
        r = requests.get(f"{BASE_URL}/api/companies", headers=super_headers)
        c = next(x for x in r.json() if x["id"] == surirent_company_id)
        if c.get("billing_status") != "cancelled":
            # Cancel it via reactivate-then-cancel to set state — but there's no superadmin-cancel
            # endpoint per review. Skip if not in cancelled state at start.
            pytest.skip(f"Company state is {c.get('billing_status')} - manual cancel not available")

        # Login as admin
        r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        token = r.json()["token"]
        h = {"Authorization": f"Bearer {token}"}

        # Try a protected endpoint (admin stats) - expect 402 with billing_blocked code
        r = requests.get(f"{BASE_URL}/api/admin/stats", headers=h)
        assert r.status_code == 402, f"Expected 402 got {r.status_code}: {r.text}"
        body = r.json()
        # Should have code='billing_blocked'
        detail = body.get("detail", body)
        if isinstance(detail, dict):
            assert detail.get("code") == "billing_blocked", body
        else:
            # Fallback - accept any 402
            pass

    def test_admin_can_access_billing_and_health_endpoints_when_blocked(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        token = r.json()["token"]
        h = {"Authorization": f"Bearer {token}"}

        # /api/billing/me should be accessible (exempt)
        r = requests.get(f"{BASE_URL}/api/billing/me", headers=h)
        assert r.status_code in (200, 404), f"billing/me should be exempt, got {r.status_code}"

        # /api/health is public
        r = requests.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200

    def test_reactivate_then_cancel_then_reactivate(self, surirent_company_id, super_headers):
        # Reactivate so admin login works normally
        r = requests.post(
            f"{BASE_URL}/api/companies/{surirent_company_id}/reactivate-subscription",
            headers=super_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Verify state
        r = requests.get(f"{BASE_URL}/api/companies", headers=super_headers)
        c = next(x for x in r.json() if x["id"] == surirent_company_id)
        assert c.get("billing_status") == "active", c
        # Note: GET /api/companies list does NOT expose next_billing_date in serializer.
        # Verified via /api/billing/me below as that path returns full billing fields.
        nbd = c.get("next_billing_date")  # may be None in list view

        # Admin now should access protected endpoint - login fresh after state change
        r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{BASE_URL}/api/apartments", headers=h)
        assert r.status_code == 200, f"After reactivate, /apartments should be 200, got {r.status_code}: {r.text}"

        # Now self-cancel
        # KNOWN BUG: FastAPI route ordering. Line 3274 defines
        #   /companies/{cid}/cancel-subscription (superadmin-only) BEFORE
        #   /companies/me/cancel-subscription at line 3336. Self-cancel routes to
        #   the {cid} variant with cid="me" → 403 Onvoldoende rechten.
        r = requests.post(f"{BASE_URL}/api/companies/me/cancel-subscription", headers=h)
        if r.status_code == 403:
            # Document the bug
            assert "Onvoldoende rechten" in r.text
            # Restore via superadmin path so user preview keeps working
            requests.post(
                f"{BASE_URL}/api/companies/{surirent_company_id}/reactivate-subscription",
                headers=super_headers,
            )
            pytest.fail(
                "CRITICAL: /api/companies/me/cancel-subscription returns 403 because of "
                "route ordering. Define /companies/me/cancel-subscription BEFORE "
                "/companies/{cid}/cancel-subscription in server.py."
            )
        assert r.status_code == 200, r.text

        # Verify cancelled
        r = requests.get(f"{BASE_URL}/api/companies", headers=super_headers)
        c = next(x for x in r.json() if x["id"] == surirent_company_id)
        assert c.get("billing_status") == "cancelled"

        # Re-login after cancel to get fresh state
        r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        token = r.json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        # Admin should now be blocked
        r = requests.get(f"{BASE_URL}/api/apartments", headers=h)
        assert r.status_code == 402, f"After cancel, /apartments should be 402, got {r.status_code}"
        body = r.json()
        detail = body.get("detail", body)
        if isinstance(detail, dict):
            assert detail.get("code") == "billing_blocked"

        # CRITICAL: reactivate to restore state for user
        r = requests.post(
            f"{BASE_URL}/api/companies/{surirent_company_id}/reactivate-subscription",
            headers=super_headers,
        )
        assert r.status_code == 200, r.text
        # Verify back to active
        r = requests.get(f"{BASE_URL}/api/companies", headers=super_headers)
        c = next(x for x in r.json() if x["id"] == surirent_company_id)
        assert c.get("billing_status") == "active"
