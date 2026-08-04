"""Iter 31: SaaS Overzicht + Live Landing Editor + presence tracking."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to reading frontend env file
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

from conftest import SUPER_EMAIL, SUPER_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD

SUPER = {"email": SUPER_EMAIL, "password": SUPER_PASSWORD}
ADMIN = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def super_token():
    return _login(SUPER)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# --- Superadmin overview --------------------------------------------------
class TestSuperadminOverview:
    def test_overview_returns_new_fields(self, super_token):
        r = requests.get(f"{BASE_URL}/api/superadmin/overview", headers=_hdr(super_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for f in ["online_now", "open_invoices", "pending_ocr", "paid_invoices",
                  "companies_total", "trial", "active", "expired", "cancelled", "mrr"]:
            assert f in d, f"missing field: {f} in {d}"
        assert isinstance(d["online_now"], int)
        assert isinstance(d["open_invoices"], int)
        assert isinstance(d["pending_ocr"], int)

    def test_online_status_shape(self, super_token):
        r = requests.get(f"{BASE_URL}/api/superadmin/online-status", headers=_hdr(super_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "companies" in d and isinstance(d["companies"], list)
        assert "total_online" in d
        assert d.get("threshold_seconds") == 300
        assert "checked_at" in d
        if d["companies"]:
            row = d["companies"][0]
            for f in ["id", "name", "slug", "last_seen_at", "online", "billing_status"]:
                assert f in row

    def test_overview_forbidden_for_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/superadmin/overview", headers=_hdr(admin_token), timeout=15)
        assert r.status_code in (401, 403)


# --- Presence tracking -----------------------------------------------------
class TestPresenceTracking:
    def test_admin_me_updates_company_last_seen(self, admin_token, super_token):
        # Force last_seen update by calling /api/auth/me as admin
        r1 = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(admin_token), timeout=15)
        assert r1.status_code == 200, r1.text
        me = r1.json()
        admin_company_id = me.get("company_id")
        assert admin_company_id, "admin should have a company_id"

        # Now query online-status as superadmin and find the admin's company.
        time.sleep(1)
        r2 = requests.get(f"{BASE_URL}/api/superadmin/online-status", headers=_hdr(super_token), timeout=15)
        assert r2.status_code == 200
        rows = r2.json()["companies"]
        match = next((c for c in rows if c["id"] == admin_company_id), None)
        assert match is not None, f"admin company {admin_company_id} not in rows"
        assert match["online"] is True, f"admin company should be online: {match}"
        assert match["last_seen_at"], "last_seen_at should be populated"


# --- Landing editor backend ------------------------------------------------
class TestLandingEditor:
    def test_get_draft_initial(self, super_token):
        r = requests.get(f"{BASE_URL}/api/superadmin/landing/content?mode=draft",
                         headers=_hdr(super_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for f in ["content", "defaults", "allowed_icons", "has_unpublished_changes"]:
            assert f in d, f"missing {f}"
        assert isinstance(d["content"], dict)

    def test_get_published(self, super_token):
        r = requests.get(f"{BASE_URL}/api/superadmin/landing/content?mode=published",
                         headers=_hdr(super_token), timeout=15)
        assert r.status_code == 200

    def test_draft_save_publish_discard_flow(self, super_token):
        marker = f"TEST_HERO_{int(time.time())}"

        # 1. Read current draft to keep all other fields intact
        r0 = requests.get(f"{BASE_URL}/api/superadmin/landing/content?mode=draft",
                          headers=_hdr(super_token), timeout=15)
        assert r0.status_code == 200
        current = r0.json()["content"]
        # set a v2 nested test value
        v2 = current.setdefault("v2", {})
        hero = v2.setdefault("hero", {})
        original_title = hero.get("title_highlight")
        hero["title_highlight"] = marker

        # 2. PUT draft
        r1 = requests.put(f"{BASE_URL}/api/superadmin/landing/content",
                          headers={**_hdr(super_token), "Content-Type": "application/json"},
                          json={"content": current}, timeout=15)
        assert r1.status_code == 200, r1.text
        assert r1.json().get("has_unpublished_changes") is True

        # 3. Verify draft contains marker
        r2 = requests.get(f"{BASE_URL}/api/superadmin/landing/content?mode=draft",
                          headers=_hdr(super_token), timeout=15)
        assert r2.json()["content"]["v2"]["hero"]["title_highlight"] == marker

        # 4. Publish
        r3 = requests.post(f"{BASE_URL}/api/superadmin/landing/publish",
                           headers=_hdr(super_token), timeout=15)
        assert r3.status_code == 200, r3.text
        assert r3.json().get("ok") is True

        # 5. Verify public /api/landing/content shows the marker
        r4 = requests.get(f"{BASE_URL}/api/landing/content", timeout=15)
        assert r4.status_code == 200
        pub_content = r4.json().get("content", {})
        assert pub_content.get("v2", {}).get("hero", {}).get("title_highlight") == marker, \
            f"published content missing marker: {pub_content.get('v2')}"

        # 6. Restore: put original value (or remove marker) and publish + discard
        if original_title is None:
            current["v2"]["hero"].pop("title_highlight", None)
        else:
            current["v2"]["hero"]["title_highlight"] = original_title
        r5 = requests.put(f"{BASE_URL}/api/superadmin/landing/content",
                          headers={**_hdr(super_token), "Content-Type": "application/json"},
                          json={"content": current}, timeout=15)
        assert r5.status_code == 200
        r6 = requests.post(f"{BASE_URL}/api/superadmin/landing/publish",
                           headers=_hdr(super_token), timeout=15)
        assert r6.status_code == 200

        # 7. Discard wipes draft back to published
        r7 = requests.post(f"{BASE_URL}/api/superadmin/landing/discard",
                           headers=_hdr(super_token), timeout=15)
        assert r7.status_code == 200, r7.text

        # 8. has_unpublished_changes should now be False
        r8 = requests.get(f"{BASE_URL}/api/superadmin/landing/content?mode=draft",
                          headers=_hdr(super_token), timeout=15)
        assert r8.json().get("has_unpublished_changes") is False

    def test_landing_endpoints_forbidden_for_admin(self, admin_token):
        r1 = requests.get(f"{BASE_URL}/api/superadmin/landing/content?mode=draft",
                          headers=_hdr(admin_token), timeout=15)
        assert r1.status_code in (401, 403)
        r2 = requests.post(f"{BASE_URL}/api/superadmin/landing/publish",
                           headers=_hdr(admin_token), timeout=15)
        assert r2.status_code in (401, 403)
        r3 = requests.post(f"{BASE_URL}/api/superadmin/landing/discard",
                           headers=_hdr(admin_token), timeout=15)
        assert r3.status_code in (401, 403)
