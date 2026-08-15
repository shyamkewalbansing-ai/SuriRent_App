"""SaaS-operations routes — handmatige kasgeld-mutaties (correcties/refunds)
en de trial-verloop waarschuwingsflow.

Endpoints:
  POST /superadmin/kas-mutations          — handmatige +/- boeking in het
                                            SaaS kasboek
  POST /superadmin/trial-warnings/run     — handmatig de trial-warning cyclus
                                            triggeren (idempotent)

Achtergrondwerk:
  check_trial_warnings()                  — stuurt e-mail 3 dagen voor
                                            een bedrijfs-trial afloopt.
                                            Wordt door de daily-billing loop
                                            in server.py aangeroepen.
                                            Track sent-status in de
                                            `sent_trial_warnings` collectie.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from . import _deps

router = APIRouter()


async def _superadmin(request: Request) -> dict:
    """Wrapper zodat `_deps.get_current_user` op runtime resolved wordt
    (pas na server.py startup gevuld). Blokkeert niet-superadmin."""
    user = await _deps.get_current_user(request)
    if not user or user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Alleen superadmin")
    return user

# =====================================================================
# Handmatige SaaS Kasgeld mutatie (Superadmin)
# =====================================================================


class KasMutationIn(BaseModel):
    """Body voor een handmatige mutatie op het SaaS-kasboek.
    - `amount` positief = ontvangst (bijv. correctie erbij),
      negatief = uitbetaling / refund.
    - `kind` bepaalt hoe de regel getoond wordt in het kasboek.
    """
    company_id: Optional[str] = None                       # optioneel: koppel aan bedrijf
    amount: float = Field(..., description="Positief = in, negatief = uit")
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    kind: Literal["adjustment", "refund", "correction"] = "adjustment"
    reason: str = Field("", max_length=500)
    note: Optional[str] = ""
    paid_at: Optional[str] = None                          # ISO; default = now


@router.post("/superadmin/kas-mutations")
async def register_kas_mutation(body: KasMutationIn,
                                 user: dict = Depends(_superadmin)):
    """Boek een handmatige +/- mutatie op het SaaS-kasboek. Verschijnt in
    de SaaS Kasgeld-lijst en telt mee in het `total_received_by_currency`
    saldo (via aggregatie op `subscription_payments`)."""
    if body.amount == 0:
        raise HTTPException(status_code=400, detail="Bedrag mag niet 0 zijn")

    company_name = ""
    if body.company_id:
        c = await _deps.db.companies.find_one({"id": body.company_id}, {"_id": 0, "name": 1})
        if not c:
            raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
        company_name = c.get("name", "")

    now = _deps.now_utc()
    paid_at = body.paid_at or _deps.iso(now)

    # Bepaal een leesbare method-label voor de payment-lijst.
    method_label = {
        "refund": "Refund",
        "correction": "Correctie",
        "adjustment": "Mutatie",
    }.get(body.kind, "Mutatie")

    pay = {
        "id": _deps.new_id(),
        "invoice_id": None,
        "company_id": body.company_id,
        "company_name": company_name,
        "amount": body.amount,
        "currency": body.currency,
        "method": method_label,
        "reference": body.reason.strip(),
        "note": (body.note or "").strip(),
        "paid_at": paid_at,
        "created_at": _deps.iso(now),
        "created_by": user.get("email"),
        # Markers zodat de UI onderscheid kan maken en kasboek-aggregatie
        # deze correct behandelt (positief = in, negatief = uit).
        "kind": body.kind,
        "is_manual": True,
        "source": "manual",
    }
    await _deps.db.subscription_payments.insert_one(pay)
    pay.pop("_id", None)
    return {"ok": True, "payment": pay}


# =====================================================================
# Trial-verloop waarschuwingsmails (3 dagen voor einde)
# =====================================================================


async def check_trial_warnings() -> list[dict]:
    """Zoek trial-bedrijven waarvan de trial binnen 3 dagen afloopt en stuur
    een waarschuwingsmail naar `owner_email`. Idempotent: bewaart een
    marker in `sent_trial_warnings` zodat dezelfde trial-eind-datum niet
    dubbel wordt gemailed."""
    db = _deps.db
    saas_email = _deps.saas_email
    if db is None or saas_email is None:
        return []

    now = _deps.now_utc()
    window_start = now + timedelta(days=2, hours=12)   # 2.5 dagen
    window_end = now + timedelta(days=3, hours=12)     # 3.5 dagen

    sent: list[dict] = []
    cursor = db.companies.find({"billing_status": "trial"}, {"_id": 0})
    async for c in cursor:
        end_raw = c.get("trial_ends_at")
        owner_email = c.get("owner_email")
        if not end_raw or not owner_email:
            continue
        try:
            end = datetime.fromisoformat(str(end_raw).replace("Z", "+00:00"))
        except Exception:
            continue
        if end < window_start or end > window_end:
            continue

        # De-duplicate op (company_id, trial_ends_at). Zelfde trial-eind =
        # één waarschuwing max.
        marker_key = f"{c['id']}::{end_raw}"
        already = await db.sent_trial_warnings.find_one({"_key": marker_key}, {"_id": 0})
        if already:
            continue

        days_left = max(0, int((end - now).total_seconds() // 86400))
        subject = f"Uw proefperiode loopt over {days_left} dagen af"
        body_html = (
            f"<p>Beste {c.get('owner_name', 'beheerder')},</p>"
            f"<p>De proefperiode van uw <strong>{c.get('name', 'omgeving')}</strong> "
            f"loopt over <strong>{days_left} dagen</strong> af "
            f"(op {end.strftime('%d %B %Y')}).</p>"
            f"<p>Om onderbreking te voorkomen, activeer uw abonnement in het "
            f"SuriRent portaal onder <em>Mijn Abonnement</em>.</p>"
            f"<p>Met vriendelijke groet,<br/>Het SuriRent team</p>"
        )
        ok = await saas_email(to_email=owner_email, subject=subject, body_html=body_html)
        await db.sent_trial_warnings.insert_one({
            "_key": marker_key,
            "company_id": c["id"],
            "company_name": c.get("name", ""),
            "owner_email": owner_email,
            "trial_ends_at": end_raw,
            "days_left": days_left,
            "sent_at": _deps.iso(now),
            "sent_ok": bool(ok),
        })
        sent.append({
            "company_id": c["id"],
            "company_name": c.get("name", ""),
            "owner_email": owner_email,
            "days_left": days_left,
            "sent_ok": bool(ok),
        })
    return sent


@router.post("/superadmin/trial-warnings/run")
async def run_trial_warnings(user: dict = Depends(_superadmin)):
    """Handmatig de trial-warning cyclus draaien (ook zichtbaar in
    superadmin panel)."""
    sent = await check_trial_warnings()
    return {"ok": True, "count": len(sent), "sent": sent}
