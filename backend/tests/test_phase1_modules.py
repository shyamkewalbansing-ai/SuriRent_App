"""Phase 1 backend tests: contracts (+ signing), invoices (+ generate-month), employees,
salaries, deposits (+ refund), maintenance, kasgeld, payment PDF receipt.
"""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@vastgoed.sr"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_headers(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def seeded_apt_tenant(session, admin_headers):
    """Create dedicated TEST apt+tenant for phase-1 tests, cleaned up at end."""
    apt_p = {"number": f"TEST-PH1-{uuid.uuid4().hex[:5]}", "address": "Phase1", "rent_amount": 1000.0, "currency": "SRD"}
    apt = session.post(f"{API}/apartments", json=apt_p, headers=admin_headers).json()
    ten = session.post(f"{API}/tenants", json={"name": f"TEST_PH1_{uuid.uuid4().hex[:5]}", "phone": "999"},
                       headers=admin_headers).json()
    session.post(f"{API}/apartments/{apt['id']}/assign-tenant",
                 json={"tenant_id": ten["id"]}, headers=admin_headers)
    yield {"apt_id": apt["id"], "tenant_id": ten["id"]}
    # cleanup
    session.delete(f"{API}/tenants/{ten['id']}", headers=admin_headers)
    session.delete(f"{API}/apartments/{apt['id']}", headers=admin_headers)


# -------------------- CONTRACTS + SIGN --------------------
class TestContracts:
    def test_contract_crud_and_sign_flow(self, session, admin_headers, seeded_apt_tenant):
        body = {
            "tenant_id": seeded_apt_tenant["tenant_id"],
            "apartment_id": seeded_apt_tenant["apt_id"],
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "payment_day": 1,
            "deposit_amount": 1000.0,
        }
        r = session.post(f"{API}/contracts", json=body, headers=admin_headers)
        assert r.status_code == 200, r.text
        c = r.json()
        assert re.match(r"^HC\d{4}-\d{4}$", c["contract_number"]), c["contract_number"]
        assert c["status"] == "draft"
        assert c["sign_token"] and len(c["sign_token"]) > 10
        cid = c["id"]
        token = c["sign_token"]

        # List
        r = session.get(f"{API}/contracts", headers=admin_headers)
        assert r.status_code == 200
        assert any(x["id"] == cid for x in r.json())

        # PDF (public)
        r = requests.get(f"{API}/contracts/{cid}/pdf")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert len(r.content) > 500

        # Sign info (public)
        r = requests.get(f"{API}/contracts/sign/{token}")
        assert r.status_code == 200
        info = r.json()
        assert info["contract"]["id"] == cid
        assert info["already_signed"] is False

        # Sign it
        r = requests.post(f"{API}/contracts/sign/{token}", json={"signed_by": "Jan Tester", "accept": True})
        assert r.status_code == 200, r.text
        signed = r.json()
        assert signed["status"] == "active"
        assert signed["signed_at"]
        assert signed["signed_by"] == "Jan Tester"

        # Double sign -> 400
        r = requests.post(f"{API}/contracts/sign/{token}", json={"signed_by": "Jan Tester", "accept": True})
        assert r.status_code == 400

        # Delete
        r = session.delete(f"{API}/contracts/{cid}", headers=admin_headers)
        assert r.status_code == 200


# -------------------- INVOICES --------------------
class TestInvoices:
    def test_invoice_crud_and_pdf(self, session, admin_headers, seeded_apt_tenant):
        period = {"period_month": 6, "period_year": 2027}  # future to avoid generate-month dupes
        body = {"tenant_id": seeded_apt_tenant["tenant_id"], **period}
        r = session.post(f"{API}/invoices", json=body, headers=admin_headers)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert re.match(r"^F\d{4}-\d{5}$", inv["invoice_number"]), inv["invoice_number"]
        assert inv["status"] == "open"
        iid = inv["id"]

        # Duplicate -> 400
        r = session.post(f"{API}/invoices", json=body, headers=admin_headers)
        assert r.status_code == 400

        # PDF
        r = requests.get(f"{API}/invoices/{iid}/pdf")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")

        # List
        r = session.get(f"{API}/invoices", headers=admin_headers)
        assert any(x["id"] == iid for x in r.json())

        # Delete
        r = session.delete(f"{API}/invoices/{iid}", headers=admin_headers)
        assert r.status_code == 200

    def test_generate_month(self, session, admin_headers, seeded_apt_tenant):
        body = {"period_month": 7, "period_year": 2027}
        r = session.post(f"{API}/invoices/generate-month", json=body, headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "created" in d and "skipped" in d
        assert d["created"] >= 1  # our seeded tenant should be invoiced
        # Re-run: now skipped
        r = session.post(f"{API}/invoices/generate-month", json=body, headers=admin_headers)
        d2 = r.json()
        assert d2["created"] == 0
        assert d2["skipped"] >= 1
        # Cleanup invoices in this period
        invs = session.get(f"{API}/invoices", headers=admin_headers).json()
        for i in invs:
            if i["period_month"] == 7 and i["period_year"] == 2027:
                session.delete(f"{API}/invoices/{i['id']}", headers=admin_headers)


# -------------------- EMPLOYEES + SALARIES --------------------
class TestEmployeesSalaries:
    def test_employee_crud(self, session, admin_headers):
        e = {"name": f"TEST_EMP_{uuid.uuid4().hex[:5]}", "role": "Schoonmaak",
             "monthly_salary": 2500.0, "currency": "SRD"}
        r = session.post(f"{API}/employees", json=e, headers=admin_headers)
        assert r.status_code == 200
        emp = r.json()
        eid = emp["id"]
        # PUT
        e2 = {**e, "monthly_salary": 2800.0}
        r = session.put(f"{API}/employees/{eid}", json=e2, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["monthly_salary"] == 2800.0
        # Salary - net = gross - advance - deductions
        s = {"employee_id": eid, "gross": 2800, "advance": 300, "deductions": 100,
             "currency": "SRD", "period_month": 1, "period_year": 2026}
        r = session.post(f"{API}/salaries", json=s, headers=admin_headers)
        assert r.status_code == 200, r.text
        sal = r.json()
        assert sal["net"] == 2400
        sid = sal["id"]
        # PDF
        r = requests.get(f"{API}/salaries/{sid}/pdf")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        # Cleanup
        session.delete(f"{API}/salaries/{sid}", headers=admin_headers)
        session.delete(f"{API}/employees/{eid}", headers=admin_headers)


# -------------------- DEPOSITS --------------------
class TestDeposits:
    def test_deposit_refund_flow(self, session, admin_headers, seeded_apt_tenant):
        r = session.post(f"{API}/deposits",
                         json={"tenant_id": seeded_apt_tenant["tenant_id"], "amount": 1000.0, "currency": "SRD"},
                         headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "held"
        did = d["id"]
        # Refund with deduction
        r = session.post(f"{API}/deposits/{did}/refund",
                         json={"deduction": 150.0, "refund_note": "schade"},
                         headers=admin_headers)
        assert r.status_code == 200
        ref = r.json()
        assert ref["status"] == "refunded"
        assert ref["refund_amount"] == 850.0
        # Double refund -> 400
        r = session.post(f"{API}/deposits/{did}/refund", json={"deduction": 0}, headers=admin_headers)
        assert r.status_code == 400
        # Refund PDF
        r = requests.get(f"{API}/deposits/{did}/refund-pdf")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        # Cleanup
        session.delete(f"{API}/deposits/{did}", headers=admin_headers)


# -------------------- MAINTENANCE --------------------
class TestMaintenance:
    def test_maintenance_status_flow(self, session, admin_headers, seeded_apt_tenant):
        body = {"apartment_id": seeded_apt_tenant["apt_id"], "title": "TEST kapot",
                "priority": "high"}
        r = session.post(f"{API}/maintenance", json=body, headers=admin_headers)
        assert r.status_code == 200
        m = r.json()
        assert m["status"] == "open"
        mid = m["id"]
        # in_progress
        r = session.post(f"{API}/maintenance/{mid}/status",
                         json={"status": "in_progress"}, headers=admin_headers)
        assert r.status_code == 200 and r.json()["status"] == "in_progress"
        # done -> resolved_at set
        r = session.post(f"{API}/maintenance/{mid}/status",
                         json={"status": "done"}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "done" and r.json()["resolved_at"]
        # delete
        session.delete(f"{API}/maintenance/{mid}", headers=admin_headers)


# -------------------- KASGELD --------------------
class TestKasgeld:
    def test_cash_flow_and_balance(self, session, admin_headers):
        # Baseline balance
        bal0 = session.get(f"{API}/kasgeld/balance", headers=admin_headers).json()
        srd0 = bal0.get("SRD", 0)
        # IN
        r = session.post(f"{API}/kasgeld",
                         json={"type": "in", "amount": 500.0, "currency": "SRD",
                               "description": "TEST in"}, headers=admin_headers)
        assert r.status_code == 200
        ie_id = r.json()["id"]
        # OUT
        r = session.post(f"{API}/kasgeld",
                         json={"type": "out", "amount": 200.0, "currency": "SRD",
                               "description": "TEST out"}, headers=admin_headers)
        assert r.status_code == 200
        oe_id = r.json()["id"]
        # Balance after
        bal1 = session.get(f"{API}/kasgeld/balance", headers=admin_headers).json()
        assert bal1["SRD"] == srd0 + 300.0
        # Cleanup
        session.delete(f"{API}/kasgeld/{ie_id}", headers=admin_headers)
        session.delete(f"{API}/kasgeld/{oe_id}", headers=admin_headers)


# -------------------- PAYMENT PDF --------------------
class TestPaymentPDF:
    def test_payment_pdf_public(self, session, admin_headers, seeded_apt_tenant):
        body = {"tenant_id": seeded_apt_tenant["tenant_id"],
                "apartment_id": seeded_apt_tenant["apt_id"],
                "amount": 100.0, "currency": "SRD", "method": "contant", "category": "huur"}
        r = session.post(f"{API}/payments", json=body, headers=admin_headers)
        assert r.status_code == 200
        pid = r.json()["id"]
        # PDF (public - no auth)
        r = requests.get(f"{API}/payments/{pid}/pdf")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert len(r.content) > 500
