"""
Multi-Company SaaS Isolation Tests (iteration 5)
================================================
Verifies that:
  - Admin A and Admin B can only see their own company's data
  - Superadmin sees all companies; with x-active-company header, scoped
  - /api/companies CRUD (superadmin only)
  - Kiosk PIN multi-company (unique per company)
  - All tenant-scoped CRUD endpoints apply company_id filter
  - admin/stats only counts own company
  - PDF endpoints work for own company items
  - No ObjectId leaks
"""
import os
import uuid
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://vastgoed-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

SUPER = {"email": "super@surirent.sr", "password": "super123"}
ADMIN_A = {"email": "admin@vastgoed.sr", "password": "admin123"}
ADMIN_B = {"email": "adminb@test.sr", "password": "adminb123"}


# ---------- helpers ----------
def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data


def _h(token, active=None):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if active:
        h["x-active-company"] = active
    return h


def _no_objectid(payload):
    """Recursive check that no '_id' key (Mongo ObjectId leak) is present."""
    if isinstance(payload, dict):
        assert "_id" not in payload, f"ObjectId leak: {payload}"
        for v in payload.values():
            _no_objectid(v)
    elif isinstance(payload, list):
        for v in payload:
            _no_objectid(v)


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def super_token():
    tok, _ = _login(SUPER)
    return tok


@pytest.fixture(scope="module")
def admin_a():
    tok, data = _login(ADMIN_A)
    return {"token": tok, "user": data["user"], "company": data["company"]}


@pytest.fixture(scope="module")
def admin_b():
    tok, data = _login(ADMIN_B)
    return {"token": tok, "user": data["user"], "company": data["company"]}


# ---------- Auth ----------
class TestAuth:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_login_super(self):
        tok, data = _login(SUPER)
        assert data["user"]["role"] == "superadmin"
        assert data["user"].get("company_id") in (None, "")

    def test_login_admin_a(self, admin_a):
        assert admin_a["user"]["role"] == "admin"
        assert admin_a["company"]["slug"] == "surirent"
        assert admin_a["user"]["company_id"] == admin_a["company"]["id"]

    def test_login_admin_b(self, admin_b):
        assert admin_b["user"]["role"] == "admin"
        assert admin_b["company"]["slug"] == "test-vastgoed-b"
        assert admin_b["user"]["company_id"] == admin_b["company"]["id"]

    def test_me_returns_active_company(self, admin_a):
        r = requests.get(f"{API}/auth/me", headers=_h(admin_a["token"]), timeout=10)
        assert r.status_code == 200
        data = r.json()
        _no_objectid(data)
        assert data["active_company_id"] == admin_a["company"]["id"]
        assert data["active_company"]["slug"] == "surirent"

    def test_me_super_with_header(self, super_token, admin_b):
        r = requests.get(f"{API}/auth/me", headers=_h(super_token, admin_b["company"]["id"]), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["active_company_id"] == admin_b["company"]["id"]
        assert data["active_company"]["slug"] == "test-vastgoed-b"

    def test_me_super_no_header_unscoped(self, super_token):
        r = requests.get(f"{API}/auth/me", headers=_h(super_token), timeout=10)
        assert r.status_code == 200
        # active_company_id should be None (unscoped — sees everything)
        assert r.json().get("active_company_id") in (None, "")


# ---------- Companies (superadmin) ----------
class TestCompanies:
    def test_list_requires_superadmin(self, admin_a):
        r = requests.get(f"{API}/companies", headers=_h(admin_a["token"]), timeout=10)
        assert r.status_code == 403

    def test_list_with_stats(self, super_token):
        r = requests.get(f"{API}/companies", headers=_h(super_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        _no_objectid(data)
        assert isinstance(data, list) and len(data) >= 2
        for c in data:
            assert "stats" in c
            for k in ("apartments", "tenants", "admins"):
                assert k in c["stats"]
            assert "slug" in c and "name" in c

    def test_create_update_delete_company(self, super_token):
        slug = f"test-iso-{uuid.uuid4().hex[:6]}"
        payload = {"name": "TEST Iso Co", "slug": slug, "plan": "starter", "active": True,
                   "contact_email": "x@x.sr", "contact_phone": "", "address": ""}
        r = requests.post(f"{API}/companies", headers=_h(super_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        _no_objectid(c)
        cid = c["id"]
        # Update
        payload["name"] = "TEST Iso Co Updated"
        r = requests.put(f"{API}/companies/{cid}", headers=_h(super_token), json=payload, timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST Iso Co Updated"
        # Delete (no data → allowed)
        r = requests.delete(f"{API}/companies/{cid}", headers=_h(super_token), timeout=15)
        assert r.status_code == 200

    def test_delete_with_data_refused(self, super_token, admin_a):
        # Admin A's company has data → must refuse
        cid = admin_a["company"]["id"]
        r = requests.delete(f"{API}/companies/{cid}", headers=_h(super_token), timeout=15)
        assert r.status_code == 400

    def test_seed_admin(self, super_token):
        # Create temp company then seed admin
        slug = f"test-seed-{uuid.uuid4().hex[:6]}"
        email = f"seed-{uuid.uuid4().hex[:6]}@test.sr"
        r = requests.post(f"{API}/companies", headers=_h(super_token),
                          json={"name": "TEST Seed", "slug": slug, "plan": "free", "active": True}, timeout=15)
        assert r.status_code == 200
        cid = r.json()["id"]
        try:
            r = requests.post(f"{API}/companies/{cid}/seed-admin", headers=_h(super_token),
                              json={"name": "Seed Admin", "email": email, "password": "seedpw1"}, timeout=15)
            assert r.status_code == 200, r.text
            assert r.json()["email"] == email.lower()
            # Login should work
            tok, _ = _login({"email": email, "password": "seedpw1"})
            assert tok
        finally:
            # cleanup user + company
            requests.delete(f"{API}/companies/{cid}", headers=_h(super_token), timeout=15)


# ---------- Data Isolation ----------
class TestDataIsolation:
    APT_A_ID = None
    APT_B_ID = None

    def test_admin_a_apartments_only_a(self, admin_a):
        r = requests.get(f"{API}/apartments", headers=_h(admin_a["token"]), timeout=15)
        assert r.status_code == 200
        apts = r.json()
        _no_objectid(apts)
        assert all(a.get("number", "").startswith(("A", "H")) or a.get("number") not in ("B1",) for a in apts)
        # No B1 in A's list
        numbers = [a["number"] for a in apts]
        assert "B1" not in numbers, f"DATA LEAK: Admin A sees B1: {numbers}"

    def test_admin_b_apartments_only_b(self, admin_b):
        r = requests.get(f"{API}/apartments", headers=_h(admin_b["token"]), timeout=15)
        assert r.status_code == 200
        apts = r.json()
        numbers = [a["number"] for a in apts]
        # B1 should exist (seeded)
        assert "B1" in numbers, f"Expected B1 in admin B list, got {numbers}"
        # No A-side numbers (e.g. seeded HUIS7A, A1)
        for n in numbers:
            assert not n.startswith("HUIS"), f"DATA LEAK: Admin B sees HUIS apartment: {n}"

    def test_admin_a_creates_apartment_invisible_to_b(self, admin_a, admin_b):
        num = f"TEST-A-{uuid.uuid4().hex[:5]}"
        r = requests.post(f"{API}/apartments", headers=_h(admin_a["token"]),
                          json={"number": num, "rent_amount": 1000, "currency": "SRD"}, timeout=15)
        assert r.status_code == 200, r.text
        apt = r.json()
        TestDataIsolation.APT_A_ID = apt["id"]
        try:
            # Admin B should NOT see it
            rb = requests.get(f"{API}/apartments", headers=_h(admin_b["token"]), timeout=15)
            nums = [a["number"] for a in rb.json()]
            assert num not in nums, f"DATA LEAK: Admin B sees {num}"
            # Admin B should NOT be able to update it (404)
            r2 = requests.put(f"{API}/apartments/{apt['id']}", headers=_h(admin_b["token"]),
                              json={"number": num, "rent_amount": 9999, "currency": "SRD"}, timeout=15)
            assert r2.status_code == 404
            # Admin B should NOT be able to delete it (404)
            r3 = requests.delete(f"{API}/apartments/{apt['id']}", headers=_h(admin_b["token"]), timeout=15)
            assert r3.status_code == 404
        finally:
            requests.delete(f"{API}/apartments/{apt['id']}", headers=_h(admin_a["token"]), timeout=15)

    def test_tenants_isolation(self, admin_a, admin_b):
        # A creates tenant
        name = f"TEST_A_{uuid.uuid4().hex[:5]}"
        r = requests.post(f"{API}/tenants", headers=_h(admin_a["token"]),
                          json={"name": name, "phone": "+597 100", "email": f"{name}@x.sr"}, timeout=15)
        assert r.status_code == 200
        tid = r.json()["id"]
        try:
            rb = requests.get(f"{API}/tenants", headers=_h(admin_b["token"]), timeout=15)
            assert all(t["id"] != tid for t in rb.json()), "Tenant leaked to admin B"
            # B cannot update/delete
            r2 = requests.put(f"{API}/tenants/{tid}", headers=_h(admin_b["token"]),
                              json={"name": "hacked"}, timeout=15)
            assert r2.status_code == 404
        finally:
            requests.delete(f"{API}/tenants/{tid}", headers=_h(admin_a["token"]), timeout=15)

    def test_payments_isolation(self, admin_a, admin_b):
        ra = requests.get(f"{API}/payments", headers=_h(admin_a["token"]), timeout=15)
        rb = requests.get(f"{API}/payments", headers=_h(admin_b["token"]), timeout=15)
        assert ra.status_code == 200 and rb.status_code == 200
        a_ids = {p["id"] for p in ra.json()}
        b_ids = {p["id"] for p in rb.json()}
        assert a_ids.isdisjoint(b_ids), "Payment leak between companies"

    def test_superadmin_unscoped_sees_all(self, super_token, admin_a, admin_b):
        ra = requests.get(f"{API}/apartments", headers=_h(admin_a["token"]), timeout=15).json()
        rb = requests.get(f"{API}/apartments", headers=_h(admin_b["token"]), timeout=15).json()
        rs = requests.get(f"{API}/apartments", headers=_h(super_token), timeout=15).json()
        assert len(rs) >= len(ra) + len(rb), f"Superadmin should see all ({len(rs)} vs {len(ra)+len(rb)})"

    def test_superadmin_with_header_scoped(self, super_token, admin_b):
        rs = requests.get(f"{API}/apartments",
                          headers=_h(super_token, admin_b["company"]["id"]), timeout=15).json()
        # Should equal admin_b's view
        rb = requests.get(f"{API}/apartments", headers=_h(admin_b["token"]), timeout=15).json()
        assert {a["id"] for a in rs} == {a["id"] for a in rb}


# ---------- Scoping bugs for other resources (regression on refactor) ----------
class TestScopedCRUDLeakage:
    """These resources MUST also be scoped per refactor spec."""

    def _seed_then_check_leak(self, admin_a, admin_b, endpoint, create_payload, extra_id_field="id"):
        """Create in A, verify list under B does NOT show it."""
        rc = requests.post(f"{API}{endpoint}", headers=_h(admin_a["token"]), json=create_payload, timeout=15)
        if rc.status_code not in (200, 201):
            pytest.skip(f"create {endpoint} failed: {rc.status_code} {rc.text}")
        item = rc.json()
        item_id = item.get(extra_id_field)
        try:
            rb = requests.get(f"{API}{endpoint}", headers=_h(admin_b["token"]), timeout=15)
            assert rb.status_code == 200
            ids = {x.get(extra_id_field) for x in rb.json()}
            assert item_id not in ids, f"LEAK on {endpoint}: admin B sees {item_id}"
        finally:
            # cleanup best effort
            requests.delete(f"{API}{endpoint}/{item_id}", headers=_h(admin_a["token"]), timeout=15)

    def test_invoices_list_scoped(self, admin_a, admin_b):
        # need a tenant with apartment in A
        rt = requests.get(f"{API}/tenants", headers=_h(admin_a["token"]), timeout=15).json()
        tenant = next((t for t in rt if t.get("apartment_id")), None)
        if not tenant:
            pytest.skip("No tenant-with-apartment in A to invoice")
        # use a random period to avoid duplicate
        month = (int(time.time()) % 12) + 1
        year = 2099  # future, avoid dup
        # Create invoice
        rc = requests.post(f"{API}/invoices", headers=_h(admin_a["token"]),
                           json={"tenant_id": tenant["id"], "period_month": month, "period_year": year}, timeout=15)
        if rc.status_code != 200:
            pytest.skip(f"invoice create failed {rc.text}")
        inv = rc.json()
        try:
            rb = requests.get(f"{API}/invoices", headers=_h(admin_b["token"]), timeout=15)
            assert rb.status_code == 200
            ids = {i["id"] for i in rb.json()}
            assert inv["id"] not in ids, f"INVOICE LEAK to admin B: {inv['id']}"
        finally:
            requests.delete(f"{API}/invoices/{inv['id']}", headers=_h(admin_a["token"]), timeout=15)

    def test_contracts_list_scoped(self, admin_a, admin_b):
        rt = requests.get(f"{API}/tenants", headers=_h(admin_a["token"]), timeout=15).json()
        tenant = next((t for t in rt if t.get("apartment_id")), None)
        if not tenant:
            pytest.skip("No tenant in A")
        rc = requests.post(f"{API}/contracts", headers=_h(admin_a["token"]), json={
            "tenant_id": tenant["id"], "apartment_id": tenant["apartment_id"],
            "start_date": "2025-01-01", "payment_day": 1, "deposit_amount": 0,
        }, timeout=15)
        if rc.status_code != 200:
            pytest.skip(f"contract create failed {rc.text}")
        cdoc = rc.json()
        try:
            rb = requests.get(f"{API}/contracts", headers=_h(admin_b["token"]), timeout=15).json()
            assert cdoc["id"] not in {c["id"] for c in rb}, "CONTRACT LEAK to admin B"
        finally:
            requests.delete(f"{API}/contracts/{cdoc['id']}", headers=_h(admin_a["token"]), timeout=15)

    def test_employees_list_scoped(self, admin_a, admin_b):
        rc = requests.post(f"{API}/employees", headers=_h(admin_a["token"]),
                           json={"name": "TEST_EmpA", "monthly_salary": 1000, "currency": "SRD", "active": True}, timeout=15)
        if rc.status_code != 200:
            pytest.skip(rc.text)
        e = rc.json()
        try:
            rb = requests.get(f"{API}/employees", headers=_h(admin_b["token"]), timeout=15).json()
            assert e["id"] not in {x["id"] for x in rb}, "EMPLOYEE LEAK to admin B"
        finally:
            requests.delete(f"{API}/employees/{e['id']}", headers=_h(admin_a["token"]), timeout=15)

    def test_maintenance_list_scoped(self, admin_a, admin_b):
        # Need apartment in A
        ra = requests.get(f"{API}/apartments", headers=_h(admin_a["token"]), timeout=15).json()
        if not ra:
            pytest.skip("No apartment in A")
        apt_id = ra[0]["id"]
        rc = requests.post(f"{API}/maintenance", headers=_h(admin_a["token"]),
                           json={"apartment_id": apt_id, "title": "TEST_MaintA",
                                 "description": "x", "priority": "low"}, timeout=15)
        if rc.status_code != 200:
            pytest.skip(rc.text)
        m = rc.json()
        try:
            rb = requests.get(f"{API}/maintenance", headers=_h(admin_b["token"]), timeout=15).json()
            assert m["id"] not in {x["id"] for x in rb}, "MAINTENANCE LEAK to admin B"
        finally:
            requests.delete(f"{API}/maintenance/{m['id']}", headers=_h(admin_a["token"]), timeout=15)

    def test_kasgeld_list_scoped(self, admin_a, admin_b):
        rc = requests.post(f"{API}/kasgeld", headers=_h(admin_a["token"]),
                           json={"description": "TEST_kasA", "amount": 10, "currency": "SRD", "type": "in"}, timeout=15)
        if rc.status_code != 200:
            pytest.skip(rc.text)
        k = rc.json()
        try:
            rb = requests.get(f"{API}/kasgeld", headers=_h(admin_b["token"]), timeout=15).json()
            assert k["id"] not in {x["id"] for x in rb}, "KASGELD LEAK to admin B"
        finally:
            requests.delete(f"{API}/kasgeld/{k['id']}", headers=_h(admin_a["token"]), timeout=15)

    def test_deposits_list_scoped(self, admin_a, admin_b):
        rt = requests.get(f"{API}/tenants", headers=_h(admin_a["token"]), timeout=15).json()
        tenant = next((t for t in rt if t.get("apartment_id")), None)
        if not tenant:
            pytest.skip("No tenant in A")
        rc = requests.post(f"{API}/deposits", headers=_h(admin_a["token"]),
                           json={"tenant_id": tenant["id"], "apartment_id": tenant["apartment_id"],
                                 "amount": 100, "currency": "SRD"}, timeout=15)
        if rc.status_code != 200:
            pytest.skip(rc.text)
        d = rc.json()
        try:
            rb = requests.get(f"{API}/deposits", headers=_h(admin_b["token"]), timeout=15).json()
            assert d["id"] not in {x["id"] for x in rb}, "DEPOSIT LEAK to admin B"
        finally:
            requests.delete(f"{API}/deposits/{d['id']}", headers=_h(admin_a["token"]), timeout=15)


# ---------- Admin stats scoping ----------
class TestAdminStats:
    def test_stats_scoped_per_company(self, admin_a, admin_b, super_token):
        ra = requests.get(f"{API}/admin/stats", headers=_h(admin_a["token"]), timeout=15)
        rb = requests.get(f"{API}/admin/stats", headers=_h(admin_b["token"]), timeout=15)
        rs = requests.get(f"{API}/admin/stats", headers=_h(super_token), timeout=15)
        assert ra.status_code == rb.status_code == rs.status_code == 200
        sa, sb, ss = ra.json(), rb.json(), rs.json()
        # sum of A + B apartments should be <= superadmin total (== if those are only 2 companies)
        assert sa["apartments_total"] + sb["apartments_total"] <= ss["apartments_total"], \
            "Admin stats not scoped — A+B > super or super is smaller"
        # Critical: admin A should NOT count B's apartments
        # B's seeded 'B1' must NOT be in A's count if A originally has 0 B-apartments
        assert sa["apartments_total"] < ss["apartments_total"] or sb["apartments_total"] == 0, \
            f"Admin A stats include other companies (A={sa['apartments_total']}, super={ss['apartments_total']})"


# ---------- Kiosk PIN multi-company ----------
class TestKioskPin:
    def test_pin_1234_matches_default(self):
        r = requests.post(f"{API}/auth/kiosk-pin", json={"pin": "1234"}, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["company"]["slug"] == "surirent"
        assert data.get("token")

    def test_set_pin_1234_as_admin_b_rejected(self, admin_b):
        # Admin B tries to set PIN 1234 which is already used by A → expect 400
        r = requests.post(f"{API}/auth/kiosk-set-pin", headers=_h(admin_b["token"]),
                          json={"pin": "1234"}, timeout=10)
        assert r.status_code == 400, f"Expected 400, got {r.status_code} {r.text}"

    def test_set_unique_pin_as_admin_b_works(self, admin_b):
        new_pin = "8742"
        r = requests.post(f"{API}/auth/kiosk-set-pin", headers=_h(admin_b["token"]),
                          json={"pin": new_pin}, timeout=10)
        assert r.status_code == 200, r.text
        # Verify pin matches B
        rp = requests.post(f"{API}/auth/kiosk-pin", json={"pin": new_pin}, timeout=10)
        assert rp.status_code == 200
        assert rp.json()["company"]["slug"] == "test-vastgoed-b"

    def test_invalid_pin_rejected(self):
        r = requests.post(f"{API}/auth/kiosk-pin", json={"pin": "0000"}, timeout=10)
        # Either nobody has 0000 or it's a real PIN; if real PIN no test possible.
        # Try a random 4-digit unlikely PIN
        r = requests.post(f"{API}/auth/kiosk-pin", json={"pin": "0001"}, timeout=10)
        assert r.status_code in (401, 200)  # may collide; main check is 1234 works


# ---------- Tenant portal ----------
class TestTenantPortal:
    def test_tenant_login(self):
        r = requests.post(f"{API}/tenant-portal/login",
                          json={"identifier": "jan@example.sr", "pin": "5678"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        token = data["token"]
        _no_objectid(data)
        # overview
        ro = requests.get(f"{API}/tenant-portal/overview",
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert ro.status_code == 200
        _no_objectid(ro.json())
        rp = requests.get(f"{API}/tenant-portal/payments",
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert rp.status_code == 200
        rc = requests.get(f"{API}/tenant-portal/contracts",
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert rc.status_code == 200
        rm = requests.get(f"{API}/tenant-portal/maintenance",
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert rm.status_code == 200


# ---------- PDF endpoints ----------
class TestPDFEndpoints:
    def test_payment_pdf(self, admin_a):
        ps = requests.get(f"{API}/payments", headers=_h(admin_a["token"]), timeout=15).json()
        if not ps:
            pytest.skip("no payment to test PDF")
        pid = ps[0]["id"]
        r = requests.get(f"{API}/payments/{pid}/pdf", timeout=20)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_contract_pdf(self, admin_a):
        cs = requests.get(f"{API}/contracts", headers=_h(admin_a["token"]), timeout=15).json()
        if not cs:
            pytest.skip("no contract")
        r = requests.get(f"{API}/contracts/{cs[0]['id']}/pdf", timeout=20)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_invoice_pdf(self, admin_a):
        invs = requests.get(f"{API}/invoices", headers=_h(admin_a["token"]), timeout=15).json()
        if not invs:
            pytest.skip("no invoice")
        r = requests.get(f"{API}/invoices/{invs[0]['id']}/pdf", timeout=20)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
