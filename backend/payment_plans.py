"""Payment Plans (Betalingsregelingen) — admin creates a multi-installment
plan for a tenant who has overdue invoices, tenant pays per termijn via
operator kiosk or huurder kiosk. We register this as a separate FastAPI
router and mount it from server.py.

Data model:
  payment_plans:
    id, company_id, tenant_id, tenant_name (snapshot),
    invoice_ids[], total_amount, currency,
    notes, status: 'active'|'completed'|'cancelled',
    created_by, created_at, completed_at, cancelled_at

  payment_plan_installments:
    id, plan_id, sequence (1-based), due_date (yyyy-mm-dd), amount,
    status: 'pending'|'paid'|'cancelled', paid_at, payment_id

Termijn-betaling registreert een normale Payment doc met category=
'betalingsregeling' + metadata.plan_id + metadata.installment_seq.
"""
from typing import List, Optional, Literal
from datetime import datetime, date as date_t, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


def make_router(db, helpers):
    """Return APIRouter wired to a Motor DB + helper functions imported
    from server.py. We pass helpers as a dict so we don't depend on
    circular imports.
    """
    new_id = helpers["new_id"]
    iso = helpers["iso"]
    now_utc = helpers["now_utc"]
    scope = helpers["scope"]
    company_id_of = helpers["company_id_of"]
    get_current_user = helpers["get_current_user"]
    require_role = helpers["require_role"]

    router = APIRouter(prefix="/payment-plans", tags=["payment-plans"])

    # ---------- Pydantic schemas ----------
    class InstallmentIn(BaseModel):
        sequence: int = Field(ge=1)
        due_date: str  # yyyy-mm-dd
        amount: float = Field(gt=0)

    class PlanCreateIn(BaseModel):
        tenant_id: str
        invoice_ids: List[str] = Field(default_factory=list)
        total_amount: float = Field(gt=0)
        currency: str
        notes: Optional[str] = ""
        # Generator: óf installments expliciet meegeven (custom dates) óf
        # num_installments + start_date + frequency='monthly' (automatisch).
        installments: Optional[List[InstallmentIn]] = None
        num_installments: Optional[int] = None
        start_date: Optional[str] = None  # yyyy-mm-dd
        frequency: Optional[Literal["monthly", "custom"]] = "monthly"

    class InstallmentOut(BaseModel):
        sequence: int
        due_date: str
        amount: float
        status: str
        paid_at: Optional[str] = None
        payment_id: Optional[str] = None

    class PlanOut(BaseModel):
        id: str
        tenant_id: str
        tenant_name: Optional[str] = ""
        apartment_number: Optional[str] = ""
        invoice_ids: List[str] = []
        total_amount: float
        paid_amount: float = 0
        remaining_amount: float = 0
        currency: str
        status: str
        notes: Optional[str] = ""
        created_at: str
        completed_at: Optional[str] = None
        cancelled_at: Optional[str] = None
        installments: List[InstallmentOut] = []
        # Quick computed flags
        next_due_date: Optional[str] = None
        next_due_amount: Optional[float] = None
        overdue_count: int = 0

    class PaidIn(BaseModel):
        method: Literal["contant", "mope", "uni5pay"] = "contant"
        note: Optional[str] = ""
        # Bedrag is optioneel — als leeg gebruiken we het installment-bedrag.
        amount: Optional[float] = None

    # ---------- Helpers ----------
    def _add_months(d: date_t, months: int) -> date_t:
        # Eenvoudige maand-optelling met clip naar 28/29/30 wanneer doel
        # maand minder dagen heeft.
        y = d.year + (d.month - 1 + months) // 12
        m = (d.month - 1 + months) % 12 + 1
        last_day = [31, 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28,
                    31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
        day = min(d.day, last_day)
        return date_t(y, m, day)

    def _round2(x: float) -> float:
        return round(float(x) + 1e-9, 2)

    async def _enrich_plan(plan: dict) -> dict:
        # tenant + apartment naam ophalen voor UI gemak.
        tenant_name = plan.get("tenant_name") or ""
        apt_number = plan.get("apartment_number") or ""
        if plan.get("tenant_id") and not tenant_name:
            t = await db.tenants.find_one({"id": plan["tenant_id"]}, {"_id": 0, "name": 1, "apartment_id": 1})
            if t:
                tenant_name = t.get("name") or ""
                if t.get("apartment_id"):
                    a = await db.apartments.find_one({"id": t["apartment_id"]}, {"_id": 0, "number": 1})
                    if a:
                        apt_number = a.get("number") or ""
        installments = []
        async for inst in db.payment_plan_installments.find(
            {"plan_id": plan["id"]}, {"_id": 0}
        ).sort("sequence", 1):
            installments.append({
                "sequence": inst.get("sequence"),
                "due_date": inst.get("due_date"),
                "amount": _round2(inst.get("amount", 0)),
                "status": inst.get("status", "pending"),
                "paid_at": inst.get("paid_at"),
                "payment_id": inst.get("payment_id"),
            })
        paid_amount = sum(i["amount"] for i in installments if i["status"] == "paid")
        remaining = _round2(plan.get("total_amount", 0) - paid_amount)
        # Next due + overdue count
        today = now_utc().date().isoformat()
        next_due = None
        next_due_amt = None
        overdue_count = 0
        for i in installments:
            if i["status"] != "pending":
                continue
            if i["due_date"] < today:
                overdue_count += 1
            if next_due is None:
                next_due = i["due_date"]
                next_due_amt = i["amount"]
        return {
            "id": plan["id"],
            "tenant_id": plan["tenant_id"],
            "tenant_name": tenant_name,
            "apartment_number": apt_number,
            "invoice_ids": plan.get("invoice_ids") or [],
            "total_amount": _round2(plan.get("total_amount", 0)),
            "paid_amount": _round2(paid_amount),
            "remaining_amount": remaining,
            "currency": plan.get("currency", "SRD"),
            "status": plan.get("status", "active"),
            "notes": plan.get("notes") or "",
            "created_at": plan.get("created_at"),
            "completed_at": plan.get("completed_at"),
            "cancelled_at": plan.get("cancelled_at"),
            "installments": installments,
            "next_due_date": next_due,
            "next_due_amount": next_due_amt,
            "overdue_count": overdue_count,
        }

    # ---------- Endpoints ----------
    @router.post("", response_model=PlanOut)
    async def create_plan(body: PlanCreateIn, user=Depends(require_role("admin"))):
        cid = company_id_of(user)
        if not cid:
            raise HTTPException(status_code=400, detail="Geen bedrijfscontext")

        # Tenant validate
        tenant = await db.tenants.find_one({"id": body.tenant_id, "company_id": cid}, {"_id": 0})
        if not tenant:
            raise HTTPException(status_code=404, detail="Huurder niet gevonden")

        # Build installments
        installments: list = []
        if body.installments:
            # Custom — gebruiker bepaalt zelf data + bedragen
            for it in sorted(body.installments, key=lambda x: x.sequence):
                installments.append({
                    "sequence": it.sequence,
                    "due_date": it.due_date,
                    "amount": _round2(it.amount),
                    "status": "pending",
                })
        else:
            n = int(body.num_installments or 0)
            if n < 2:
                raise HTTPException(status_code=400, detail="Minimaal 2 termijnen of geef installments mee")
            start = body.start_date or now_utc().date().isoformat()
            try:
                start_d = date_t.fromisoformat(start)
            except ValueError:
                raise HTTPException(status_code=400, detail="Ongeldige startdatum (yyyy-mm-dd)")
            per = _round2(body.total_amount / n)
            # Laatste termijn vangt eventueel afrondingsverschil op
            running = 0.0
            for i in range(n):
                due = _add_months(start_d, i) if body.frequency == "monthly" else start_d + timedelta(days=30 * i)
                amt = per if i < n - 1 else _round2(body.total_amount - running)
                running += per
                installments.append({
                    "sequence": i + 1,
                    "due_date": due.isoformat(),
                    "amount": amt,
                    "status": "pending",
                })

        # Bedragen-totaal validate
        total_inst = _round2(sum(i["amount"] for i in installments))
        if abs(total_inst - _round2(body.total_amount)) > 0.05:
            raise HTTPException(status_code=400, detail=f"Som van termijnen ({total_inst}) komt niet overeen met totaal ({body.total_amount})")

        plan_id = new_id()
        now_iso = iso(now_utc())
        plan_doc = {
            "id": plan_id,
            "company_id": cid,
            "tenant_id": body.tenant_id,
            "tenant_name": tenant.get("name") or "",
            "invoice_ids": body.invoice_ids,
            "total_amount": _round2(body.total_amount),
            "currency": body.currency,
            "notes": body.notes or "",
            "status": "active",
            "created_by": user.get("id"),
            "created_at": now_iso,
        }
        await db.payment_plans.insert_one({**plan_doc})
        # Installments
        for it in installments:
            await db.payment_plan_installments.insert_one({
                "id": new_id(),
                "plan_id": plan_id,
                "company_id": cid,
                **it,
            })

        return await _enrich_plan(plan_doc)

    @router.get("", response_model=List[PlanOut])
    async def list_plans(status: Optional[str] = None, tenant_id: Optional[str] = None,
                         user=Depends(get_current_user)):
        q = {**scope(user)}
        if status:
            q["status"] = status
        if tenant_id:
            q["tenant_id"] = tenant_id
        out = []
        async for p in db.payment_plans.find(q, {"_id": 0}).sort("created_at", -1):
            out.append(await _enrich_plan(p))
        return out

    @router.get("/{plan_id}", response_model=PlanOut)
    async def get_plan(plan_id: str, user=Depends(get_current_user)):
        p = await db.payment_plans.find_one({"id": plan_id, **scope(user)}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Regeling niet gevonden")
        return await _enrich_plan(p)

    @router.post("/{plan_id}/cancel", response_model=PlanOut)
    async def cancel_plan(plan_id: str, user=Depends(require_role("admin"))):
        p = await db.payment_plans.find_one({"id": plan_id, **scope(user)}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Regeling niet gevonden")
        if p.get("status") != "active":
            raise HTTPException(status_code=400, detail="Regeling is niet actief")
        await db.payment_plans.update_one(
            {"id": plan_id}, {"$set": {"status": "cancelled", "cancelled_at": iso(now_utc())}}
        )
        # Bestaande PENDING termijnen markeren als cancelled
        await db.payment_plan_installments.update_many(
            {"plan_id": plan_id, "status": "pending"},
            {"$set": {"status": "cancelled"}},
        )
        p = await db.payment_plans.find_one({"id": plan_id}, {"_id": 0})
        return await _enrich_plan(p)

    # Stand-alone core (gedeeld met tenant-portal & kiosk via server.py)
    core = _build_pay_core(db, helpers)
    _enrich_plan = core["enrich_plan"]  # noqa: F811 — vervangt lokaal _enrich_plan

    @router.post("/{plan_id}/installments/{seq}/pay", response_model=PlanOut)
    async def pay_installment(plan_id: str, seq: int, body: PaidIn,
                              user=Depends(require_role("admin"))):
        plan = await db.payment_plans.find_one({"id": plan_id, **scope(user)}, {"_id": 0})
        if not plan:
            raise HTTPException(status_code=404, detail="Regeling niet gevonden")
        return await core["pay_installment_for"](
            plan, seq,
            method=body.method, amount=body.amount, note=body.note or "",
            received_by=user.get("name") or "",
            approved_by_label=user.get("name") or "",
            status="approved",
        )

    return router


def _build_pay_core(db, helpers):
    """Stand-alone helper builder — returned by `make_payment_plan_helpers`
    zodat server.py een gedeelde core kan hergebruiken voor tenant-portal en
    kiosk endpoints zonder dat we de admin-route deps verstoren.
    """
    new_id = helpers["new_id"]
    iso = helpers["iso"]
    now_utc = helpers["now_utc"]
    next_receipt_number = helpers["next_receipt_number"]

    def _round2(x): return round(float(x) + 1e-9, 2)

    async def enrich_plan(plan: dict) -> dict:
        tenant_name = plan.get("tenant_name") or ""
        apt_number = ""
        t = await db.tenants.find_one(
            {"id": plan.get("tenant_id")}, {"_id": 0, "name": 1, "apartment_id": 1}
        ) if plan.get("tenant_id") else None
        if t:
            tenant_name = tenant_name or (t.get("name") or "")
            if t.get("apartment_id"):
                a = await db.apartments.find_one({"id": t["apartment_id"]}, {"_id": 0, "number": 1})
                if a:
                    apt_number = a.get("number") or ""
        installments = []
        async for inst in db.payment_plan_installments.find(
            {"plan_id": plan["id"]}, {"_id": 0}
        ).sort("sequence", 1):
            installments.append({
                "sequence": inst.get("sequence"),
                "due_date": inst.get("due_date"),
                "amount": _round2(inst.get("amount", 0)),
                "status": inst.get("status", "pending"),
                "paid_at": inst.get("paid_at"),
                "payment_id": inst.get("payment_id"),
            })
        paid_amount = sum(i["amount"] for i in installments if i["status"] == "paid")
        remaining = _round2(plan.get("total_amount", 0) - paid_amount)
        today = now_utc().date().isoformat()
        next_due, next_due_amt, overdue_count = None, None, 0
        for i in installments:
            if i["status"] != "pending":
                continue
            if i["due_date"] < today:
                overdue_count += 1
            if next_due is None:
                next_due = i["due_date"]
                next_due_amt = i["amount"]
        return {
            "id": plan["id"],
            "tenant_id": plan["tenant_id"],
            "tenant_name": tenant_name,
            "apartment_number": apt_number,
            "invoice_ids": plan.get("invoice_ids") or [],
            "total_amount": _round2(plan.get("total_amount", 0)),
            "paid_amount": _round2(paid_amount),
            "remaining_amount": remaining,
            "currency": plan.get("currency", "SRD"),
            "status": plan.get("status", "active"),
            "notes": plan.get("notes") or "",
            "created_at": plan.get("created_at"),
            "completed_at": plan.get("completed_at"),
            "cancelled_at": plan.get("cancelled_at"),
            "installments": installments,
            "next_due_date": next_due,
            "next_due_amount": next_due_amt,
            "overdue_count": overdue_count,
        }

    async def pay_installment_for(
        plan: dict, seq: int,
        *, method: str = "contant", amount=None, note: str = "",
        received_by: str = "", approved_by_label: str = "",
        status: str = "approved", kiosk_employee_id=None, kiosk_employee_name=None,
    ) -> dict:
        if plan.get("status") != "active":
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Regeling is niet actief")
        inst = await db.payment_plan_installments.find_one(
            {"plan_id": plan["id"], "sequence": seq}, {"_id": 0}
        )
        if not inst:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Termijn niet gevonden")
        if inst.get("status") == "paid":
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Termijn is al betaald")

        amt = _round2(amount if amount is not None else inst["amount"])
        receipt = await next_receipt_number()
        cid = plan.get("company_id")
        company = await db.companies.find_one({"id": cid}, {"_id": 0, "name": 1}) or {}
        tenant = await db.tenants.find_one(
            {"id": plan["tenant_id"]}, {"_id": 0, "name": 1, "apartment_id": 1}
        ) or {}
        now_iso = iso(now_utc())
        payment_doc = {
            "id": new_id(),
            "company_id": cid,
            "tenant_id": plan["tenant_id"],
            "apartment_id": tenant.get("apartment_id"),
            "amount": amt,
            "currency": plan.get("currency", "SRD"),
            "category": "betalingsregeling",
            "method": method,
            "status": status,  # approved by default; kiosk-pending-flow can pass 'pending_approval'
            "paid_at": now_iso,
            "receipt_number": receipt,
            "note": (note or "") + f" — Betalingsregeling termijn {seq}/{plan['id'][:8]}",
            "approved_by": approved_by_label or company.get("name") or "Beheerder",
            "received_by": received_by or tenant.get("name") or "",
            "kiosk_employee_id": kiosk_employee_id,
            "kiosk_employee_name": kiosk_employee_name,
            "metadata": {
                "plan_id": plan["id"],
                "installment_seq": seq,
            },
        }
        await db.payments.insert_one({**payment_doc})

        # Only mark as paid when status is approved. For pending_approval we
        # still mark it as paid because the installment is tied to the
        # specific payment_id — admin's approval/decline will update both.
        await db.payment_plan_installments.update_one(
            {"plan_id": plan["id"], "sequence": seq},
            {"$set": {
                "status": "paid" if status == "approved" else "pending_payment",
                "paid_at": now_iso,
                "payment_id": payment_doc["id"],
            }},
        )

        if status == "approved":
            remaining_pending = await db.payment_plan_installments.count_documents(
                {"plan_id": plan["id"], "status": {"$in": ["pending"]}}
            )
            if remaining_pending == 0:
                await db.payment_plans.update_one(
                    {"id": plan["id"]},
                    {"$set": {"status": "completed", "completed_at": now_iso}},
                )

        p = await db.payment_plans.find_one({"id": plan["id"]}, {"_id": 0})
        return await enrich_plan(p)

    async def list_plans_for_tenant(tenant_id: str, company_id: str, status: str = "active"):
        q = {"tenant_id": tenant_id, "company_id": company_id}
        if status and status != "all":
            q["status"] = status
        out = []
        async for p in db.payment_plans.find(q, {"_id": 0}).sort("created_at", -1):
            out.append(await enrich_plan(p))
        return out

    return {
        "enrich_plan": enrich_plan,
        "pay_installment_for": pay_installment_for,
        "list_plans_for_tenant": list_plans_for_tenant,
    }
