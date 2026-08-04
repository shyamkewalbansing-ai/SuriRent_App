"""Iter36 regression sanity — verifies backend behavior remains identical
after limited code-review fixes (env-driven credentials, comment reword,
React key hygiene). No business logic should have changed.
"""
import os
import pytest
import requests
import sys
sys.path.insert(0, "/app/backend")
from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD, SUPER_EMAIL, SUPER_PASSWORD, KIOSK_PIN

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/") + "/api"
COMPANY_SLUG = "surirent"
RAYSHREE_TENANT_ID = "c44bf27c-c95b-4963-a301-3f0bee5f10e1"
NFC_UID = "7755"


# --- Auth: admin login ---
def test_admin_login():
    r = requests.post(f"{BASE}/auth/login", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "company_slug": COMPANY_SLUG
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("token")
    assert data.get("user", {}).get("email") == ADMIN_EMAIL
    assert data.get("company")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/auth/login", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "company_slug": COMPANY_SLUG
    })
    assert r.status_code == 200
    return r.json()["token"]


# --- Kiosk PIN login ---
def test_kiosk_pin_login():
    r = requests.post(f"{BASE}/auth/kiosk-pin", json={
        "pin": KIOSK_PIN, "company_slug": COMPANY_SLUG
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("token") or body.get("kiosk_token") or body.get("ok")


# --- Superadmin login ---
def test_superadmin_login():
    r = requests.post(f"{BASE}/auth/login", json={
        "email": SUPER_EMAIL, "password": SUPER_PASSWORD
    })
    assert r.status_code == 200, r.text
    assert r.json().get("token")


# --- Public landing by slug ---
def test_public_landing_by_slug():
    r = requests.get(f"{BASE}/public/company-landing/by-slug/{COMPANY_SLUG}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("found") is True
    company = data.get("company") or data
    # kkf_number must be present in projection
    keys = list(company.keys()) if isinstance(company, dict) else []
    assert "kkf_number" in company or "kkf_number" in data, f"kkf_number missing; keys={keys}"


# --- Ensure Rayshree's NFC card is linked; then NFC login ---
def test_nfc_relink_and_login(admin_token):
    # Ensure link (idempotent)
    r = requests.put(
        f"{BASE}/admin/tenants/{RAYSHREE_TENANT_ID}/nfc-card",
        json={"card_id": NFC_UID},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # 200 on link; if already linked to same UID some impls return 200 too
    assert r.status_code in (200, 204), r.text

    # Now perform NFC login
    r2 = requests.post(f"{BASE}/tenant-portal/nfc-login", json={
        "card_id": NFC_UID, "company_slug": COMPANY_SLUG
    })
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body.get("token") or body.get("tenant_token")
    tenant = body.get("tenant") or {}
    name = (tenant.get("name") or tenant.get("full_name") or "").lower()
    assert "rayshree" in name, f"expected Rayshree, got tenant={tenant}"


# --- SOFT billing enforcement: expired → GET /api/tenants still 200 ---
def test_billing_soft_enforcement(admin_token):
    # Find Dado company id via /auth/me
    me = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert me.status_code == 200
    me_data = me.json()
    company = me_data.get("active_company") or me_data.get("company") or {}
    company_id = company.get("id") or me_data.get("company_id") or me_data.get("active_company_id")
    prev_status = me_data.get("_billing_status") or company.get("billing_status") or "trial"
    assert company_id, f"company id missing in /me: {me_data}"

    # Directly toggle billing_status via mongo since soft-mode has no HTTP hard block anyway;
    # we still validate that even with 'expired' the /tenants endpoint returns 200.
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME not set — cannot toggle billing_status")
    mc = MongoClient(mongo_url)
    coll = mc[db_name]["companies"]
    coll.update_one({"id": company_id}, {"$set": {"billing_status": "expired"}})
    try:
        r = requests.get(f"{BASE}/tenants", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, f"Billing enforcement is not SOFT (got {r.status_code}): {r.text[:300]}"
    finally:
        coll.update_one({"id": company_id}, {"$set": {"billing_status": prev_status or "trial"}})
        mc.close()
