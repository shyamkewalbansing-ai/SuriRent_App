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

from fastapi import APIRouter, Depends, HTTPException, Request

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


# Silence unused-import warnings (timedelta reserved voor toekomstige endpoints).
_ = timedelta
