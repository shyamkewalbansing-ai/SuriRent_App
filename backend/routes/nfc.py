"""NFC tap-in routes — huurder identificatie via USB HID-lezer of
Web NFC API (Android Chrome) of NFC URL-tag.

Endpoints:
  POST /kiosk/nfc-lookup            — kaart-UID → apartment lookup
  GET  /admin/nfc/pending           — laatst gescande niet-gekoppelde kaart
  PUT  /admin/apartments/{id}/nfc-card — koppel/wis kaart

In-memory `_nfc_pending` buffert UIDs van onbekende kaarten voor 5 min
zodat de admin via "use_pending" eenvoudig kan koppelen.
"""

from __future__ import annotations

import time as _time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from . import _deps

router = APIRouter()

_nfc_pending: dict = {}
_NFC_PENDING_TTL = 300.0  # 5 minuten


def _normalize_nfc(card_id: str) -> str:
    """Standaardiseer UID naar uppercase alfanumeriek zonder scheidingstekens."""
    if not card_id:
        return ""
    return "".join(c for c in str(card_id).strip().upper() if c.isalnum())


class NfcLookupIn(BaseModel):
    card_id: str


class NfcAssignIn(BaseModel):
    card_id: Optional[str] = None
    use_pending: bool = False


@router.post("/kiosk/nfc-lookup")
async def kiosk_nfc_lookup(body: NfcLookupIn, request: Request):
    ks = await _deps.get_kiosk_session(request)
    cid = ks.get("company_id")
    if not cid:
        raise HTTPException(status_code=403, detail="Geen kiosk-sessie")
    uid = _normalize_nfc(body.card_id)
    if not uid:
        raise HTTPException(status_code=400, detail="Lege kaart-UID")
    apt = await _deps.db.apartments.find_one(
        {"company_id": cid, "nfc_card_id": uid}, {"_id": 0},
    )
    if not apt:
        _nfc_pending[cid] = {"card_id": uid, "ts": _time.time()}
        return {"found": False, "card_id": uid}
    tenant = None
    if apt.get("tenant_id"):
        tenant = await _deps.db.tenants.find_one(
            {"id": apt["tenant_id"]},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1,
             "internet_amount": 1, "internet_currency": 1},
        )
    return {"found": True, "card_id": uid, "apartment": apt, "tenant": tenant}


async def _admin_user(request: Request):
    return await _deps.get_current_user(request)


@router.get("/admin/nfc/pending")
async def admin_nfc_pending(user: dict = Depends(_admin_user)):
    cid = _deps.company_id_of(user)
    pend = _nfc_pending.get(cid)
    if not pend:
        return {"pending": None}
    if _time.time() - pend["ts"] > _NFC_PENDING_TTL:
        _nfc_pending.pop(cid, None)
        return {"pending": None}
    return {"pending": {"card_id": pend["card_id"],
                       "scanned_seconds_ago": int(_time.time() - pend["ts"])}}


@router.put("/admin/apartments/{apt_id}/nfc-card")
async def admin_assign_nfc_card(apt_id: str, body: NfcAssignIn,
                                 user: dict = Depends(_admin_user)):
    cid = _deps.company_id_of(user)
    apt = await _deps.db.apartments.find_one(
        {"id": apt_id, **_deps.scope(user)}, {"_id": 0},
    )
    if not apt:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    if body.use_pending:
        pend = _nfc_pending.get(cid)
        if not pend or _time.time() - pend["ts"] > _NFC_PENDING_TTL:
            raise HTTPException(status_code=400, detail="Geen recente kaart gescand")
        uid = pend["card_id"]
    else:
        uid = _normalize_nfc(body.card_id or "") or None
    if uid:
        clash = await _deps.db.apartments.find_one(
            {"company_id": cid, "nfc_card_id": uid, "id": {"$ne": apt_id}},
            {"_id": 0, "id": 1, "number": 1},
        )
        if clash:
            raise HTTPException(
                status_code=409,
                detail=f"Kaart is al gekoppeld aan appartement {clash.get('number')}",
            )
    upd = {"nfc_card_id": uid} if uid else {"nfc_card_id": None}
    await _deps.db.apartments.update_one({"id": apt_id}, {"$set": upd})
    if uid:
        _nfc_pending.pop(cid, None)
    return {"ok": True, "apartment_id": apt_id, "nfc_card_id": uid}
