"""
Iter 35 — Backend tests for Customer Display session-reset, auto-idle persist,
live preview categories, full DELETE reset and auth cookie regression.

Scenarios covered (from review_request iter35):
  BE-A) Session reset on apartment change (apt OLD → NEW clears method_chosen_at lock)
  BE-B) Session reset on step='select' with apartment=null (lock broken)
  BE-C) Auto-idle for stale 'receipt' state PERSISTS in DB (not just in-memory)
  BE-D) Live preview categories propagate (PUT step=pay with categories → GET reflects them)
  BE-E) DELETE /api/kiosk/customer-display fully resets to step='idle'
  BE-F) httpOnly cookie auth regression (login, /me via cookie + bearer fallback)
"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://vastgoed-app.preview.emergentagent.com"
).rstrip("/")
ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = "admin123"
SLUG = "surirent"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
# Read DB_NAME from backend/.env so tests hit the same DB the server is using.
_BACKEND_ENV = "/app/backend/.env"
DB_NAME = os.environ.get("DB_NAME") or "vastgoed_kiosk"
try:
    if os.path.exists(_BACKEND_ENV):
        with open(_BACKEND_ENV) as _f:
            for _ln in _f:
                _ln = _ln.strip()
                if _ln.startswith("DB_NAME"):
                    _v = _ln.split("=", 1)[1].strip().strip('"').strip("'")
                    if _v:
                        DB_NAME = _v
                        break
except Exception:
    pass


# ---------- helpers ----------
def _login(session: requests.Session) -> requests.Response:
    return session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )


def _public_get():
    r = requests.get(f"{BASE_URL}/api/public/customer-display/{SLUG}", timeout=15)
    assert r.status_code == 200, f"public GET failed {r.status_code}: {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = _login(s)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def company_id(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 200
    body = r.json()
    cid = body.get("company_id") or (body.get("user") or {}).get("company_id")
    # fallback: look up via companies collection
    if not cid:
        mc = MongoClient(MONGO_URL)
        comp = mc[DB_NAME].companies.find_one({"slug": SLUG}, {"id": 1, "_id": 0})
        assert comp, "company surirent not found"
        cid = comp["id"]
    assert cid, "could not resolve company_id"
    return cid


@pytest.fixture
def clean_cd(admin_session):
    """DELETE customer-display so each test starts from idle."""
    admin_session.delete(f"{BASE_URL}/api/kiosk/customer-display", timeout=15)
    yield
    admin_session.delete(f"{BASE_URL}/api/kiosk/customer-display", timeout=15)


# ---------- BE-F: Auth regression (run first as quick sanity) ----------
class TestAuthRegression:
    def test_login_sets_cookie(self):
        s = requests.Session()
        r = _login(s)
        assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
        names = [c.name for c in s.cookies]
        assert "access_token" in names, f"access_token not set, cookies={names}"

    def test_me_via_cookie_only(self):
        s = requests.Session()
        _login(s)
        r = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200, f"/me cookie failed: {r.status_code} {r.text}"

    def test_me_via_bearer_only(self):
        s = requests.Session()
        body = _login(s).json()
        tok = body.get("access_token") or body.get("token")
        assert tok, f"no token in body: {body}"
        s2 = requests.Session()
        r = s2.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {tok}"},
            timeout=15,
        )
        assert r.status_code == 200, f"bearer fallback failed: {r.status_code} {r.text}"


# ---------- BE-A: Session reset on apartment change ----------
class TestSessionResetOnApartmentChange:
    def test_apartment_change_clears_method_lock(self, admin_session, clean_cd):
        # 1) Set state on OLD apartment with a method_chosen_at lock (simulating
        #    customer locked previous tenant on method screen).
        old_apt = {"id": "APT-OLD-001", "label": "Old Apt"}
        put1 = admin_session.put(
            f"{BASE_URL}/api/kiosk/customer-display",
            json={
                "step": "method",
                "apartment": old_apt,
                "tenant": {"id": "T-OLD", "name": "Old Tenant"},
                "payload": {
                    "amount": 100,
                    "currency": "SRD",
                    "method": "mope",
                    "method_chosen_at": "2026-01-01T10:00:00+00:00",
                },
            },
            timeout=15,
        )
        assert put1.status_code == 200, f"PUT old failed: {put1.status_code} {put1.text}"

        # Confirm lock present
        s1 = _public_get()["state"]
        assert s1.get("step") == "method"
        assert (s1.get("payload") or {}).get("method_chosen_at"), s1

        # 2) Operator switches to NEW apartment with step=overview, payload=null
        new_apt = {"id": "APT-NEW-002", "label": "New Apt"}
        put2 = admin_session.put(
            f"{BASE_URL}/api/kiosk/customer-display",
            json={
                "step": "overview",
                "apartment": new_apt,
                "tenant": {"id": "T-NEW", "name": "New Tenant"},
                "payload": None,
            },
            timeout=15,
        )
        assert put2.status_code == 200, f"PUT new failed: {put2.status_code} {put2.text}"

        # 3) GET should reflect new apartment, step=overview, lock cleared
        s2 = _public_get()["state"]
        assert s2.get("step") == "overview", f"step should be overview, got: {s2}"
        assert (s2.get("apartment") or {}).get("id") == "APT-NEW-002", s2
        p = s2.get("payload") or {}
        assert not p.get("method_chosen_at"), f"method_chosen_at NOT cleared: {p}"
        assert not p.get("method"), f"method NOT cleared: {p}"


# ---------- BE-B: Session reset on step='select' with apartment=null ----------
class TestSessionResetOnSelectStep:
    def test_select_step_breaks_lock(self, admin_session, clean_cd):
        # Lock state in receipt phase with method_chosen_at
        put1 = admin_session.put(
            f"{BASE_URL}/api/kiosk/customer-display",
            json={
                "step": "receipt",
                "apartment": {"id": "APT-X", "label": "X"},
                "tenant": {"id": "T-X", "name": "X"},
                "payload": {
                    "amount": 50,
                    "currency": "SRD",
                    "method": "contant",
                    "method_chosen_at": "2026-01-01T10:00:00+00:00",
                },
            },
            timeout=15,
        )
        assert put1.status_code == 200

        # Operator goes back to apartment picker (select step, no apartment)
        put2 = admin_session.put(
            f"{BASE_URL}/api/kiosk/customer-display",
            json={"step": "select", "apartment": None, "tenant": None, "payload": None},
            timeout=15,
        )
        assert put2.status_code == 200, f"PUT select failed: {put2.text}"

        s = _public_get()["state"]
        assert s.get("step") == "select", f"step should be select, got: {s}"
        p = s.get("payload") or {}
        assert not p.get("method_chosen_at"), f"method_chosen_at NOT cleared: {p}"


# ---------- BE-C: Auto-idle persist to DB for stale receipt ----------
class TestAutoIdlePersists:
    def test_stale_receipt_autoreset_and_persists(
        self, admin_session, company_id, clean_cd
    ):
        # Directly write a stale 'receipt' state into mongo with updated_at 20s ago
        mc = MongoClient(MONGO_URL)
        coll = mc[DB_NAME].customer_display
        stale_ts = (datetime.now(timezone.utc) - timedelta(seconds=20)).isoformat()
        stale_state = {
            "step": "receipt",
            "apartment": {"id": "APT-Z", "label": "Z"},
            "payload": {
                "amount": 99,
                "method": "mope",
                "method_chosen_at": stale_ts,
            },
            "updated_at": stale_ts,
        }
        coll.update_one(
            {"company_id": company_id},
            {"$set": {"company_id": company_id, "state": stale_state, "updated_at": stale_ts}},
            upsert=True,
        )

        # GET public — should auto-reset to idle
        s1 = _public_get()["state"]
        assert s1.get("step") == "idle", f"expected idle, got: {s1}"

        # Verify the idle reset PERSISTED to mongo (not just in-memory)
        doc = coll.find_one({"company_id": company_id}, {"_id": 0})
        assert (doc or {}).get("state", {}).get("step") == "idle", (
            f"DB not updated to idle: {doc}"
        )
        db_payload = ((doc or {}).get("state") or {}).get("payload") or {}
        assert not db_payload.get("method_chosen_at"), (
            f"DB still has method_chosen_at after auto-idle: {db_payload}"
        )

        # Subsequent GET still sees idle
        s2 = _public_get()["state"]
        assert s2.get("step") == "idle", s2

        # A fresh PUT step=overview should succeed without old lock interfering
        new_put = admin_session.put(
            f"{BASE_URL}/api/kiosk/customer-display",
            json={
                "step": "overview",
                "apartment": {"id": "APT-FRESH", "label": "Fresh"},
                "tenant": {"id": "T-FRESH", "name": "Fresh"},
                "payload": None,
            },
            timeout=15,
        )
        assert new_put.status_code == 200
        s3 = _public_get()["state"]
        assert s3.get("step") == "overview", f"new PUT not reflected: {s3}"
        p = s3.get("payload") or {}
        assert not p.get("method_chosen_at"), f"old lock interfered: {p}"


# ---------- BE-D: Live preview categories propagate ----------
class TestLivePreviewCategories:
    def test_pay_categories_roundtrip(self, admin_session, clean_cd):
        cats = [
            {"key": "huur", "label": "Huur Jul", "value": 75},
            {"key": "internet", "label": "Internet", "value": 10},
        ]
        r = admin_session.put(
            f"{BASE_URL}/api/kiosk/customer-display",
            json={
                "step": "pay",
                "apartment": {"id": "APT-LP", "label": "LP"},
                "tenant": {"id": "T-LP", "name": "LP"},
                "payload": {"amount": 85, "currency": "SRD", "categories": cats},
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        state = _public_get()["state"]
        assert state.get("step") == "pay"
        p = state.get("payload") or {}
        assert p.get("amount") == 85, p
        out_cats = p.get("categories") or []
        assert len(out_cats) == 2, out_cats
        keys = {c.get("key") for c in out_cats}
        assert {"huur", "internet"} <= keys, out_cats
        # exact value preservation
        by_key = {c["key"]: c for c in out_cats}
        assert by_key["huur"]["value"] == 75
        assert by_key["internet"]["value"] == 10
        assert by_key["huur"]["label"] == "Huur Jul"


# ---------- BE-E: DELETE fully resets ----------
class TestDeleteResets:
    def test_delete_returns_idle(self, admin_session):
        # First set some state
        admin_session.put(
            f"{BASE_URL}/api/kiosk/customer-display",
            json={
                "step": "pay",
                "apartment": {"id": "APT-D", "label": "D"},
                "payload": {"amount": 200, "currency": "SRD"},
            },
            timeout=15,
        )
        # DELETE
        d = admin_session.delete(f"{BASE_URL}/api/kiosk/customer-display", timeout=15)
        assert d.status_code == 200, f"DELETE failed: {d.status_code} {d.text}"

        s = _public_get()["state"]
        assert s.get("step") == "idle", f"step not idle after DELETE: {s}"
        # payload should be absent or null
        p = s.get("payload")
        assert (p is None) or (p == {}), f"payload not cleared: {p}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
