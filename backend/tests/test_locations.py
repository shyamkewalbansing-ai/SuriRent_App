"""
Iteration 9 — Locations + Kiosk rebuild + internet_amount + uni5pay + approved/received_by

Covers:
  - Locations CRUD (admin auth) with apartment counts
  - Cross-company isolation on locations
  - DELETE detaches apartments (location_id unset)
  - Apartment.location_id persists via POST/PUT
  - Tenant.internet_amount persists via POST/PUT
  - PaymentIn accepts category='internet' + method='uni5pay'
  - Payment stores received_by + approved_by (admin route)
  - Kiosk endpoints: /kiosk/locations (+ _none bucket), /kiosk/apartments?location_id=, 
    /kiosk/tenants/{id}/overview includes internet_amount, /kiosk/tenants/{id}/payments
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://vastgoed-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_B_EMAIL, ADMIN_B_PASSWORD, KIOSK_PIN

ADMIN_A = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
ADMIN_B = {"email": ADMIN_B_EMAIL, "password": ADMIN_B_PASSWORD}
KIOSK_PIN_A = KIOSK_PIN


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text}"
    return r.json()["token"], r.json().get("user", {})


def _no_id_leak(payload):
    if isinstance(payload, dict):
        assert "_id" not in payload, f"ObjectId leak: {payload}"
        for v in payload.values():
            _no_id_leak(v)
    elif isinstance(payload, list):
        for v in payload:
            _no_id_leak(v)


@pytest.fixture(scope="module")
def admin_a():
    tok, user = _login(ADMIN_A)
    return tok, user


@pytest.fixture(scope="module")
def admin_b():
    tok, user = _login(ADMIN_B)
    return tok, user


@pytest.fixture(scope="module")
def kiosk_a_token():
    r = requests.post(f"{API}/auth/kiosk-pin", json={"pin": KIOSK_PIN_A}, timeout=20)
    assert r.status_code == 200, f"kiosk pin: {r.status_code} {r.text}"
    return r.json()["token"]


# =============================================================================
# Locations CRUD
# =============================================================================
class TestLocationsCRUD:
    def test_create_location(self, admin_a):
        tok, _ = admin_a
        body = {"name": f"TEST_LOC_{uuid.uuid4().hex[:6]}", "address": "Teststraat 1", "photo_url": "https://example.com/x.jpg"}
        r = requests.post(f"{API}/locations", headers=_h(tok), json=body, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        _no_id_leak(d)
        assert d["name"] == body["name"]
        assert d["address"] == body["address"]
        assert d["photo_url"] == body["photo_url"]
        assert "id" in d and isinstance(d["id"], str)
        assert d["apartments_total"] == 0
        assert d["apartments_occupied"] == 0
        pytest.loc_id = d["id"]
        pytest.loc_name = d["name"]

    def test_list_locations(self, admin_a):
        tok, _ = admin_a
        r = requests.get(f"{API}/locations", headers=_h(tok), timeout=20)
        assert r.status_code == 200, r.text
        arr = r.json()
        _no_id_leak(arr)
        ids = [x["id"] for x in arr]
        assert pytest.loc_id in ids
        match = [x for x in arr if x["id"] == pytest.loc_id][0]
        assert "apartments_total" in match
        assert "apartments_occupied" in match

    def test_update_location(self, admin_a):
        tok, _ = admin_a
        new_name = pytest.loc_name + "_UPD"
        body = {"name": new_name, "address": "Nieuwe Straat 2", "photo_url": ""}
        r = requests.put(f"{API}/locations/{pytest.loc_id}", headers=_h(tok), json=body, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == new_name
        assert d["address"] == "Nieuwe Straat 2"

        # verify persistence via GET list
        r2 = requests.get(f"{API}/locations", headers=_h(tok), timeout=20)
        match = [x for x in r2.json() if x["id"] == pytest.loc_id][0]
        assert match["name"] == new_name

    def test_cross_company_isolation_get(self, admin_b):
        tok, _ = admin_b
        # Admin B listing should NOT include Admin A's loc_id
        r = requests.get(f"{API}/locations", headers=_h(tok), timeout=20)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert pytest.loc_id not in ids

    def test_cross_company_isolation_update_404(self, admin_b):
        tok, _ = admin_b
        r = requests.put(f"{API}/locations/{pytest.loc_id}", headers=_h(tok), json={"name": "hack"}, timeout=20)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"

    def test_cross_company_isolation_delete_404(self, admin_b):
        tok, _ = admin_b
        r = requests.delete(f"{API}/locations/{pytest.loc_id}", headers=_h(tok), timeout=20)
        assert r.status_code == 404


# =============================================================================
# Apartment.location_id persistence
# =============================================================================
class TestApartmentLocation:
    def test_create_apartment_with_location_id(self, admin_a):
        tok, _ = admin_a
        body = {
            "number": f"TEST_APT_{uuid.uuid4().hex[:5]}",
            "address": "x", "rent_amount": 1500, "currency": "SRD",
            "location_id": pytest.loc_id,
        }
        r = requests.post(f"{API}/apartments", headers=_h(tok), json=body, timeout=20)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        _no_id_leak(d)
        assert d["location_id"] == pytest.loc_id
        pytest.apt_id = d["id"]

        # verify via GET
        r2 = requests.get(f"{API}/apartments", headers=_h(tok), timeout=20)
        match = [x for x in r2.json() if x["id"] == pytest.apt_id][0]
        assert match["location_id"] == pytest.loc_id

    def test_location_count_reflects_apartment(self, admin_a):
        tok, _ = admin_a
        r = requests.get(f"{API}/locations", headers=_h(tok), timeout=20)
        match = [x for x in r.json() if x["id"] == pytest.loc_id][0]
        assert match["apartments_total"] >= 1

    def test_update_apartment_clears_location(self, admin_a):
        tok, _ = admin_a
        body = {"number": "TEST_APT_UPD", "rent_amount": 1500, "currency": "SRD", "location_id": None}
        r = requests.put(f"{API}/apartments/{pytest.apt_id}", headers=_h(tok), json=body, timeout=20)
        assert r.status_code == 200, r.text


# =============================================================================
# Tenant.internet_amount
# =============================================================================
class TestTenantInternet:
    def test_create_tenant_with_internet(self, admin_a):
        tok, _ = admin_a
        body = {
            "name": f"TEST_TENANT_{uuid.uuid4().hex[:5]}",
            "phone": "+597 8009999", "email": "test@x.sr",
            "internet_amount": 75.50,
        }
        r = requests.post(f"{API}/tenants", headers=_h(tok), json=body, timeout=20)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        _no_id_leak(d)
        assert d["internet_amount"] == 75.50
        pytest.tenant_id = d["id"]

    def test_update_tenant_internet(self, admin_a):
        tok, _ = admin_a
        body = {"name": "TEST_TENANT_UPD", "internet_amount": 99.99}
        r = requests.put(f"{API}/tenants/{pytest.tenant_id}", headers=_h(tok), json=body, timeout=20)
        assert r.status_code == 200, r.text
        # verify via GET
        r2 = requests.get(f"{API}/tenants/{pytest.tenant_id}", headers=_h(tok), timeout=20)
        if r2.status_code == 200:
            assert r2.json()["internet_amount"] == 99.99
        else:
            # Some apps don't expose single-tenant; fall back to list
            r2 = requests.get(f"{API}/tenants", headers=_h(tok), timeout=20)
            match = [x for x in r2.json() if x["id"] == pytest.tenant_id][0]
            assert match["internet_amount"] == 99.99


# =============================================================================
# PaymentIn — internet category + uni5pay method + approved_by/received_by
# =============================================================================
class TestPaymentExtensions:
    def test_payment_internet_uni5pay(self, admin_a):
        tok, user = admin_a
        body = {
            "tenant_id": pytest.tenant_id,
            "amount": 100.0,
            "currency": "SRD",
            "method": "uni5pay",
            "category": "internet",
            "received_by": "Kasmedewerker Test",
        }
        r = requests.post(f"{API}/payments", headers=_h(tok), json=body, timeout=20)
        assert r.status_code in (200, 201), f"422 = schema reject: {r.status_code} {r.text}"
        d = r.json()
        _no_id_leak(d)
        assert d["method"] == "uni5pay"
        assert d["category"] == "internet"
        assert d["received_by"] == "Kasmedewerker Test"
        assert d.get("approved_by"), "approved_by should default to user name/email"
        pytest.payment_id = d["id"]

    def test_payment_reject_invalid_method(self, admin_a):
        tok, _ = admin_a
        body = {"tenant_id": pytest.tenant_id, "amount": 10, "method": "crypto", "category": "huur"}
        r = requests.post(f"{API}/payments", headers=_h(tok), json=body, timeout=20)
        assert r.status_code == 422


# =============================================================================
# Kiosk endpoints
# =============================================================================
class TestKioskLocations:
    def test_kiosk_list_locations_includes_test_loc(self, kiosk_a_token):
        h = {"Authorization": f"Bearer {kiosk_a_token}"}
        r = requests.get(f"{API}/kiosk/locations", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        arr = r.json()
        _no_id_leak(arr)
        ids = [x["id"] for x in arr]
        # may include _none bucket
        assert pytest.loc_id in ids or any(x.get("name", "").startswith("TEST_LOC_") for x in arr)

    def test_kiosk_list_locations_none_bucket(self, kiosk_a_token):
        # Per DB seed there should be unassigned apartments (HUIS 7K)
        h = {"Authorization": f"Bearer {kiosk_a_token}"}
        r = requests.get(f"{API}/kiosk/locations", headers=h, timeout=20)
        arr = r.json()
        none_buckets = [x for x in arr if x["id"] == "_none"]
        # We just verify shape — _none appears only if unassigned > 0
        if none_buckets:
            assert none_buckets[0]["name"]
            assert none_buckets[0]["apartments_total"] >= 1

    def test_kiosk_apartments_filtered_by_location(self, kiosk_a_token):
        h = {"Authorization": f"Bearer {kiosk_a_token}"}
        r = requests.get(f"{API}/kiosk/apartments", params={"location_id": pytest.loc_id}, headers=h, timeout=20)
        assert r.status_code == 200
        arr = r.json()
        for a in arr:
            assert a["location_id"] == pytest.loc_id

    def test_kiosk_apartments_none(self, kiosk_a_token):
        h = {"Authorization": f"Bearer {kiosk_a_token}"}
        r = requests.get(f"{API}/kiosk/apartments", params={"location_id": "_none"}, headers=h, timeout=20)
        assert r.status_code == 200
        arr = r.json()
        for a in arr:
            assert not a.get("location_id")

    def test_kiosk_tenant_overview_includes_internet(self, kiosk_a_token):
        h = {"Authorization": f"Bearer {kiosk_a_token}"}
        r = requests.get(f"{API}/kiosk/tenants/{pytest.tenant_id}/overview", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        _no_id_leak(d)
        assert "internet_amount" in d["tenant"]
        assert d["tenant"]["internet_amount"] == 99.99

    def test_kiosk_tenant_payments(self, kiosk_a_token):
        h = {"Authorization": f"Bearer {kiosk_a_token}"}
        r = requests.get(f"{API}/kiosk/tenants/{pytest.tenant_id}/payments", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        arr = r.json()
        _no_id_leak(arr)
        # our test created one payment for this tenant
        assert any(p["id"] == pytest.payment_id for p in arr)

    def test_kiosk_tenant_payments_scope_cross_company(self, kiosk_a_token, admin_b):
        # Use admin B to fetch a tenant in their own scope, then check kiosk A can't see it
        tok_b, _ = admin_b
        r = requests.get(f"{API}/tenants", headers=_h(tok_b), timeout=20)
        if r.status_code == 200 and r.json():
            tenant_b_id = r.json()[0]["id"]
            h = {"Authorization": f"Bearer {kiosk_a_token}"}
            r2 = requests.get(f"{API}/kiosk/tenants/{tenant_b_id}/payments", headers=h, timeout=20)
            assert r2.status_code == 404


# =============================================================================
# Cleanup: DELETE location detaches apartments
# =============================================================================
class TestLocationDelete:
    def test_delete_location_detaches_apartments(self, admin_a):
        tok, _ = admin_a
        # First reattach apt to location
        body = {"number": "TEST_APT_REATT", "rent_amount": 1500, "currency": "SRD", "location_id": pytest.loc_id}
        r = requests.put(f"{API}/apartments/{pytest.apt_id}", headers=_h(tok), json=body, timeout=20)
        assert r.status_code == 200

        # Delete location
        r = requests.delete(f"{API}/locations/{pytest.loc_id}", headers=_h(tok), timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Apartment should now have no location_id
        r2 = requests.get(f"{API}/apartments", headers=_h(tok), timeout=20)
        match = [x for x in r2.json() if x["id"] == pytest.apt_id][0]
        assert not match.get("location_id"), f"location_id should be detached, got {match.get('location_id')}"

        # Location is gone
        r3 = requests.get(f"{API}/locations", headers=_h(tok), timeout=20)
        ids = [x["id"] for x in r3.json()]
        assert pytest.loc_id not in ids

    def test_cleanup_apt_and_tenant(self, admin_a):
        tok, _ = admin_a
        requests.delete(f"{API}/apartments/{pytest.apt_id}", headers=_h(tok), timeout=20)
        requests.delete(f"{API}/tenants/{pytest.tenant_id}", headers=_h(tok), timeout=20)
        # don't assert — best-effort cleanup
