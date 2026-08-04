"""
Iteration 32 — Tenant (per-company) landing pages + custom-domain routing + leads.

Covers:
- Custom-domain set/clear/validation/duplicate
- /public/company-landing host resolution + apartment filter (vacant/available)
- /companies/me/landing draft/save/publish/discard
- /companies/me/landing-apartments admin parity with public list
- /public/landing-lead (no auth) + /companies/me/landing-leads
- Superadmin variants
"""
import os
import time
import pytest
import requests

def _read_frontend_env_url():
    try:
        with open("/app/frontend/.env", "r") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    return ln.split("=", 1)[1].strip()
    except Exception:
        return None
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env_url() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASS = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
SUPER_EMAIL = "super@surirent.sr"
SUPER_PASS = "super123"

TEST_DOMAIN = "surirent-demo-test.com"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def super_token():
    return _login(SUPER_EMAIL, SUPER_PASS)


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def super_h(super_token):
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture(scope="module")
def admin_company_id(admin_h):
    r = requests.get(f"{API}/auth/me", headers=admin_h, timeout=10)
    assert r.status_code == 200, r.text
    me = r.json()
    cid = me.get("company_id") or me.get("active_company_id")
    assert cid, f"no company_id on /auth/me: {me}"
    return cid


# ---------- Custom domain ----------
class TestCustomDomain:
    def test_set_valid_domain(self, admin_h):
        r = requests.put(f"{API}/companies/me/custom-domain",
                         json={"custom_domain": TEST_DOMAIN}, headers=admin_h, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["custom_domain"] == TEST_DOMAIN

    def test_normalization_strips_www_and_lowercase(self, admin_h):
        r = requests.put(f"{API}/companies/me/custom-domain",
                         json={"custom_domain": "WWW." + TEST_DOMAIN.upper()},
                         headers=admin_h, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["custom_domain"] == TEST_DOMAIN

    def test_reject_invalid_shape(self, admin_h):
        r = requests.put(f"{API}/companies/me/custom-domain",
                         json={"custom_domain": "no-dot"}, headers=admin_h, timeout=10)
        assert r.status_code == 400

    def test_get_landing_returns_custom_domain(self, admin_h):
        r = requests.get(f"{API}/companies/me/landing?mode=draft", headers=admin_h, timeout=10)
        assert r.status_code == 200
        assert r.json().get("custom_domain") == TEST_DOMAIN


# ---------- Landing draft/save/publish/discard ----------
class TestLandingCRUD:
    MARKER = "TEST_TENANT_LANDING_MARKER_iter32"

    def test_draft_initial(self, admin_h):
        r = requests.get(f"{API}/companies/me/landing?mode=draft", headers=admin_h, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "content" in data
        assert "has_unpublished_changes" in data

    def test_full_cycle_save_publish_then_public_visible(self, admin_h, admin_company_id):
        # Get current draft
        cur = requests.get(f"{API}/companies/me/landing?mode=draft", headers=admin_h, timeout=10).json()
        content = dict(cur.get("content") or {})
        hero = dict(content.get("hero") or {})
        original_title = hero.get("title_line1", "")
        hero["title_line1"] = self.MARKER
        content["hero"] = hero

        # PUT draft
        r = requests.put(f"{API}/companies/me/landing", json={"content": content},
                        headers=admin_h, timeout=10)
        assert r.status_code == 200, r.text

        # has_unpublished_changes should be True now (unless published is identical)
        meta = requests.get(f"{API}/companies/me/landing?mode=draft", headers=admin_h, timeout=10).json()
        assert meta["content"].get("hero", {}).get("title_line1") == self.MARKER

        # Publish
        r = requests.post(f"{API}/companies/me/landing/publish", headers=admin_h, timeout=10)
        assert r.status_code == 200, r.text

        # After publish, has_unpublished_changes should be False
        meta2 = requests.get(f"{API}/companies/me/landing?mode=draft", headers=admin_h, timeout=10).json()
        assert meta2["has_unpublished_changes"] is False

        # Public endpoint with host=TEST_DOMAIN should return found:true
        r = requests.get(f"{API}/public/company-landing", params={"host": TEST_DOMAIN}, timeout=10)
        assert r.status_code == 200, r.text
        pub = r.json()
        assert pub["found"] is True
        assert pub["company"]["id"] == admin_company_id
        assert pub["content"].get("hero", {}).get("title_line1") == self.MARKER
        assert isinstance(pub.get("apartments"), list)

        # Restore original
        hero["title_line1"] = original_title
        content["hero"] = hero
        requests.put(f"{API}/companies/me/landing", json={"content": content},
                     headers=admin_h, timeout=10)
        requests.post(f"{API}/companies/me/landing/publish", headers=admin_h, timeout=10)

    def test_discard_resets_to_published(self, admin_h):
        # Make a noisy draft change
        cur = requests.get(f"{API}/companies/me/landing?mode=published", headers=admin_h, timeout=10).json()
        content = dict(cur.get("content") or {})
        scratch = dict(content)
        scratch["_test_scratch"] = "TEST_DISCARD"
        requests.put(f"{API}/companies/me/landing", json={"content": scratch},
                    headers=admin_h, timeout=10)
        # Verify dirty
        meta = requests.get(f"{API}/companies/me/landing?mode=draft", headers=admin_h, timeout=10).json()
        assert meta["has_unpublished_changes"] is True

        # Discard
        r = requests.post(f"{API}/companies/me/landing/discard", headers=admin_h, timeout=10)
        assert r.status_code == 200

        meta2 = requests.get(f"{API}/companies/me/landing?mode=draft", headers=admin_h, timeout=10).json()
        assert meta2["has_unpublished_changes"] is False
        assert "_test_scratch" not in (meta2.get("content") or {})


# ---------- Public landing — host resolution ----------
class TestPublicLanding:
    def test_unknown_host_returns_found_false(self):
        r = requests.get(f"{API}/public/company-landing",
                         params={"host": "nonexistent-host-xyz-12345.com"}, timeout=10)
        assert r.status_code == 200
        assert r.json() == {"found": False}

    def test_system_host_returns_found_false(self):
        for h in ("preview.emergentagent.com", "surirent.sr", "www.surirent.sr"):
            r = requests.get(f"{API}/public/company-landing", params={"host": h}, timeout=10)
            assert r.status_code == 200, h
            assert r.json() == {"found": False}, h

    def test_known_host_returns_company(self):
        r = requests.get(f"{API}/public/company-landing", params={"host": TEST_DOMAIN}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["found"] is True
        assert "company" in data
        assert "apartments" in data
        assert "content" in data
        # _id never leaks
        assert "_id" not in data["company"]
        for a in data["apartments"]:
            assert "_id" not in a
            assert a.get("status") in ("vacant", "available")


# ---------- Landing apartments parity ----------
class TestLandingApartments:
    def test_admin_list_matches_public(self, admin_h):
        admin_r = requests.get(f"{API}/companies/me/landing-apartments", headers=admin_h, timeout=10)
        assert admin_r.status_code == 200, admin_r.text
        admin_ids = {a["id"] for a in admin_r.json()}

        pub = requests.get(f"{API}/public/company-landing",
                          params={"host": TEST_DOMAIN}, timeout=10).json()
        pub_ids = {a["id"] for a in pub.get("apartments", [])}
        assert admin_ids == pub_ids


# ---------- Leads ----------
class TestLandingLeads:
    LEAD_NAME = "TEST_Lead_iter32"

    def test_submit_lead_no_auth(self, admin_company_id):
        r = requests.post(f"{API}/public/landing-lead", json={
            "company_id": admin_company_id,
            "name": self.LEAD_NAME,
            "phone": "+597-555-1234",
            "email": "test-lead@example.com",
            "message": "Geinteresseerd in een appartement.",
        }, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        assert "lead_id" in r.json()

    def test_submit_lead_requires_name_and_phone(self, admin_company_id):
        r = requests.post(f"{API}/public/landing-lead", json={
            "company_id": admin_company_id, "name": "", "phone": ""
        }, timeout=10)
        assert r.status_code == 400

    def test_submit_lead_bad_company(self):
        r = requests.post(f"{API}/public/landing-lead", json={
            "company_id": "bogus-id-xyz", "name": "X", "phone": "123"
        }, timeout=10)
        assert r.status_code == 404

    def test_admin_can_list_leads(self, admin_h):
        r = requests.get(f"{API}/companies/me/landing-leads", headers=admin_h, timeout=10)
        assert r.status_code == 200, r.text
        leads = r.json()
        assert isinstance(leads, list)
        # Our just-created lead must appear
        names = [lead.get("name") for lead in leads]
        assert self.LEAD_NAME in names


# ---------- Superadmin variants ----------
class TestSuperadminLanding:
    def test_superadmin_get_put_publish(self, super_h, admin_company_id):
        # GET draft
        r = requests.get(f"{API}/superadmin/companies/{admin_company_id}/landing",
                         headers=super_h, timeout=10)
        assert r.status_code == 200, r.text
        cur = r.json()
        content = dict(cur.get("content") or {})
        hero = dict(content.get("hero") or {})
        original = hero.get("title_line1", "")
        hero["title_line1"] = "TEST_SUPER_EDIT_iter32"
        content["hero"] = hero

        # PUT
        r = requests.put(f"{API}/superadmin/companies/{admin_company_id}/landing",
                         json={"content": content}, headers=super_h, timeout=10)
        assert r.status_code == 200, r.text

        # Publish
        r = requests.post(f"{API}/superadmin/companies/{admin_company_id}/landing/publish",
                          headers=super_h, timeout=10)
        assert r.status_code == 200, r.text

        # Verify on public
        pub = requests.get(f"{API}/public/company-landing", params={"host": TEST_DOMAIN}, timeout=10).json()
        assert pub["content"].get("hero", {}).get("title_line1") == "TEST_SUPER_EDIT_iter32"

        # Restore
        hero["title_line1"] = original
        content["hero"] = hero
        requests.put(f"{API}/superadmin/companies/{admin_company_id}/landing",
                     json={"content": content}, headers=super_h, timeout=10)
        requests.post(f"{API}/superadmin/companies/{admin_company_id}/landing/publish",
                      headers=super_h, timeout=10)

    def test_admin_forbidden_on_superadmin_endpoints(self, admin_h, admin_company_id):
        r = requests.get(f"{API}/superadmin/companies/{admin_company_id}/landing",
                         headers=admin_h, timeout=10)
        assert r.status_code == 403


# ---------- Cleanup ----------
def test_zz_cleanup(admin_h):
    """Clear test custom domain so it doesn't bleed into next iteration."""
    # Restore the original demo domain (iter context said surirent-demo.com)
    r = requests.put(f"{API}/companies/me/custom-domain",
                     json={"custom_domain": "surirent-demo.com"},
                     headers=admin_h, timeout=10)
    assert r.status_code == 200, r.text
