"""Superadmin routes — SaaS-eigenaar endpoints voor multi-tenant beheer.

Eerste batch (incrementele refactor van server.py):
  GET  /superadmin/overview               — KPI dashboard data
  GET  /superadmin/online-status          — per-bedrijf live presence
  GET  /superadmin/subscription-invoices  — lijst SaaS-facturen
  POST /superadmin/subscription-invoices/{id}/mark-paid — factuur betaald
  GET  /superadmin/subscription-payments  — lijst ontvangen betalingen

Vervolg-batches kunnen dezelfde patroon volgen: overige /superadmin/*
routes uit server.py verplaatsen naar deze module.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import io

from . import _deps

router = APIRouter()


async def _superadmin(request: Request) -> dict:
    """Runtime-resolved auth dep. `_deps.get_current_user` wordt door
    server.py bij startup gevuld — daarom hier gewrapd i.p.v. direct als
    Depends() bij de route-definitie."""
    user = await _deps.get_current_user(request)
    if not user or user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Alleen superadmin")
    return user


# =====================================================================
# GET /superadmin/overview — aggregate KPI dashboard
# =====================================================================


@router.get("/superadmin/overview")
async def superadmin_overview(user: dict = Depends(_superadmin)):
    """Aggregate metrics voor het SaaS dashboard, incl. online-count,
    ontvangen inkomsten per valuta en open facturen in de lopende maand."""
    db = _deps.db
    companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
    total = len(companies)
    trial = active = expired = cancelled = online_now = 0
    mrr = 0.0
    for c in companies:
        s = _deps.billing_summary(c)
        st = s["billing_status"]
        if st == "trial":
            trial += 1
        elif st == "active":
            active += 1
            mrr += (s.get("monthly_amount") or 0)
        elif st == "expired":
            expired += 1
        elif st == "cancelled":
            cancelled += 1
        if _deps.is_online(c.get("last_seen_at")):
            online_now += 1

    paid_invoices = await db.subscription_invoices.count_documents({"status": "paid"})
    pending_ocr = await db.saas_payment_requests.count_documents({"status": "pending_approval"})
    open_invoices = await db.subscription_invoices.count_documents({"status": {"$in": ["open", "overdue"]}})
    overdue_invoices = await db.subscription_invoices.count_documents({"status": "overdue"})

    # Aggregeer ontvangen SaaS-inkomsten per valuta (Kas saldo hero).
    # Bron: `subscription_payments` — bevat alle ontvangen bedragen én
    # handmatige mutaties/refunds (positief = in, negatief = uit).
    total_received_by_currency: dict[str, float] = {}
    total_received_srd = 0.0
    async for pmt in db.subscription_payments.find({}, {"_id": 0, "amount": 1, "currency": 1}):
        cur = (pmt.get("currency") or "SRD").upper()
        amt = float(pmt.get("amount") or 0)
        total_received_by_currency[cur] = total_received_by_currency.get(cur, 0.0) + amt
        if cur == "SRD":
            total_received_srd += amt

    # Open facturen in de lopende maand — per valuta + telling.
    now = _deps.now_utc()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if month_start.month == 12:
        month_end = month_start.replace(year=month_start.year + 1, month=1)
    else:
        month_end = month_start.replace(month=month_start.month + 1)
    current_month_open_by_currency: dict[str, float] = {}
    current_month_open_count = 0
    async for iv in db.subscription_invoices.find({
        "status": {"$in": ["open", "overdue"]},
        "created_at": {"$gte": _deps.iso(month_start), "$lt": _deps.iso(month_end)},
    }, {"_id": 0, "amount": 1, "currency": 1}):
        cur = (iv.get("currency") or "SRD").upper()
        amt = float(iv.get("amount") or 0)
        current_month_open_by_currency[cur] = current_month_open_by_currency.get(cur, 0.0) + amt
        current_month_open_count += 1

    return {
        "companies_total": total,
        "trial": trial, "active": active, "expired": expired, "cancelled": cancelled,
        "online_now": online_now,
        "mrr": mrr, "currency": "SRD",
        "paid_invoices": paid_invoices,
        "open_invoices": open_invoices,
        "overdue_invoices": overdue_invoices,
        "pending_ocr": pending_ocr,
        "total_received_srd": total_received_srd,
        "total_received_by_currency": total_received_by_currency,
        "current_month_open_count": current_month_open_count,
        "current_month_open_by_currency": current_month_open_by_currency,
    }


# =====================================================================
# GET /superadmin/online-status — per-bedrijf presence widget
# =====================================================================


@router.get("/superadmin/online-status")
async def superadmin_online_status(user: dict = Depends(_superadmin)):
    """Returns per-company online status: last_seen, online (bool), billing_status,
    plus een count van users gezien in de laatste 5 min."""
    db = _deps.db
    companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
    threshold = _deps.now_utc().timestamp() - 300
    recent_user_counts: dict[str, int] = {}
    async for u in db.users.find(
        {"last_seen_at": {"$exists": True}, "company_id": {"$ne": None}},
        {"_id": 0, "company_id": 1, "last_seen_at": 1},
    ):
        try:
            ts = datetime.fromisoformat(str(u["last_seen_at"]).replace("Z", "+00:00")).timestamp()
            if ts >= threshold:
                cid = u.get("company_id")
                if cid:
                    recent_user_counts[cid] = recent_user_counts.get(cid, 0) + 1
        except Exception:
            continue

    rows = []
    for c in companies:
        last_seen = c.get("last_seen_at")
        s = _deps.billing_summary(c)
        rows.append({
            "id": c.get("id"),
            "name": c.get("name"),
            "slug": c.get("slug"),
            "last_seen_at": last_seen,
            "online": _deps.is_online(last_seen),
            "active_users": recent_user_counts.get(c.get("id"), 0),
            "billing_status": s["billing_status"],
            "plan": c.get("plan"),
            "trial_ends_at": c.get("trial_ends_at"),
            "monthly_amount": s.get("monthly_amount"),
            "currency": s.get("currency") or "SRD",
        })
    rows.sort(key=lambda r: (
        0 if r["online"] else 1,
        -(datetime.fromisoformat(str(r["last_seen_at"]).replace("Z", "+00:00")).timestamp()
           if r["last_seen_at"] else 0),
    ))
    return {
        "companies": rows,
        "total_online": sum(1 for r in rows if r["online"]),
        "threshold_seconds": 300,
        "checked_at": _deps.iso(_deps.now_utc()),
    }


# =====================================================================
# Subscription invoices — lijst + mark paid
# =====================================================================


@router.get("/superadmin/subscription-invoices")
async def list_subscription_invoices(user: dict = Depends(_superadmin)):
    docs = await _deps.db.subscription_invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@router.post("/superadmin/subscription-invoices/{inv_id}/mark-paid")
async def mark_invoice_paid(inv_id: str, user: dict = Depends(_superadmin)):
    from pymongo import ReturnDocument
    res = await _deps.db.subscription_invoices.find_one_and_update(
        {"id": inv_id},
        {"$set": {"status": "paid", "paid_at": _deps.iso(_deps.now_utc())}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden")
    return res


# =====================================================================
# Subscription payments — lijst
# =====================================================================


@router.get("/superadmin/subscription-payments")
async def list_subscription_payments(user: dict = Depends(_superadmin)):
    docs = await _deps.db.subscription_payments.find({}, {"_id": 0}).sort("paid_at", -1).to_list(500)
    return docs


# =====================================================================
# Handmatige factuur aanmaken (POST /superadmin/subscription-invoices)
# =====================================================================


class NewInvoiceIn(BaseModel):
    company_id: str
    amount: float = Field(..., gt=0)
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    plan: Optional[str] = None                     # bv "starter", "pro"
    period_start: Optional[str] = None             # ISO; default = now
    period_end: Optional[str] = None               # ISO; default = +30 dagen
    note: Optional[str] = ""


@router.post("/superadmin/subscription-invoices")
async def create_subscription_invoice(body: NewInvoiceIn,
                                       user: dict = Depends(_superadmin)):
    db = _deps.db
    c = await db.companies.find_one({"id": body.company_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    now = _deps.now_utc()
    period_start = body.period_start or _deps.iso(now)
    period_end = body.period_end or _deps.iso(now + timedelta(days=30))
    inv = {
        "id": _deps.new_id(),
        "company_id": body.company_id,
        "company_name": c.get("name", ""),
        "plan": body.plan or c.get("plan", "starter"),
        "amount": float(body.amount),
        "currency": body.currency,
        "status": "open",
        "kind": "subscription",
        "period_start": period_start,
        "period_end": period_end,
        "created_at": _deps.iso(now),
        "created_by": user.get("email", "superadmin"),
        "note": body.note or "",
        "manual": True,                             # zichtbaar in UI als 'Handmatig'
    }
    await db.subscription_invoices.insert_one(inv)
    inv.pop("_id", None)
    return inv


# =====================================================================
# SaaS auto-invoice tick (aangeroepen vanuit daily-billing loop in server.py)
# =====================================================================


async def saas_auto_invoice_tick() -> list[dict]:
    """Voor elk actief bedrijf: als `subscription_renews_at` verlopen is en er
    is nog geen open factuur voor de nieuwe periode → genereer factuur. Deze
    fungeert als de maandelijkse SaaS-abonnementsfactuur."""
    db = _deps.db
    now = _deps.now_utc()
    created: list[dict] = []
    cursor = db.companies.find({"billing_status": "active"}, {"_id": 0})
    async for c in cursor:
        renews_at_raw = c.get("subscription_renews_at")
        if not renews_at_raw:
            continue
        try:
            renews_at = datetime.fromisoformat(str(renews_at_raw).replace("Z", "+00:00"))
        except Exception:
            continue
        if renews_at > now:
            continue  # nog niet verlopen — wachten
        # Bestaat er al een factuur voor deze nieuwe periode?
        existing = await db.subscription_invoices.find_one({
            "company_id": c["id"],
            "period_start": {"$gte": _deps.iso(renews_at - timedelta(hours=1))},
        }, {"_id": 0, "id": 1})
        if existing:
            continue
        # Bepaal bedrag/valuta via het huidige plan
        plan_id = c.get("plan") or "starter"
        plan = await db.plans.find_one({"id": plan_id}, {"_id": 0})
        amount = 0.0
        currency = "SRD"
        if plan:
            currency = (c.get("country") == "NL" and plan.get("amount_eur")) and "EUR" or "SRD"
            amount = float(plan.get("amount_eur") if currency == "EUR" else plan.get("amount_srd") or 0)
        if amount <= 0:
            continue
        period_start = renews_at
        period_end = period_start + timedelta(days=30)
        inv = {
            "id": _deps.new_id(),
            "company_id": c["id"],
            "company_name": c.get("name", ""),
            "plan": plan_id,
            "amount": amount,
            "currency": currency,
            "status": "open",
            "kind": "subscription",
            "period_start": _deps.iso(period_start),
            "period_end": _deps.iso(period_end),
            "created_at": _deps.iso(now),
            "created_by": "auto_saas_invoice",
            "auto_generated": True,
        }
        await db.subscription_invoices.insert_one(inv)
        # Update bedrijf: volgende renewal 30 dagen na deze factuur
        await db.companies.update_one(
            {"id": c["id"]},
            {"$set": {"subscription_renews_at": _deps.iso(period_end)}},
        )
        inv.pop("_id", None)
        created.append({
            "invoice_id": inv["id"],
            "company_id": c["id"],
            "company_name": c.get("name", ""),
            "amount": amount,
            "currency": currency,
        })
    return created


@router.post("/superadmin/saas-auto-invoice/run")
async def run_saas_auto_invoice(user: dict = Depends(_superadmin)):
    """Handmatige trigger voor de SaaS auto-invoice cyclus."""
    created = await saas_auto_invoice_tick()
    return {"ok": True, "created": len(created), "invoices": created}


# =====================================================================
# SaaS Kasregister — companies overview voor de superadmin-kiosk
# =====================================================================


@router.get("/superadmin/kasregister")
async def superadmin_kasregister(user: dict = Depends(_superadmin)):
    """Kasregister view: per bedrijf de totale schuld, openstaande facturen,
    laatste betaling en betaalstatus. Optimaal voor het SaaS-kasregister
    (superadmin kiosk) waar de eigenaar snel per bedrijf kan zien wie moet
    betalen."""
    db = _deps.db
    companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
    # Aggregeer facturen per company
    invoices_by_cid: dict[str, list[dict]] = {}
    async for inv in db.subscription_invoices.find({}, {"_id": 0}).sort("created_at", -1):
        invoices_by_cid.setdefault(inv["company_id"], []).append(inv)
    payments_by_cid: dict[str, list[dict]] = {}
    async for pmt in db.subscription_payments.find({}, {"_id": 0}).sort("paid_at", -1):
        if pmt.get("company_id"):
            payments_by_cid.setdefault(pmt["company_id"], []).append(pmt)

    now = _deps.now_utc()
    rows = []
    for c in companies:
        cid = c["id"]
        invs = invoices_by_cid.get(cid, [])
        pmts = payments_by_cid.get(cid, [])
        open_invs = [i for i in invs if i.get("status") != "paid"]
        overdue = 0
        outstanding_by_cur: dict[str, float] = {}
        for i in open_invs:
            cur = (i.get("currency") or "SRD").upper()
            outstanding_by_cur[cur] = outstanding_by_cur.get(cur, 0.0) + float(i.get("amount") or 0)
            try:
                pe = datetime.fromisoformat(str(i.get("period_end") or "").replace("Z", "+00:00"))
                if pe < now:
                    overdue += 1
            except Exception:
                pass
        last_pmt = pmts[0] if pmts else None
        summary = _deps.billing_summary(c)
        # Bepaal status voor kasregister
        if overdue > 0:
            status = "overdue"
        elif len(open_invs) > 0:
            status = "open"
        else:
            status = "paid"
        rows.append({
            "id": cid,
            "name": c.get("name", ""),
            "slug": c.get("slug"),
            "plan": c.get("plan"),
            "billing_status": summary["billing_status"],
            "monthly_amount": summary.get("monthly_amount"),
            "currency": summary.get("currency") or "SRD",
            "open_count": len(open_invs),
            "overdue_count": overdue,
            "outstanding_by_currency": outstanding_by_cur,
            "paid_count": sum(1 for i in invs if i.get("status") == "paid"),
            "total_invoices": len(invs),
            "last_payment": last_pmt,
            "status": status,
            "subscription_renews_at": c.get("subscription_renews_at"),
        })
    # Sorteer: achterstand > open > betaald
    order = {"overdue": 0, "open": 1, "paid": 2}
    rows.sort(key=lambda r: (order.get(r["status"], 3), r["name"].lower()))
    return {
        "companies": rows,
        "checked_at": _deps.iso(now),
        "totals": {
            "overdue": sum(1 for r in rows if r["status"] == "overdue"),
            "open": sum(1 for r in rows if r["status"] == "open"),
            "paid": sum(1 for r in rows if r["status"] == "paid"),
        },
    }


# =====================================================================
# SaaS Betalingsregelingen (Payment Plans op SaaS-invoice niveau)
# =====================================================================


class SaasPlanIn(BaseModel):
    company_id: str
    invoice_id: Optional[str] = None    # optionele bron-factuur; zo niet -> vrij
    total_amount: float = Field(..., gt=0)
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    installments: int = Field(..., ge=2, le=24)
    interval_days: int = Field(30, ge=1, le=90)
    start_date: Optional[str] = None    # ISO; default = today
    note: Optional[str] = ""


@router.post("/superadmin/saas-payment-plans")
async def create_saas_payment_plan(body: SaasPlanIn,
                                    user: dict = Depends(_superadmin)):
    """Maakt een SaaS-betalingsregeling: splitst het totaalbedrag in N
    termijnen (elk als aparte `subscription_invoices` rij) en tagt ze met
    `plan_id` + `installment_seq`. Als bron-factuur is opgegeven wordt
    die factuur op `superseded` gezet."""
    db = _deps.db
    c = await db.companies.find_one({"id": body.company_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    now = _deps.now_utc()
    start = datetime.fromisoformat(body.start_date) if body.start_date else now
    plan_id = _deps.new_id()
    per_amount = round(body.total_amount / body.installments, 2)
    # Correctie op laatste termijn zodat som = totaal
    amounts = [per_amount] * (body.installments - 1)
    amounts.append(round(body.total_amount - per_amount * (body.installments - 1), 2))

    invoices = []
    for i, amt in enumerate(amounts):
        due = start + timedelta(days=body.interval_days * i)
        inv = {
            "id": _deps.new_id(),
            "company_id": body.company_id,
            "company_name": c.get("name", ""),
            "plan": c.get("plan"),
            "amount": amt,
            "currency": body.currency,
            "status": "open",
            "kind": "installment",
            "saas_plan_id": plan_id,
            "installment_seq": i + 1,
            "installment_total": body.installments,
            "period_start": _deps.iso(due),
            "period_end": _deps.iso(due + timedelta(days=body.interval_days)),
            "created_at": _deps.iso(now),
            "created_by": user.get("email", "superadmin"),
            "note": body.note or "",
        }
        await db.subscription_invoices.insert_one(inv)
        inv.pop("_id", None)
        invoices.append(inv)

    if body.invoice_id:
        await db.subscription_invoices.update_one(
            {"id": body.invoice_id},
            {"$set": {"status": "superseded", "superseded_by_plan": plan_id}},
        )

    plan_doc = {
        "id": plan_id,
        "company_id": body.company_id,
        "company_name": c.get("name", ""),
        "total_amount": body.total_amount,
        "currency": body.currency,
        "installments": body.installments,
        "interval_days": body.interval_days,
        "start_date": _deps.iso(start),
        "created_at": _deps.iso(now),
        "created_by": user.get("email", "superadmin"),
        "note": body.note or "",
        "source_invoice_id": body.invoice_id,
    }
    await db.saas_payment_plans.insert_one(plan_doc)
    plan_doc.pop("_id", None)
    return {"plan": plan_doc, "invoices": invoices}


@router.get("/superadmin/saas-payment-plans")
async def list_saas_payment_plans(user: dict = Depends(_superadmin)):
    """Combineert echte plans + bedrijven met 2+ open facturen (implicit plans)."""
    db = _deps.db
    plans = await db.saas_payment_plans.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    plan_ids = [p["id"] for p in plans]
    # Load termijn-facturen per plan
    plan_map: dict[str, dict] = {p["id"]: {**p, "invoices": [], "paid": 0} for p in plans}
    async for inv in db.subscription_invoices.find({"saas_plan_id": {"$in": plan_ids}}, {"_id": 0}):
        pid = inv["saas_plan_id"]
        plan_map[pid]["invoices"].append(inv)
        if inv.get("status") == "paid":
            plan_map[pid]["paid"] += float(inv.get("amount") or 0)
    return list(plan_map.values())


# Silence unused-import warnings (timedelta reserved voor toekomstige endpoints).
_ = timedelta
_ = Response
_ = io


# =====================================================================
# Kasregister — Detail per bedrijf (facturen + betaalhistorie)
# =====================================================================


@router.get("/superadmin/kasregister/{company_id}")
async def kasregister_detail(company_id: str, user: dict = Depends(_superadmin)):
    db = _deps.db
    c = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    invoices = await db.subscription_invoices.find(
        {"company_id": company_id}, {"_id": 0},
    ).sort("created_at", -1).to_list(500)
    payments = await db.subscription_payments.find(
        {"company_id": company_id}, {"_id": 0},
    ).sort("paid_at", -1).to_list(500)
    plans = await db.saas_payment_plans.find(
        {"company_id": company_id}, {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    summary = _deps.billing_summary(c)

    outstanding: dict[str, float] = {}
    for iv in invoices:
        if iv.get("status") == "paid" or iv.get("status") == "superseded":
            continue
        cur = (iv.get("currency") or "SRD").upper()
        outstanding[cur] = outstanding.get(cur, 0.0) + float(iv.get("amount") or 0)
    return {
        "company": {
            "id": c["id"], "name": c.get("name"), "slug": c.get("slug"),
            "plan": c.get("plan"), "owner_email": c.get("owner_email"),
            "owner_name": c.get("owner_name"), "country": c.get("country"),
            "billing_status": summary["billing_status"],
            "monthly_amount": summary.get("monthly_amount"),
            "currency": summary.get("currency") or "SRD",
            "trial_ends_at": c.get("trial_ends_at"),
            "subscription_renews_at": c.get("subscription_renews_at"),
        },
        "invoices": invoices,
        "payments": payments,
        "plans": plans,
        "outstanding_by_currency": outstanding,
    }


# =====================================================================
# PDF factuur — download + versturen per e-mail
# =====================================================================


@router.get("/superadmin/subscription-invoices/{inv_id}/pdf")
async def download_invoice_pdf(inv_id: str, user: dict = Depends(_superadmin)):
    db = _deps.db
    inv = await db.subscription_invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden")
    c = await db.companies.find_one({"id": inv["company_id"]}, {"_id": 0}) or {}
    saas = await db.saas_settings.find_one({"id": "_saas_settings"}, {"_id": 0}) or {}
    from pdf_gen import saas_invoice_pdf
    pdf_bytes = saas_invoice_pdf(inv, c, saas.get("company_info") if saas else None)
    filename = f"factuur-{inv['id'][:8].upper()}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )


class EmailInvoiceIn(BaseModel):
    to_email: Optional[str] = None    # override; default = company.owner_email
    subject: Optional[str] = None
    body_html: Optional[str] = None


@router.post("/superadmin/subscription-invoices/{inv_id}/email")
async def email_invoice(inv_id: str, body: EmailInvoiceIn,
                         user: dict = Depends(_superadmin)):
    db = _deps.db
    inv = await db.subscription_invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden")
    c = await db.companies.find_one({"id": inv["company_id"]}, {"_id": 0}) or {}
    to = body.to_email or c.get("owner_email")
    if not to:
        raise HTTPException(status_code=400, detail="Geen e-mailadres beschikbaar voor dit bedrijf")

    saas = await db.saas_settings.find_one({"id": "_saas_settings"}, {"_id": 0}) or {}
    from pdf_gen import saas_invoice_pdf
    pdf_bytes = saas_invoice_pdf(inv, c, saas.get("company_info") if saas else None)
    filename = f"factuur-{inv['id'][:8].upper()}.pdf"

    subject = body.subject or f"SaaS Factuur {inv['id'][:8].upper()} — {c.get('name', '')}"
    body_html = body.body_html or (
        f"<p>Beste {c.get('owner_name') or 'beheerder'},</p>"
        f"<p>Bijgevoegd vindt u de factuur voor uw abonnement "
        f"<strong>{inv.get('plan', '')}</strong> ({inv.get('currency', 'SRD')} "
        f"{float(inv.get('amount') or 0):.2f}).</p>"
        f"<p>Gelieve dit bedrag binnen 14 dagen te voldoen.</p>"
        f"<p>Met vriendelijke groet,<br/>Het SuriRent team</p>"
    )

    ok = await _deps.saas_email(
        to_email=to, subject=subject, body_html=body_html,
        attachments=[(filename, pdf_bytes, "application/pdf")],
    )
    # Registreer in email-log op de factuur
    await db.subscription_invoices.update_one(
        {"id": inv_id},
        {"$push": {"email_log": {
            "sent_to": to, "sent_at": _deps.iso(_deps.now_utc()),
            "ok": bool(ok), "sent_by": user.get("email", "superadmin"),
        }}},
    )
    if not ok:
        raise HTTPException(status_code=502, detail="E-mail kon niet verstuurd worden (SMTP faalde)")
    return {"ok": True, "sent_to": to}


# =====================================================================
# Betaal-herinneringen — 3 dagen na vervaldatum
# =====================================================================


async def check_invoice_reminders() -> list[dict]:
    """Stuur herinnering naar bedrijven van wie een factuur >=3 dagen
    vervallen is. Idempotent via `sent_invoice_reminders` collectie (dedup
    per (invoice_id, days_bucket) — één herinnering per drempel-passage)."""
    db = _deps.db
    if db is None or _deps.saas_email is None:
        return []
    now = _deps.now_utc()
    threshold = now - timedelta(days=3)
    sent: list[dict] = []

    cursor = db.subscription_invoices.find({
        "status": {"$in": ["open", "overdue"]},
    }, {"_id": 0})
    async for inv in cursor:
        pe_raw = inv.get("period_end")
        if not pe_raw:
            continue
        try:
            pe = datetime.fromisoformat(str(pe_raw).replace("Z", "+00:00"))
        except Exception:
            continue
        if pe > threshold:
            continue  # nog niet vervallen genoeg

        # Alleen 1 herinnering per factuur (voor nu)
        marker = await db.sent_invoice_reminders.find_one({"invoice_id": inv["id"]}, {"_id": 0})
        if marker:
            continue

        c = await db.companies.find_one({"id": inv["company_id"]}, {"_id": 0})
        if not c or not c.get("owner_email"):
            continue

        days_overdue = max(1, int((now - pe).total_seconds() // 86400))
        subject = f"Herinnering: factuur {days_overdue} dagen vervallen"
        body_html = (
            f"<p>Beste {c.get('owner_name') or 'beheerder'},</p>"
            f"<p>Uw SaaS-factuur voor <strong>{c.get('name', '')}</strong> is "
            f"<strong>{days_overdue} dagen vervallen</strong>.</p>"
            f"<p>Bedrag: <strong>{inv.get('currency', 'SRD')} "
            f"{float(inv.get('amount') or 0):.2f}</strong><br/>"
            f"Vervaldatum: {pe.strftime('%d-%m-%Y')}</p>"
            f"<p>Gelieve dit bedrag zo spoedig mogelijk te voldoen om onderbreking "
            f"te voorkomen.</p>"
            f"<p>Met vriendelijke groet,<br/>Het SuriRent team</p>"
        )
        # Attach PDF factuur automatisch mee.
        try:
            saas = await db.saas_settings.find_one({"id": "_saas_settings"}, {"_id": 0}) or {}
            from pdf_gen import saas_invoice_pdf
            pdf_bytes = saas_invoice_pdf(inv, c, saas.get("company_info") if saas else None)
            attachments = [(f"factuur-{inv['id'][:8].upper()}.pdf", pdf_bytes, "application/pdf")]
        except Exception:
            attachments = None

        ok = await _deps.saas_email(
            to_email=c["owner_email"], subject=subject, body_html=body_html,
            attachments=attachments,
        )
        await db.sent_invoice_reminders.insert_one({
            "invoice_id": inv["id"],
            "company_id": c["id"],
            "company_name": c.get("name", ""),
            "owner_email": c["owner_email"],
            "days_overdue": days_overdue,
            "sent_at": _deps.iso(now),
            "sent_ok": bool(ok),
        })
        # Markeer factuur als overdue (voor UI)
        if inv.get("status") == "open":
            await db.subscription_invoices.update_one(
                {"id": inv["id"]},
                {"$set": {"status": "overdue"}},
            )
        sent.append({
            "invoice_id": inv["id"], "company_name": c.get("name", ""),
            "owner_email": c["owner_email"], "days_overdue": days_overdue,
            "sent_ok": bool(ok),
        })
    return sent


@router.post("/superadmin/invoice-reminders/run")
async def run_invoice_reminders(user: dict = Depends(_superadmin)):
    sent = await check_invoice_reminders()
    return {"ok": True, "count": len(sent), "sent": sent}
