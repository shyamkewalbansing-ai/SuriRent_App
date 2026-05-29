"""SuriRent Vastgoed Kiosk - Minimal Backend
- JWT email/password auth for admin (httpOnly cookies + Bearer fallback)
- 4-digit kiosk PIN flow
- CRUD: apartments, tenants, payments
"""
from dotenv import load_dotenv
load_dotenv()

import os
import re
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query, UploadFile, File, Body, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
import io
import base64
import secrets
import asyncio
import json

from pdf_gen import (
    receipt_pdf, contract_pdf, invoice_pdf, deposit_refund_pdf, payslip_pdf,
    onboarding_pdf, _make_qr_png,
)
from landing_content import (
    LANDING_DEFAULTS, DRAFT_ID, PUBLISHED_ID, merge_with_defaults,
    ALLOWED_FEATURE_ICONS,
)

# =====================================================================
# Config
# =====================================================================
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
ACCESS_MIN = 60 * 12  # 12h for convenience in this app
KIOSK_TOKEN_MIN = 60 * 8  # kiosk session 8h

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


# =====================================================================
# Helpers - password & jwt
# =====================================================================
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(payload: dict, minutes: int) -> str:
    data = {**payload, "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes)}
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# =====================================================================
# Brute-force lockout for PIN endpoints (in-memory, per process)
# =====================================================================
# key -> {"attempts": int, "locked_until": float (epoch seconds)}
_PIN_ATTEMPTS: dict = {}
PIN_MAX_ATTEMPTS = int(os.environ.get("PIN_MAX_ATTEMPTS", "8"))
PIN_LOCKOUT_SECONDS = int(os.environ.get("PIN_LOCKOUT_SECONDS", "300"))  # 5 minutes


def _pin_throttle_check(key: str) -> None:
    import time
    rec = _PIN_ATTEMPTS.get(key)
    if rec and rec.get("locked_until", 0) > time.time():
        wait = int(rec["locked_until"] - time.time())
        raise HTTPException(
            status_code=429,
            detail=f"Te veel mislukte pogingen. Probeer opnieuw over {wait} seconden.",
        )


def _pin_throttle_fail(key: str) -> None:
    import time
    rec = _PIN_ATTEMPTS.get(key, {"attempts": 0, "locked_until": 0})
    rec["attempts"] = rec.get("attempts", 0) + 1
    if rec["attempts"] >= PIN_MAX_ATTEMPTS:
        rec["locked_until"] = time.time() + PIN_LOCKOUT_SECONDS
        rec["attempts"] = 0
    _PIN_ATTEMPTS[key] = rec


def _pin_throttle_clear(key: str) -> None:
    _PIN_ATTEMPTS.pop(key, None)


def _client_ip(request: Request) -> str:
    return (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown"))


# =====================================================================
# Auth Dependencies
# =====================================================================
def extract_token(request: Request, cookie_name: str = "access_token") -> Optional[str]:
    tok = request.cookies.get(cookie_name)
    if tok:
        return tok
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    # EventSource (SSE) kan geen custom headers sturen — fallback op
    # ?token=... query param. Wordt alleen gelezen op SSE endpoints
    # waar deze fallback bedoeld is.
    qp = request.query_params.get("token")
    if qp:
        return qp
    return None


async def get_current_user(request: Request) -> dict:
    token = extract_token(request, "access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Niet ingelogd")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Ongeldig token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token verlopen")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Ongeldig token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Gebruiker niet gevonden")
    # Impersonation context carried via JWT payload
    if payload.get("original_user_id"):
        user["original_user_id"] = payload["original_user_id"]
        user["impersonated_by"] = payload.get("impersonated_by")
        # While impersonating, scope to the company embedded in the token
        user["company_id"] = payload.get("company_id") or user.get("company_id")
        user["role"] = "admin"  # acts as admin of the customer
    # Superadmin can simulate company via header x-active-company
    if user.get("role") == "superadmin":
        active = request.headers.get("x-active-company") or request.query_params.get("company_id")
        user["active_company_id"] = active or user.get("company_id")
    else:
        user["active_company_id"] = user.get("company_id")
    return user


def require_role(*roles: str):
    async def _dep(user=Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Onvoldoende rechten")
        return user
    return _dep


def scope(user: dict) -> dict:
    """Mongo filter for current company scope."""
    cid = user.get("active_company_id")
    if not cid:
        return {}
    return {"company_id": cid}


def company_id_of(user: dict) -> Optional[str]:
    return user.get("active_company_id")


async def get_kiosk_session(request: Request) -> dict:
    token = extract_token(request, "kiosk_token")
    if not token:
        raise HTTPException(status_code=401, detail="Kiosk niet ontgrendeld")
    payload: dict = {}
    try:
        payload = decode_token(token)
        if payload.get("type") != "kiosk":
            raise HTTPException(status_code=401, detail="Ongeldig kiosk token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Kiosk sessie verlopen")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Ongeldig kiosk token")
    return {"company_id": payload.get("company_id"), "type": "kiosk"}


def kiosk_scope(session: dict) -> dict:
    cid = session.get("company_id")
    return {"company_id": cid} if cid else {}


# =====================================================================
# Models
# =====================================================================
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    company_name: Optional[str] = None  # If set, creates a new company with this user as admin
    telefoon: Optional[str] = ""
    plan: Optional[Literal["starter", "professional"]] = "starter"
    kiosk_pin: Optional[str] = None  # 4 digits — set the kiosk PIN at registration
    country: Optional[Literal["SR", "NL", "OTHER"]] = None  # Explicit override; falls back to phone-based detection


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PinIn(BaseModel):
    pin: str = Field(min_length=4, max_length=4)
    # Optioneel: bedrijfs-context. Op `/<slug>/login` stuurt frontend de slug
    # mee zodat de PIN alleen tegen die bedrijfs-PINs (en employees) gecheckt
    # wordt. Op de generieke `/login` (zonder slug) wordt PIN-login geweigerd.
    company_slug: Optional[str] = None
    company_id: Optional[str] = None


class SetPinIn(BaseModel):
    pin: str = Field(min_length=4, max_length=4)


class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: str
    created_at: str


class ApartmentIn(BaseModel):
    number: str
    address: Optional[str] = ""
    rent_amount: float
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    description: Optional[str] = ""
    location_id: Optional[str] = None
    photo_url: Optional[str] = ""


class ApartmentOut(ApartmentIn):
    id: str
    status: Literal["vacant", "occupied"]
    tenant_id: Optional[str] = None
    tenant_name: Optional[str] = None
    shelly: Optional[dict] = None  # {device_id, channel, label} when bound
    created_at: str


class ShellyBindIn(BaseModel):
    device_id: Optional[str] = None  # None / "" unbinds
    channel: int = 0
    label: Optional[str] = ""


class ShellyControlIn(BaseModel):
    turn: Literal["on", "off", "toggle"]


class TenantIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    apartment_id: Optional[str] = None
    internet_amount: float = 0.0  # Vast bedrag per maand voor internet (SRD)


class TenantOut(TenantIn):
    id: str
    apartment_number: Optional[str] = None
    rent_amount: Optional[float] = None
    currency: Optional[str] = None
    created_at: str


class LocationIn(BaseModel):
    name: str
    address: Optional[str] = ""
    photo_url: Optional[str] = ""


class LocationOut(LocationIn):
    id: str
    apartments_total: int = 0
    apartments_occupied: int = 0
    created_at: str


class PaymentIn(BaseModel):
    tenant_id: str
    apartment_id: Optional[str] = None
    amount: float
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    method: Literal["contant", "bank", "mope", "sumup", "uni5pay"] = "contant"
    category: Literal["huur", "servicekosten", "borg", "boete", "internet", "overig", "vooruitbetaling"] = "huur"
    period_month: Optional[int] = None
    period_year: Optional[int] = None
    note: Optional[str] = ""
    received_by: Optional[str] = ""  # naam medewerker die betaling ontving


class PaymentOut(BaseModel):
    id: str
    tenant_id: str
    tenant_name: Optional[str] = None
    apartment_id: Optional[str] = None
    apartment_number: Optional[str] = None
    location_name: Optional[str] = None
    amount: float
    currency: str
    method: str
    category: str
    period_month: Optional[int] = None
    period_year: Optional[int] = None
    invoice_id: Optional[str] = None
    invoice_number: Optional[str] = None
    receipt_number: str
    paid_at: str
    note: Optional[str] = ""
    received_by: Optional[str] = ""
    approved_by: Optional[str] = ""
    # Approval workflow — alleen Kiosk-medewerkers triggeren pending state.
    # Beheerder/boekhouder betalingen krijgen direct status="approved".
    status: Optional[str] = "approved"  # approved | pending_approval | rejected
    kiosk_employee_id: Optional[str] = None
    kiosk_employee_name: Optional[str] = None
    approved_at: Optional[str] = None
    approved_by_user_id: Optional[str] = None
    signature_data_url: Optional[str] = None  # base64 PNG van handtekening
    rejected_reason: Optional[str] = None
    # Bankoverschrijving-velden (alleen aanwezig als method=="bank")
    bank_country: Optional[str] = None  # "SR" of "NL"
    bank_statement_id: Optional[str] = None
    bank_statement_filename: Optional[str] = None
    bank_statement_size: Optional[int] = None
    bank_statement_content_type: Optional[str] = None
    # OCR-resultaat (gevuld door achtergrond-task na bank upload)
    ocr_status: Optional[str] = None  # matched|mismatch|failed
    ocr_amount: Optional[float] = None
    ocr_currency: Optional[str] = None
    ocr_date_iso: Optional[str] = None
    ocr_payer_name: Optional[str] = None
    ocr_beneficiary: Optional[str] = None
    ocr_reference: Optional[str] = None
    ocr_confidence: Optional[float] = None
    ocr_mismatch_reasons: Optional[list] = None
    auto_approved: Optional[bool] = None


class PaymentApproveIn(BaseModel):
    signature_data_url: str  # base64 data URL van canvas handtekening


class PaymentRejectIn(BaseModel):
    reason: Optional[str] = ""


# =====================================================================
# Lifespan & seed
# =====================================================================
DEFAULT_COMPANY_SLUG = "surirent"
DEFAULT_COMPANY_NAME = "SuriRent N.V."

# Collections that hold per-company business data
TENANT_SCOPED_COLLECTIONS = [
    "apartments", "tenants", "payments", "contracts", "invoices",
    "employees", "salaries", "deposits", "maintenance", "kasgeld",
    "push_subs", "locations",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---------- Indexes ----------
    # Hot-path indexes voor snelle queries op alle collecties die de
    # app gebruikt. Worden bij elke startup idempotent gegarandeerd.
    await db.users.create_index("email", unique=True)
    await db.users.create_index([("company_id", 1), ("role", 1)])
    await db.apartments.create_index("number")
    await db.apartments.create_index("company_id")
    await db.tenants.create_index("name")
    await db.tenants.create_index([("company_id", 1), ("apartment_id", 1)])
    await db.tenants.create_index("company_id")
    await db.payments.create_index("paid_at")
    await db.payments.create_index("receipt_number", unique=True)
    await db.payments.create_index([("company_id", 1), ("paid_at", -1)])
    await db.payments.create_index([("tenant_id", 1), ("paid_at", -1)])
    await db.payments.create_index([("company_id", 1), ("status", 1)])
    await db.payments.create_index("invoice_id")
    await db.payments.create_index("id")
    await db.invoices.create_index([("company_id", 1), ("status", 1)])
    await db.invoices.create_index([("tenant_id", 1), ("period_year", 1), ("period_month", 1)])
    await db.invoices.create_index("id")
    await db.companies.create_index("slug", unique=True)
    await db.push_subs.create_index("user_id")
    await db.push_subs.create_index("endpoint", unique=True)
    await db.employees.create_index([("company_id", 1), ("active", 1), ("app_role", 1)])
    await db.kiosk_pins.create_index("company_id", unique=True)
    await db.payment_plans.create_index([("company_id", 1), ("status", 1)])
    await db.payment_plans.create_index([("tenant_id", 1), ("status", 1)])
    await db.payment_plan_installments.create_index([("plan_id", 1), ("sequence", 1)], unique=True)
    await db.payment_plan_installments.create_index([("plan_id", 1), ("status", 1)])
    await db.contracts.create_index("id")
    await db.contracts.create_index("company_id")
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])

    # --- Seed default company ---
    default = await db.companies.find_one({"slug": DEFAULT_COMPANY_SLUG})
    if not default:
        company_id = new_id()
        default = {
            "id": company_id,
            "slug": DEFAULT_COMPANY_SLUG,
            "name": DEFAULT_COMPANY_NAME,
            "contact_email": "info@surirent.sr",
            "contact_phone": "+597 881 5993",
            "address": "Paramaribo, Suriname",
            "plan": "pro",
            "active": True,
            "created_at": iso(now_utc()),
        }
        await db.companies.insert_one(default)
    DEFAULT_COMPANY_ID = default["id"]

    # --- Backfill existing data with default company_id ---
    for coll in TENANT_SCOPED_COLLECTIONS:
        await db[coll].update_many(
            {"company_id": {"$exists": False}},
            {"$set": {"company_id": DEFAULT_COMPANY_ID}},
        )

    # --- Seed admin (with company_id) ---
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@vastgoed.sr")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "name": "Admin",
            "role": "admin",
            "company_id": DEFAULT_COMPANY_ID,
            "password_hash": hash_password(admin_password),
            "created_at": iso(now_utc()),
        })
    else:
        update = {}
        if not verify_password(admin_password, existing.get("password_hash", "")):
            update["password_hash"] = hash_password(admin_password)
        if "company_id" not in existing:
            update["company_id"] = DEFAULT_COMPANY_ID
        if update:
            await db.users.update_one({"email": admin_email}, {"$set": update})

    # --- Backfill: koppel oude payments aan facturen (één keer per server-restart).
    # Voor elke huur-payment zonder invoice_id: zoek matching open factuur op
    # tenant + period_month + period_year. Markeer die factuur als 'paid'.
    try:
        cur = db.payments.find({
            "category": "huur",
            "invoice_id": {"$in": [None, ""]},
            "period_month": {"$ne": None},
            "period_year": {"$ne": None},
        }, {"_id": 0, "id": 1, "tenant_id": 1, "company_id": 1,
            "period_month": 1, "period_year": 1, "amount": 1,
            "receipt_number": 1, "paid_at": 1, "method": 1})
        backfilled = 0
        async for p in cur:
            inv = await db.invoices.find_one({
                "tenant_id": p["tenant_id"],
                "company_id": p.get("company_id"),
                "period_month": p["period_month"],
                "period_year": p["period_year"],
            }, {"_id": 0})
            if not inv:
                continue
            await db.payments.update_one(
                {"id": p["id"]},
                {"$set": {"invoice_id": inv["id"], "invoice_number": inv.get("invoice_number")}}
            )
            if inv.get("status") != "paid":
                try:
                    paid_pct = float(p.get("amount", 0)) >= float(inv.get("amount", 0)) * 0.95
                except Exception:
                    paid_pct = True
                if paid_pct:
                    await db.invoices.update_one(
                        {"id": inv["id"]},
                        {"$set": {
                            "status": "paid",
                            "paid_at": p.get("paid_at"),
                            "payment_id": p["id"],
                            "receipt_number": p.get("receipt_number"),
                            "paid_method": p.get("method"),
                        }}
                    )
            backfilled += 1
        if backfilled:
            print(f"[startup] linked {backfilled} legacy payments to invoices")
    except Exception as e:
        print(f"[startup] payment↔invoice backfill failed: {e}")

    # --- Seed superadmin ---
    super_email = "super@surirent.sr"
    super_pw = "super123"
    sa = await db.users.find_one({"email": super_email})
    if sa is None:
        await db.users.insert_one({
            "id": new_id(),
            "email": super_email,
            "name": "Superadmin",
            "role": "superadmin",
            "company_id": None,
            "password_hash": hash_password(super_pw),
            "created_at": iso(now_utc()),
        })

    # --- Seed kiosk PIN per company (legacy 'kiosk' settings doc → migrate) ---
    legacy_kiosk = await db.settings.find_one({"_id": "kiosk"})
    if legacy_kiosk:
        # migrate legacy single-PIN to default company kiosk PIN
        await db.kiosk_pins.update_one(
            {"company_id": DEFAULT_COMPANY_ID},
            {"$set": {
                "company_id": DEFAULT_COMPANY_ID,
                "pin_hash": legacy_kiosk.get("pin_hash"),
                "updated_at": iso(now_utc()),
            }},
            upsert=True,
        )
        await db.settings.delete_one({"_id": "kiosk"})
    # Ensure default company has a kiosk PIN
    cur_pin = await db.kiosk_pins.find_one({"company_id": DEFAULT_COMPANY_ID})
    if not cur_pin:
        default_pin = os.environ.get("DEFAULT_KIOSK_PIN", "1234")
        await db.kiosk_pins.insert_one({
            "company_id": DEFAULT_COMPANY_ID,
            "pin_hash": hash_password(default_pin),
            "updated_at": iso(now_utc()),
        })

    # --- Idempotent re-seed of demo tenant Jan de Vries PIN (avoid drift) ---
    if os.environ.get("RESEED_DEMO_TENANT_PIN", "1") == "1":
        demo_pin = os.environ.get("DEMO_TENANT_PIN", "5678")
        jan = await db.tenants.find_one({"email": "jan@example.sr"})
        if jan and not verify_password(demo_pin, jan.get("pin_hash", "")):
            await db.tenants.update_one(
                {"id": jan["id"]},
                {"$set": {"pin_hash": hash_password(demo_pin)}},
            )

    # --- Start trial-reminder background task ---
    global _reminder_task_handle, _overdue_task_handle
    if os.environ.get("DISABLE_TRIAL_REMINDERS") != "1":
        import asyncio as _aio
        _reminder_task_handle = _aio.create_task(_reminder_loop())

    # --- Start daily overdue-push task ---
    if os.environ.get("DISABLE_OVERDUE_PUSH") != "1":
        import asyncio as _aio
        _overdue_task_handle = _aio.create_task(_overdue_push_loop())

    # --- Start auto-invoice generation loop (per-company grace deadline) ---
    if os.environ.get("DISABLE_AUTO_INVOICE") != "1":
        import asyncio as _aio
        _auto_invoice_task_handle = _aio.create_task(_auto_invoice_loop())

    yield
    if _reminder_task_handle:
        _reminder_task_handle.cancel()
    if _overdue_task_handle:
        _overdue_task_handle.cancel()
    if _auto_invoice_task_handle:
        _auto_invoice_task_handle.cancel()
    client.close()


_reminder_task_handle = None
_overdue_task_handle = None
_auto_invoice_task_handle = None


async def _send_trial_reminders():
    """Send a single reminder per threshold (7d / 3d / 1d) and one when expired.

    Threshold tracking via company.reminders_sent so we never spam."""
    try:
        companies = await db.companies.find({"billing_status": "trial"}, {"_id": 0}).to_list(2000)
    except Exception:
        return
    from email_service import send_email as _smtp_send, send_platform_email, wrap_template, EmailError
    saas = await db.saas_settings.find_one({"id": SAAS_SETTINGS_ID}, {"_id": 0}) or {}
    smtp = saas.get("smtp") or {}
    app_url = (os.environ.get("APP_PUBLIC_URL") or "https://app.surirent.sr").rstrip("/")
    for c in companies:
        if not c.get("owner_email") or not c.get("trial_ends_at"):
            continue
        try:
            end = datetime.fromisoformat(c["trial_ends_at"].replace("Z", "+00:00"))
        except Exception:
            continue
        delta = end - now_utc()
        days_left = int(delta.total_seconds() // 86400)
        # Choose the threshold reached
        threshold = None
        if delta.total_seconds() <= 0:
            threshold = "expired"
        elif days_left <= 0:
            threshold = "1d"
        elif days_left <= 2:
            threshold = "3d"
        elif days_left <= 6:
            threshold = "7d"
        if threshold is None:
            continue
        sent = c.get("reminders_sent", []) or []
        if threshold in sent:
            continue
        plan = PLAN_PRICES.get(c.get("plan", "starter"), PLAN_PRICES["starter"])
        if threshold == "expired":
            subject = "Uw proefperiode is verlopen — activeer nu"
            headline = "Uw proefperiode is verlopen"
            body_msg = "Activeer direct uw abonnement om ononderbroken toegang te behouden."
            cta_color = "#EF4444"
        else:
            human = {"7d": "7 dagen", "3d": "3 dagen", "1d": "morgen"}[threshold]
            subject = f"Nog {human} proefperiode — voltooi uw abonnement"
            headline = f"Uw proefperiode loopt over {human} af"
            body_msg = "Om ononderbroken toegang te behouden, voltooi a.u.b. de eerste betaling."
            cta_color = "#FF5C00"
        content = f"""
            <h1>{headline}</h1>
            <p>Hallo {c.get('name', '')},</p>
            <p>{body_msg}</p>
            <table class="kv">
              <tr><td>Pakket</td><td>{plan['name']}</td></tr>
              <tr><td>Bedrag</td><td>{plan['currency']} {int(plan['amount']):,}/maand</td></tr>
              <tr><td>Verloopdatum</td><td>{end.strftime("%d %b %Y")}</td></tr>
            </table>
            <p style="margin-top:14px;"><a href="{app_url}/admin" style="display:inline-block;background:{cta_color};color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:700;">Open dashboard om te betalen</a></p>
            <p style="font-size:12px;color:#888;margin-top:10px;">In het dashboard ziet u onder "Mijn Abonnement" de bankgegevens en betaalinstructies.</p>
        """.replace(",", ".")
        body_html = wrap_template(content, footer=f"SuriRent · {app_url}")
        try:
            if smtp.get("enabled") and smtp.get("host"):
                try:
                    await _smtp_send(smtp, to=c["owner_email"], subject=subject, body_html=body_html)
                except EmailError:
                    await send_platform_email(to=c["owner_email"], subject=subject, body_html=body_html)
            else:
                await send_platform_email(to=c["owner_email"], subject=subject, body_html=body_html)
            await db.companies.update_one(
                {"id": c["id"]},
                {"$addToSet": {"reminders_sent": threshold}, "$set": {"last_reminder_at": iso(now_utc())}},
            )
        except Exception:
            continue


async def _reminder_loop():
    """Run the reminder check every 6 hours."""
    import asyncio as _aio
    while True:
        try:
            await _send_trial_reminders()
        except Exception:
            pass
        await _aio.sleep(6 * 3600)


async def _send_overdue_pushes():
    """Eén pass over alle companies: voor elke company telt hoeveel huurders
    een openstaande balance hebben en stuurt een push naar de admins van
    die company (max 1× per dag dankzij de `_overdue_last_sent` cache)."""
    today_key = now_utc().strftime("%Y-%m-%d")
    async for c in db.companies.find({"active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "overdue_push_last": 1}):
        if c.get("overdue_push_last") == today_key:
            continue  # al verstuurd vandaag
        cid = c["id"]
        overdue = []
        async for t in db.tenants.find({"company_id": cid, "apartment_id": {"$ne": None}}, {"_id": 0}):
            try:
                bal = await _calc_balance(t)
                if bal.get("balance", 0) > 0:
                    overdue.append((t["name"], bal["balance"], bal["currency"]))
            except Exception:
                continue
        if not overdue:
            await db.companies.update_one({"id": cid}, {"$set": {"overdue_push_last": today_key}})
            continue
        top = overdue[:3]
        names = ", ".join(n for n, _, _ in top)
        extra = f" +{len(overdue) - 3} anderen" if len(overdue) > 3 else ""
        cur = top[0][2]
        total = sum(b for _, b, _ in overdue)
        body = f"{len(overdue)} huurders openstaand ({cur} {total:,.2f}) — {names}{extra}"
        try:
            await _notify_company_admins(
                cid, "Achterstallige huur",
                body,
                {"kind": "overdue", "url": "/admin/invoices", "count": len(overdue), "badge_inc": 1},
            )
            await db.companies.update_one({"id": cid}, {"$set": {"overdue_push_last": today_key}})
        except Exception as e:
            print(f"[push] overdue notify failed for company={cid}: {e}")


async def _overdue_push_loop():
    """Background-loop: elke 15 minuten controleren of het tussen 9:00 en
    10:00 lokale tijd is, en zo ja: stuur de dagelijkse achterstand-push
    (max 1× per dag per company)."""
    import asyncio as _aio
    while True:
        try:
            # Lokale tijd; Suriname = UTC-3
            hour_local = (now_utc().hour - 3) % 24
            if 9 <= hour_local < 11:
                await _send_overdue_pushes()
        except Exception:
            pass
        await _aio.sleep(15 * 60)


app = FastAPI(title="Vastgoed Kiosk API", lifespan=lifespan)

cors_origins = os.environ.get("CORS_ORIGINS", "*")
if cors_origins == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in cors_origins.split(",")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

api = APIRouter(prefix="/api")


# =====================================================================
# Auth routes
# =====================================================================
def _set_access_cookie(response: Response, token: str, name="access_token", minutes=ACCESS_MIN):
    response.set_cookie(
        key=name, value=token, httponly=True, secure=False,
        samesite="lax", max_age=minutes * 60, path="/",
    )


def _slugify(name: str) -> str:
    import re
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return s[:40] or "bedrijf"


# Slugs die niet als bedrijfsnaam gebruikt mogen worden — anders botsen ze met
# vaste app-routes (https://app.surirent.sr/<slug>/...). LET OP: deze lijst
# moet gesynchroniseerd blijven met de gereserveerde slugs in
# `frontend/src/lib/branding.js` (`RESERVED_SLUGS`).
RESERVED_SLUGS = {
    # Frontend app-routes
    "login", "admin", "kiosk", "huurder", "onderteken", "c", "vastgoed",
    # Backend / infra paths
    "api", "health", "static", "manifest", "sw", "favicon", "assets",
    # Marketing & meta
    "www", "app", "mail", "ftp", "blog", "support", "docs", "help",
    # Toekomstige uitbreidingen
    "register", "settings", "billing", "checkout", "auth", "logout",
    "tenant", "tenants", "company", "companies", "superadmin",
}


def _validate_slug_or_raise(slug: str) -> str:
    """Normaliseert + valideert een slug. Raise 400 bij ongeldig of gereserveerd."""
    import re
    s = (slug or "").lower().strip()
    if not s:
        raise HTTPException(status_code=400, detail="Slug is verplicht")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,39}", s):
        raise HTTPException(status_code=400, detail="Slug mag alleen letters, cijfers en streepjes bevatten (max 40 tekens)")
    if s in RESERVED_SLUGS:
        raise HTTPException(status_code=400, detail=f"De slug '{s}' is gereserveerd door het platform. Kies een andere.")
    return s


def _detect_country_currency(phone: str) -> tuple:
    """Detect (country, currency) from international phone prefix.
    NL (+31 / 0031) → EUR; everything else falls back to Suriname / SRD."""
    cleaned = (phone or "").strip()
    # Strip everything except digits and leading +
    digits_plus = ""
    for i, ch in enumerate(cleaned):
        if ch == "+" and i == 0:
            digits_plus += ch
        elif ch.isdigit():
            digits_plus += ch
    if digits_plus.startswith("+31") or digits_plus.startswith("0031") or digits_plus.startswith("31") and len(digits_plus) >= 10:
        return "NL", "EUR"
    return "SR", "SRD"


@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="E-mailadres is al in gebruik")

    company_id = None
    company_payload = None

    # Self-serve onboarding: when company_name is provided, create a new tenant.
    if (body.company_name or "").strip():
        base_slug = _slugify(body.company_name)
        # Gereserveerde slugs auto-bypassen door direct te suffixen (registratie
        # mag nooit falen op een randgeval — superadmin kan later wel renamen).
        if base_slug in RESERVED_SLUGS:
            base_slug = f"{base_slug}-bedrijf"
        slug = base_slug
        i = 2
        while await db.companies.find_one({"slug": slug}, {"_id": 1}):
            slug = f"{base_slug}-{i}"
            i += 1
        now = now_utc()
        trial_end = now + timedelta(days=14)
        # Explicit country choice overrides phone-based detection
        if body.country == "NL":
            country, currency = "NL", "EUR"
        elif body.country == "SR":
            country, currency = "SR", "SRD"
        elif body.country == "OTHER":
            country, currency = "OTHER", "SRD"
        else:
            country, currency = _detect_country_currency(body.telefoon)
        c = {
            "id": new_id(),
            "name": body.company_name.strip(),
            "slug": slug,
            "plan": body.plan or "starter",  # selected package
            "billing_status": "trial",       # trial | active | past_due | cancelled
            "trial_started_at": iso(now),
            "trial_ends_at": iso(trial_end),
            "telefoon": (body.telefoon or "").strip(),
            "owner_email": email,
            "country": country,
            "currency": currency,
            "created_at": iso(now),
        }
        await db.companies.insert_one(c)
        company_id = c["id"]
        company_payload = {k: c[k] for k in ("id", "slug", "name", "plan")}

        # Persist kiosk PIN if provided (used for kiosk login)
        if (body.kiosk_pin or "").strip():
            pin = body.kiosk_pin.strip()
            if pin.isdigit() and len(pin) == 4:
                others = await db.kiosk_pins.find({}, {"_id": 0, "pin_hash": 1}).to_list(1000)
                pin_in_use = any(verify_password(pin, o.get("pin_hash", "")) for o in others)
                if not pin_in_use:
                    await db.kiosk_pins.update_one(
                        {"company_id": company_id},
                        {"$set": {"company_id": company_id, "pin_hash": hash_password(pin), "updated_at": iso(now)}},
                        upsert=True,
                    )
    else:
        # Backwards compat: join the default company when company_name is omitted.
        default = await db.companies.find_one({"slug": DEFAULT_COMPANY_SLUG}, {"_id": 0})
        if default:
            company_id = default["id"]
            company_payload = {k: default[k] for k in ("id", "slug", "name", "plan")}

    user_doc = {
        "id": new_id(),
        "email": email,
        "name": body.name.strip(),
        "role": "admin",
        "company_id": company_id,
        "password_hash": hash_password(body.password),
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(user_doc)
    token = create_token({
        "sub": user_doc["id"], "email": email, "type": "access",
        "company_id": company_id, "role": "admin",
    }, ACCESS_MIN)
    _set_access_cookie(response, token)

    # Welcome email — best-effort, never fails registration
    if company_payload:
        try:
            from email_service import send_email as _send_smtp, send_platform_email, wrap_template
            app_url = (os.environ.get("APP_PUBLIC_URL") or "https://app.surirent.sr").rstrip("/")
            slug = c.get("slug")
            login_query_url = f"{app_url}/login?c={slug}"
            plan_info = PLAN_PRICES.get(c.get("plan", "starter"), PLAN_PRICES["starter"])
            pin_row = ""
            if (body.kiosk_pin or "").isdigit() and len(body.kiosk_pin) == 4:
                pin_row = f"<tr><td>Kiosk PIN</td><td>{body.kiosk_pin}</td></tr>"
            sub_block = ""
            # Generate the onboarding PDF + inline QR for the email body
            try:
                qr_png_inline = _make_qr_png(login_query_url, size_px=320)
                qr_block = """
                <p style="margin:18px 0 6px;font-size:13px;color:#475569;text-align:center;">
                  <strong>Scan om direct in te loggen op uw telefoon:</strong>
                </p>
                <p style="text-align:center;margin:0;">
                  <img src="cid:loginqr" alt="QR code" width="200" height="200" style="border:1px solid #e2e8f0;border-radius:12px;padding:6px;background:#fff;" />
                </p>
                """
            except Exception:
                qr_png_inline = None
                qr_block = ""
            try:
                primary_hex = ((c.get("branding") or {}).get("primary_color") or "#FF5C00")
                kiosk_pin_val = body.kiosk_pin if (body.kiosk_pin or "").isdigit() and len(body.kiosk_pin) == 4 else None
                onboarding_pdf_bytes = onboarding_pdf(
                    company_name=company_payload["name"],
                    contact_name=body.name,
                    email=email,
                    plan_name=plan_info["name"],
                    plan_price_text=f"{plan_info['currency']} {int(plan_info['amount']):,}/maand".replace(",", "."),
                    login_url=login_query_url,
                    subdomain_url=None,
                    kiosk_pin=kiosk_pin_val,
                    primary_hex=primary_hex,
                )
            except Exception:
                onboarding_pdf_bytes = None
            content = f"""
                <h1>Welkom bij SuriRent!</h1>
                <p>Uw eigen Vastgoed omgeving is aangemaakt voor
                  <strong>{company_payload['name']}</strong>. U kunt direct inloggen op uw persoonlijke link:</p>
                <p><a href="{login_query_url}" style="display:inline-block;background:#FF5C00;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">Open mijn omgeving</a></p>
                <p style="font-size:12px;color:#64748b;word-break:break-all;">{login_query_url}</p>
                {qr_block}
                {sub_block}

                <h1 style="font-size:16px;margin-top:24px;">Uw inloggegevens</h1>
                <table class="kv">
                  <tr><td>E-mailadres</td><td>{email}</td></tr>
                  <tr><td>Wachtwoord</td><td>(zoals u die heeft ingevoerd)</td></tr>
                  {pin_row}
                </table>

                <h1 style="font-size:16px;margin-top:18px;">Uw pakket</h1>
                <table class="kv">
                  <tr><td>Pakket</td><td>{plan_info['name']}</td></tr>
                  <tr><td>Prijs</td><td>{plan_info['currency']} {int(plan_info['amount']):,}/maand</td></tr>
                  <tr><td>Proefperiode</td><td>14 dagen gratis</td></tr>
                </table>

                <p style="margin-top:18px;">📎 <strong>Bijgevoegd</strong>: een PDF welkomstpakket met alle inloggegevens, QR-code en installatie-instructies voor iOS en Android. Print of bewaar 'm voor uw administratie.</p>
                <p>Tip: <strong>bookmark</strong> de bovenstaande link of installeer hem als app op uw telefoon. Heeft u vragen? Antwoord gerust op deze mail.</p>
            """.replace(",", ".")
            subject = f"Welkom bij SuriRent — uw {plan_info['name']} omgeving is klaar"
            body_html = wrap_template(content, footer=f"SuriRent · {app_url}")

            # Build the attachments list — onboarding PDF + inline QR for HTML <img>
            attachments = []
            if onboarding_pdf_bytes:
                pdf_name = f"SuriRent_welkomstpakket_{(c.get('slug') or 'nieuw').replace('-', '_')}.pdf"
                attachments.append((pdf_name, onboarding_pdf_bytes, "application/pdf"))
            if qr_png_inline:
                # Use Content-ID inline image — referenced via src="cid:loginqr" above.
                # Format: ('loginqr.png', bytes, 'image/png; cid=loginqr; inline').
                attachments.append(("loginqr.png", qr_png_inline, "image/png; cid=loginqr; inline"))
            # Prefer SaaS DB settings, fall back to env-based platform SMTP
            saas = await db.saas_settings.find_one({"id": SAAS_SETTINGS_ID}, {"_id": 0}) or {}
            smtp = saas.get("smtp") or {}
            if smtp.get("enabled") and smtp.get("host"):
                try:
                    await _send_smtp(smtp, to=email, subject=subject, body_html=body_html, attachments=attachments or None)
                except Exception:
                    await send_platform_email(to=email, subject=subject, body_html=body_html, attachments=attachments or None)
            else:
                await send_platform_email(to=email, subject=subject, body_html=body_html, attachments=attachments or None)
        except Exception:
            pass  # never block registration on email failure

    return {
        "token": token,
        "user": {k: user_doc[k] for k in ("id", "email", "name", "role", "company_id", "created_at")},
        "company": company_payload,
    }


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Onjuiste inloggegevens")
    token = create_token({
        "sub": user["id"], "email": email, "type": "access",
        "company_id": user.get("company_id"), "role": user.get("role", "admin"),
    }, ACCESS_MIN)
    _set_access_cookie(response, token)
    company = None
    if user.get("company_id"):
        c = await db.companies.find_one({"id": user["company_id"]}, {"_id": 0})
        if c:
            company = {k: c[k] for k in ("id", "slug", "name", "plan")}
    return {
        "token": token,
        "user": {
            "id": user["id"], "email": user["email"], "name": user["name"],
            "role": user.get("role", "admin"), "company_id": user.get("company_id"),
            "created_at": user["created_at"],
        },
        "company": company,
    }


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("kiosk_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    company = None
    active_id = user.get("active_company_id")
    if active_id:
        c = await db.companies.find_one({"id": active_id}, {"_id": 0})
        if c:
            company = {k: c[k] for k in ("id", "slug", "name", "plan")}
    return {**user, "active_company": company}


# =====================================================================
# Billing — trial status + bank details for offline payments
# =====================================================================
PLAN_PRICES = {
    "starter": {"name": "Starter", "amount": 3000, "currency": "SRD", "interval": "month",
                "description": "Voor kleinere vastgoedbeheerders.",
                "features": ["Onbeperkt appartementen", "Online betalen", "WhatsApp & E-mail"]},
    "professional": {"name": "Professional", "amount": 5000, "currency": "SRD", "interval": "month",
                     "description": "Met Kiosk terminal en alle functies.",
                     "features": ["Alles uit Starter", "Kiosk terminal", "Shelly stroombeheer", "Prioriteit support"]},
}


@api.get("/billing/plans")
async def list_plans(phone: Optional[str] = None, currency: Optional[str] = None):
    """Public plan catalog — used by landing + registration flow.
    Currency resolution: explicit ?currency=EUR/SRD > ?phone=... auto-detect > SRD default."""
    want = (currency or "").upper()
    if not want and phone:
        _, want = _detect_country_currency(phone)
    if want == "EUR":
        fx = await _get_eur_per_srd()
        out = []
        for k, v in PLAN_PRICES.items():
            eur_amount = _convert_to_eur(v["amount"], v["currency"], fx["rate"])
            out.append({"id": k, **v, "amount": eur_amount, "currency": "EUR",
                        "original_amount": v["amount"], "original_currency": "SRD"})
        return out
    return [{"id": k, **v} for k, v in PLAN_PRICES.items()]


@api.get("/billing/me")
async def billing_me(user=Depends(get_current_user)):
    """Trial / subscription status for the current admin's company."""
    cid = company_id_of(user)
    if not cid:
        return {"status": "none"}
    c = await db.companies.find_one({"id": cid}, {"_id": 0}) or {}
    plan_id = c.get("plan", "starter")
    plan = await _plan_for_company(plan_id, c)
    status = c.get("billing_status", "active")
    days_left = None
    trial_ends = c.get("trial_ends_at")
    if trial_ends:
        try:
            end = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
            delta = end - now_utc()
            days_left = max(0, int(delta.total_seconds() // 86400) + (1 if delta.total_seconds() % 86400 > 0 else 0))
        except Exception:
            days_left = None
    if status == "trial" and days_left is not None and days_left <= 0:
        status = "expired"

    pending_plan_id = c.get("pending_plan")
    pending_plan = (await _plan_for_company(pending_plan_id, c)) if pending_plan_id else None
    pending_invoice = None
    if c.get("pending_invoice_id"):
        pending_invoice = await db.subscription_invoices.find_one(
            {"id": c["pending_invoice_id"]}, {"_id": 0}
        )
    return {
        "status": status,
        "plan_id": plan_id,
        "plan": plan,
        "trial_started_at": c.get("trial_started_at"),
        "trial_ends_at": trial_ends,
        "days_left": days_left,
        "monthly_amount": plan["amount"],
        "currency": plan["currency"],
        "country": c.get("country"),
        "pending_plan_id": pending_plan_id,
        "pending_plan": pending_plan,
        "pending_invoice": pending_invoice,
        "renews_at": c.get("subscription_renews_at"),
    }


@api.get("/billing/me/plans")
async def billing_me_plans(user=Depends(get_current_user)):
    """Plans in the current company's display currency (SRD for SR, EUR for NL)."""
    cid = company_id_of(user)
    c = await db.companies.find_one({"id": cid}, {"_id": 0}) if cid else {}
    out = []
    for pid in PLAN_PRICES.keys():
        p = await _plan_for_company(pid, c or {})
        out.append({"id": pid, **p})
    return out


class ChangePlanIn(BaseModel):
    plan: Literal["starter", "professional"]


@api.put("/billing/me/plan")
async def change_plan(body: ChangePlanIn, user=Depends(get_current_user)):
    """Customer-driven plan upgrade/downgrade.

    Creates an invoice for the new plan and sets pending_plan on the company.
    The actual plan switch happens only after a superadmin registers payment
    for that invoice. During trial the new plan becomes the trial-pricing plan."""
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf")
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    old = c.get("plan", "starter")
    new_plan = body.plan
    if new_plan == old and not c.get("pending_plan"):
        return {"ok": True, "plan": new_plan, "effective": "already_active"}

    new_price = await _plan_for_company(new_plan, c)
    now = now_utc()

    # Create an open invoice for the new plan (customer must pay this to activate)
    inv = {
        "id": new_id(),
        "company_id": cid,
        "company_name": c.get("name", ""),
        "plan": new_plan,
        "amount": new_price["amount"],
        "currency": new_price["currency"],
        "status": "open",
        "kind": "plan_change",
        "from_plan": old,
        "period_start": iso(now),
        "period_end": iso(now + timedelta(days=30)),
        "created_at": iso(now),
        "created_by": user.get("email"),
    }
    await db.subscription_invoices.insert_one(inv)
    inv.pop("_id", None)

    await db.companies.update_one({"id": cid}, {"$set": {
        "pending_plan": new_plan,
        "pending_invoice_id": inv["id"],
        "plan_change_requested_at": iso(now),
    }})
    await db.audit_log.insert_one({
        "id": new_id(), "type": "plan_change_requested",
        "actor": user.get("email"), "company_id": cid,
        "from_plan": old, "to_plan": new_plan, "invoice_id": inv["id"], "at": iso(now),
    })
    return {
        "ok": True, "plan": old, "pending_plan": new_plan, "invoice": inv,
        "effective": "after_payment",
        "message": f"Maak {new_price['currency']} {new_price['amount']:,} over om over te stappen naar {new_price['name']}.".replace(",", "."),
    }


@api.get("/billing/me/invoices")
async def my_invoices(user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        return []
    docs = await db.subscription_invoices.find({"company_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@api.get("/billing/me/payments")
async def my_payments(user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        return []
    docs = await db.subscription_payments.find({"company_id": cid}, {"_id": 0}).sort("paid_at", -1).to_list(200)
    return docs


@api.get("/billing/bank-details")
async def billing_bank_details():
    """Public bank details for offline / wire transfer subscription payments.
    Reads from saas_settings first, falls back to env vars."""
    doc = await db.saas_settings.find_one({"id": SAAS_SETTINGS_ID}, {"_id": 0}) or {}
    b = (doc.get("banking") or {}) if doc else {}
    return {
        "bank_name": b.get("bank_name") or os.environ.get("BILLING_BANK_NAME", "DSB Bank N.V."),
        "account_name": b.get("account_name") or os.environ.get("BILLING_ACCOUNT_NAME", "SuriRent N.V."),
        "account_number": b.get("account_number") or os.environ.get("BILLING_ACCOUNT_NUMBER", "12.34.56.789"),
        "swift": b.get("swift") or os.environ.get("BILLING_SWIFT", "DSBBSRPA"),
        "reference_template": "ABONNEMENT — <BEDRIJF> — <PERIODE>",
        "currency": "SRD",
        "support_email": b.get("support_email") or os.environ.get("BILLING_SUPPORT_EMAIL", "billing@surirent.sr"),
        "whatsapp": b.get("whatsapp") or os.environ.get("BILLING_WHATSAPP", "+597 8 555 0123"),
    }


# =====================================================================
# Billing — FX (SRD -> EUR) + online checkout (Mope SaaS + SumUp)
# =====================================================================
SAAS_SETTINGS_ID = "_saas_settings"  # forward decl; redefined later for safety
FX_CACHE_TTL_SECONDS = 6 * 3600
FX_SOURCE_URL = "https://open.er-api.com/v6/latest/SRD"


async def _fetch_fx_eur_per_srd() -> Optional[float]:
    """Fetch live SRD->EUR rate from free public API. Returns None on failure."""
    import httpx as _httpx
    try:
        async with _httpx.AsyncClient(timeout=8) as client:
            r = await client.get(FX_SOURCE_URL)
        if r.status_code >= 400:
            return None
        data = r.json()
        rate = (data.get("rates") or {}).get("EUR")
        if not rate or rate <= 0:
            return None
        return float(rate)
    except Exception:
        return None


async def _get_eur_per_srd() -> dict:
    """Return current SRD->EUR rate based on saas_settings.fx mode (auto|manual).
    Auto refreshes from public API every FX_CACHE_TTL_SECONDS; falls back to manual."""
    doc = await db.saas_settings.find_one({"id": SAAS_SETTINGS_ID}, {"_id": 0}) or {}
    fx = doc.get("fx") or {}
    mode = fx.get("mode", "auto")
    manual = float(fx.get("manual_eur_per_srd") or 0)
    cached_rate = float(fx.get("cached_rate") or 0)
    cached_at = fx.get("cached_at")
    cached_age = None
    if cached_at:
        try:
            cached_age = (now_utc() - datetime.fromisoformat(cached_at.replace("Z", "+00:00"))).total_seconds()
        except Exception:
            cached_age = None

    if mode == "manual":
        if manual > 0:
            return {"rate": manual, "source": "manual", "fetched_at": fx.get("cached_at")}
        # Manual selected but no value → fall back to last cached or 0
        if cached_rate > 0:
            return {"rate": cached_rate, "source": "manual_fallback_cache", "fetched_at": cached_at}
        return {"rate": 0, "source": "manual_missing", "fetched_at": None}

    # Auto mode
    if cached_rate > 0 and cached_age is not None and cached_age < FX_CACHE_TTL_SECONDS:
        return {"rate": cached_rate, "source": "cache", "fetched_at": cached_at}
    live = await _fetch_fx_eur_per_srd()
    if live and live > 0:
        await db.saas_settings.update_one(
            {"id": SAAS_SETTINGS_ID},
            {"$set": {
                "id": SAAS_SETTINGS_ID,
                "fx.mode": "auto",
                "fx.cached_rate": live,
                "fx.cached_at": iso(now_utc()),
            }},
            upsert=True,
        )
        return {"rate": live, "source": "live", "fetched_at": iso(now_utc())}
    # Live failed → use last cache if any, else manual
    if cached_rate > 0:
        return {"rate": cached_rate, "source": "stale_cache", "fetched_at": cached_at}
    if manual > 0:
        return {"rate": manual, "source": "manual_fallback", "fetched_at": None}
    return {"rate": 0, "source": "unavailable", "fetched_at": None}


def _convert_to_eur(amount: float, currency: str, rate_eur_per_srd: float) -> float:
    if (currency or "").upper() == "EUR":
        return round(float(amount), 2)
    if (currency or "").upper() == "SRD" and rate_eur_per_srd > 0:
        return round(float(amount) * rate_eur_per_srd, 2)
    # USD / other: not yet supported — return 0 to signal unavailable
    return 0.0


def _company_display_currency(c: dict) -> str:
    """Returns the currency the company should see prices in."""
    return ((c or {}).get("currency") or "SRD").upper()


async def _plan_for_company(plan_id: str, c: dict) -> dict:
    """Return plan dict with amount converted to company's display currency."""
    base = PLAN_PRICES.get(plan_id, PLAN_PRICES["starter"])
    target = _company_display_currency(c)
    if target == base["currency"]:
        return {**base}
    if target == "EUR" and base["currency"] == "SRD":
        fx = await _get_eur_per_srd()
        eur_amount = _convert_to_eur(base["amount"], "SRD", fx["rate"])
        return {**base, "amount": eur_amount, "currency": "EUR",
                "original_amount": base["amount"], "original_currency": "SRD",
                "eur_per_srd": fx["rate"], "fx_source": fx["source"]}
    return {**base}


@api.get("/billing/fx")
async def billing_fx():
    """Public FX info — used by frontend to show EUR equivalent for SRD invoices."""
    info = await _get_eur_per_srd()
    return {"eur_per_srd": info["rate"], "source": info["source"], "fetched_at": info.get("fetched_at")}


async def _saas_settings_doc() -> dict:
    return await db.saas_settings.find_one({"id": SAAS_SETTINGS_ID}, {"_id": 0}) or {}


def _app_base_url() -> str:
    return (os.environ.get("APP_PUBLIC_URL") or "https://app.surirent.sr").rstrip("/")


def _api_base_url() -> str:
    # APP_PUBLIC_URL is reused — backend routes share host via /api prefix in preview/prod
    return _app_base_url()


@api.get("/billing/me/checkout-options")
async def billing_me_checkout_options(user=Depends(get_current_user)):
    """Returns which gateways are configured for SaaS subscription payments,
    plus the amount in the company's display currency.
    Gateways are filtered by display currency:
      - SRD companies: Mope only (SRD)
      - EUR companies: SumUp only (EUR)
    """
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf")
    c = await db.companies.find_one({"id": cid}, {"_id": 0}) or {}
    plan = await _plan_for_company(c.get("plan", "starter"), c)
    display_currency = _company_display_currency(c)
    fx = await _get_eur_per_srd()
    doc = await _saas_settings_doc()
    mope = doc.get("mope") or {}
    sumup = doc.get("sumup") or {}
    mope_creds_ok = bool(mope.get("enabled")) and bool((mope.get("api_key") or "").strip())
    sumup_creds_ok = (bool(sumup.get("enabled"))
                      and bool((sumup.get("api_key") or "").strip())
                      and bool((sumup.get("merchant_code") or "").strip()))
    return {
        "amount": plan["amount"],
        "currency": plan["currency"],
        "display_currency": display_currency,
        "country": c.get("country"),
        "eur_amount": plan["amount"] if display_currency == "EUR" else _convert_to_eur(plan["amount"], plan["currency"], fx["rate"]),
        "eur_per_srd": fx["rate"],
        "fx_source": fx["source"],
        "mope": {
            "enabled": mope_creds_ok and display_currency == "SRD",
            "test_mode": bool(mope.get("test_mode", True)),
        },
        "sumup": {
            "enabled": sumup_creds_ok and display_currency == "EUR",
            "test_mode": bool(sumup.get("test_mode", True)),
            "eur_amount": plan["amount"] if display_currency == "EUR" else _convert_to_eur(plan["amount"], plan["currency"], fx["rate"]),
        },
    }


class SaasCheckoutIn(BaseModel):
    invoice_id: Optional[str] = None  # optional — falls back to first open invoice for this company
    provider: Literal["mope", "sumup"]


async def _ensure_open_invoice_for_company(c: dict, user_email: str) -> dict:
    """Find an open invoice for this company; if none, create one for the current plan
    (so a customer in trial / expired state can pay even before any invoice was issued).
    Invoice is denominated in the company's display currency (SRD for SR, EUR for NL)."""
    cid = c["id"]
    inv = await db.subscription_invoices.find_one(
        {"company_id": cid, "status": {"$ne": "paid"}},
        {"_id": 0}, sort=[("created_at", -1)],
    )
    if inv:
        return inv
    plan_id = c.get("plan", "starter")
    plan = await _plan_for_company(plan_id, c)
    now = now_utc()
    inv = {
        "id": new_id(),
        "company_id": cid,
        "company_name": c.get("name", ""),
        "plan": plan_id,
        "amount": plan["amount"],
        "currency": plan["currency"],
        "status": "open",
        "kind": "subscription",
        "period_start": iso(now),
        "period_end": iso(now + timedelta(days=30)),
        "created_at": iso(now),
        "created_by": user_email or "self_checkout",
    }
    await db.subscription_invoices.insert_one(inv)
    inv.pop("_id", None)
    return inv


@api.post("/billing/me/checkout")
async def billing_me_checkout(body: SaasCheckoutIn, user=Depends(get_current_user)):
    """Tenant-initiated checkout for the SaaS subscription invoice.
    Provider: mope (SRD) or sumup (EUR). Returns the redirect URL."""
    from payments_service import (
        mope_create_payment_request, sumup_create_checkout, GatewayError,
    )
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf")
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")

    if body.invoice_id:
        inv = await db.subscription_invoices.find_one({"id": body.invoice_id, "company_id": cid}, {"_id": 0})
        if not inv:
            raise HTTPException(status_code=404, detail="Factuur niet gevonden")
        if inv.get("status") == "paid":
            raise HTTPException(status_code=400, detail="Deze factuur is al voldaan")
    else:
        inv = await _ensure_open_invoice_for_company(c, user.get("email", ""))

    doc = await _saas_settings_doc()
    app_url = (doc.get("branding") or {}).get("app_url") or _app_base_url()
    api_url = _api_base_url()
    redirect_url = f"{app_url}/admin?tab=mijn_abonnement&checkout=done"
    description = f"SuriRent abonnement — {(c.get('name') or '')[:40]}"

    if body.provider == "mope":
        cfg = (doc.get("mope") or {})
        if not cfg.get("enabled") or not (cfg.get("api_key") or "").strip():
            raise HTTPException(status_code=400, detail="Mope is niet ingeschakeld onder SaaS Instellingen.")
        try:
            res = await mope_create_payment_request(
                cfg,
                description=description,
                amount=float(inv["amount"]),
                currency=inv["currency"],
                order_id=inv["id"],
                redirect_url=redirect_url,
            )
        except GatewayError as e:
            raise HTTPException(status_code=502, detail=str(e))
        pr = {
            "id": new_id(),
            "invoice_id": inv["id"],
            "company_id": cid,
            "provider": "mope",
            "provider_id": str(res["id"]),
            "amount": float(inv["amount"]),
            "currency": inv["currency"],
            "url": res["url"],
            "status": "open",
            "created_at": iso(now_utc()),
            "created_by": user.get("email"),
        }
        await db.saas_payment_requests.insert_one(pr)
        pr.pop("_id", None)
        return {"url": res["url"], "provider": "mope", "amount": pr["amount"], "currency": pr["currency"]}

    # SumUp (EUR)
    cfg = (doc.get("sumup") or {})
    if not cfg.get("enabled") or not (cfg.get("api_key") or "").strip() or not (cfg.get("merchant_code") or "").strip():
        raise HTTPException(status_code=400, detail="SumUp is niet ingeschakeld onder SaaS Instellingen.")
    fx = await _get_eur_per_srd()
    eur_amount = _convert_to_eur(inv["amount"], inv["currency"], fx["rate"])
    if eur_amount <= 0:
        raise HTTPException(status_code=400, detail="EUR-bedrag kon niet bepaald worden (wisselkoers ontbreekt).")
    try:
        res = await sumup_create_checkout(
            cfg,
            description=description,
            amount_eur=eur_amount,
            checkout_reference=f"saas_inv_{inv['id']}",
            redirect_url=redirect_url,
            return_url=f"{api_url}/api/webhooks/sumup-saas",
        )
    except GatewayError as e:
        raise HTTPException(status_code=502, detail=str(e))
    pr = {
        "id": new_id(),
        "invoice_id": inv["id"],
        "company_id": cid,
        "provider": "sumup",
        "provider_id": str(res["id"]),
        "amount": eur_amount,
        "currency": "EUR",
        "amount_srd_equivalent": float(inv["amount"]) if (inv["currency"] or "").upper() == "SRD" else None,
        "eur_per_srd": fx["rate"],
        "url": res["hosted_checkout_url"],
        "status": "open",
        "created_at": iso(now_utc()),
        "created_by": user.get("email"),
    }
    await db.saas_payment_requests.insert_one(pr)
    pr.pop("_id", None)
    return {"url": res["hosted_checkout_url"], "provider": "sumup", "amount": eur_amount, "currency": "EUR"}



async def _record_saas_payment_manual(
    *, invoice: dict, company: dict, amount: float, currency: str,
    method: str, reference: str, statement_id: Optional[str],
    ocr_meta: Optional[dict], auto_approved: bool, approved_by: str,
) -> dict:
    """Helper voor handmatige (bankoverschrijving) SaaS-betalingen. Maakt
    `saas_payment_requests` + `subscription_payments` aan en activeert het
    bedrijf wanneer auto-goedgekeurd. Idempotent op invoice_id wanneer al
    betaald."""
    if invoice.get("status") == "paid":
        return {"already_paid": True, "invoice_id": invoice["id"]}
    now = now_utc()
    paid_at = iso(now)
    pr_id = new_id()
    pr = {
        "id": pr_id,
        "company_id": company["id"],
        "invoice_id": invoice["id"],
        "provider": method,
        "provider_id": f"manual:{pr_id[:8]}",
        "amount": amount,
        "currency": currency,
        "status": "paid" if auto_approved else "pending_approval",
        "bank_statement_id": statement_id,
        "ocr": ocr_meta or {},
        "auto_approved": auto_approved,
        "approved_by": approved_by,
        "created_at": paid_at,
        "paid_at": paid_at if auto_approved else None,
    }
    await db.saas_payment_requests.insert_one(pr)
    if not auto_approved:
        # OCR mismatch — superadmin moet handmatig goedkeuren.
        return {"status": "pending_approval", "invoice_id": invoice["id"], "request_id": pr_id, "ocr": ocr_meta or {}}
    # Mark invoice paid
    await db.subscription_invoices.update_one(
        {"id": invoice["id"]},
        {"$set": {"status": "paid", "paid_at": paid_at, "payment_method": method}},
    )
    # Subscription payment record
    pay = {
        "id": new_id(),
        "invoice_id": invoice["id"],
        "company_id": company["id"],
        "company_name": company.get("name", ""),
        "amount": amount,
        "currency": currency,
        "method": method,
        "reference": reference,
        "note": "Auto-goedgekeurd na OCR-controle van bankafschrift" if auto_approved else "",
        "paid_at": paid_at,
        "created_at": paid_at,
        "created_by": approved_by,
        "auto_approved": auto_approved,
        "bank_statement_id": statement_id,
    }
    await db.subscription_payments.insert_one(pay)
    await _activate_company_after_saas_payment(company["id"], plan_in_payment=invoice.get("plan"))
    await _send_saas_payment_email(company, amount, currency, method, invoice["id"])
    return {"status": "paid", "invoice_id": invoice["id"], "request_id": pr_id, "ocr": ocr_meta or {}}


@api.post("/billing/me/bank-confirm")
async def billing_me_bank_confirm(
    file: UploadFile = File(...),
    invoice_id: Optional[str] = Form(None),
    user=Depends(get_current_user),
):
    """Admin upload bankafschrift voor zijn lopende abonnement-factuur. Wij:
      1. Slaan het bestand op in `bank_statements` (5 MB max, jpg/png/pdf/webp).
      2. Sturen direct door naar Gemini-OCR voor amount/date/reference-extractie.
      3. Als bedrag/valuta matcht met de open factuur → auto-goedkeuren →
         abonnement wordt direct geactiveerd.
      4. Bij mismatch → status `pending_approval`, superadmin krijgt notificatie.

    Returns: `{status: 'paid'|'pending_approval', ocr: {...}, invoice_id, mismatch_reasons?}`
    """
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf")
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    raw = await file.read()
    if len(raw) > MAX_LANDING_ASSET_BYTES:
        raise HTTPException(status_code=413, detail="Bestand groter dan 5 MB")
    ctype = (file.content_type or "").lower()
    allowed = ("image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf")
    if not any(ctype.startswith(a) or ctype == a for a in allowed):
        raise HTTPException(status_code=400, detail="Alleen JPG, PNG, WEBP of PDF toegestaan")

    # Vind of maak open factuur
    if invoice_id:
        inv = await db.subscription_invoices.find_one(
            {"id": invoice_id, "company_id": cid}, {"_id": 0},
        )
        if not inv:
            raise HTTPException(status_code=404, detail="Factuur niet gevonden")
        if inv.get("status") == "paid":
            raise HTTPException(status_code=400, detail="Deze factuur is al betaald")
    else:
        inv = await _ensure_open_invoice_for_company(c, user.get("email", ""))

    # Sla statement op
    asset_id = new_id()
    await db.bank_statements.insert_one({
        "id": asset_id,
        "filename": file.filename or f"saas-afschrift-{asset_id}",
        "content_type": ctype,
        "data_b64": base64.b64encode(raw).decode("ascii"),
        "size": len(raw),
        "company_id": cid,
        "kind": "saas_billing",
        "invoice_id": inv["id"],
        "uploaded_at": iso(now_utc()),
        "uploaded_by": user.get("email"),
    })

    # OCR + match-check synchroon — gebruiker krijgt direct feedback.
    ocr_meta: dict = {}
    auto_approved = False
    mismatch_reasons: list[str] = []
    try:
        ocr = await _ocr_bank_statement(asset_id)
        ok, reasons = _ocr_match_ok(
            ocr,
            expected_amount=float(inv.get("amount") or 0),
            expected_currency=inv.get("currency") or "SRD",
        )
        ocr_meta = {
            "amount": ocr.get("amount"),
            "currency": ocr.get("currency"),
            "date_iso": ocr.get("date_iso"),
            "payer_name": ocr.get("payer_name"),
            "reference": ocr.get("reference"),
            "confidence": ocr.get("confidence"),
            "raw_text": (ocr.get("raw_text") or "")[:300],
        }
        auto_approved = ok
        mismatch_reasons = reasons
    except Exception as e:
        # OCR-engine niet bereikbaar → veilig: laat het als pending_approval staan
        # zodat superadmin handmatig kan controleren. Frontend toont dat netjes.
        print(f"[saas-ocr] faalde voor invoice={inv['id'][:8]}: {e}")
        mismatch_reasons = [f"OCR engine fout: {str(e)[:120]}"]

    result = await _record_saas_payment_manual(
        invoice=inv,
        company=c,
        amount=float(inv.get("amount") or 0),
        currency=inv.get("currency") or "SRD",
        method="bank",
        reference=f"ABONNEMENT — {c.get('name', '')} — {inv.get('id', '')[:8]}",
        statement_id=asset_id,
        ocr_meta=ocr_meta,
        auto_approved=auto_approved,
        approved_by="auto-ocr" if auto_approved else (user.get("email") or "self"),
    )
    if not auto_approved and mismatch_reasons:
        result["mismatch_reasons"] = mismatch_reasons
    return result




async def _activate_company_after_saas_payment(company_id: str, plan_in_payment: Optional[str] = None):
    """Shared post-payment routine: bumps company to active + applies pending plan."""
    c = await db.companies.find_one({"id": company_id}, {"_id": 0}) or {}
    now = now_utc()
    update = {
        "billing_status": "active",
        "subscription_started_at": c.get("subscription_started_at") or iso(now),
        "subscription_renews_at": iso(now + timedelta(days=30)),
    }
    pending = c.get("pending_plan")
    if pending and pending != c.get("plan"):
        update["plan"] = pending
        update["pending_plan"] = None
        update["pending_invoice_id"] = None
        update["plan_changed_at"] = iso(now)
    elif plan_in_payment and plan_in_payment != c.get("plan"):
        update["plan"] = plan_in_payment
    await db.companies.update_one({"id": company_id}, {"$set": update})


async def _send_saas_payment_email(company: dict, amount: float, currency: str, method: str, invoice_id: str):
    if not company.get("owner_email"):
        return
    try:
        from email_service import send_email as _send_smtp, send_platform_email, wrap_template
        saas = await _saas_settings_doc()
        smtp = saas.get("smtp") or {}
        app_url = (saas.get("branding") or {}).get("app_url") or _app_base_url()
        plan_label = PLAN_PRICES.get(company.get("plan", "starter"), {}).get("name", "Starter")
        content = f"""
            <h1>Betaling ontvangen — bedankt!</h1>
            <p>Wij hebben uw betaling van <strong>{currency} {float(amount):,.2f}</strong> ontvangen via {method}.</p>
            <table class="kv">
              <tr><td>Pakket</td><td>{plan_label}</td></tr>
              <tr><td>Factuur</td><td>{invoice_id[:8].upper()}</td></tr>
            </table>
            <p style="margin-top:14px;">Uw abonnement is direct geactiveerd:</p>
            <p><a href="{app_url}/admin" style="display:inline-block;background:#10B981;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:700;">Open dashboard</a></p>
        """
        subject = f"Betaling ontvangen — {plan_label} actief"
        body_html = wrap_template(content, footer=f"SuriRent · {app_url}")
        if smtp.get("enabled") and smtp.get("host"):
            try:
                await _send_smtp(smtp, to=company["owner_email"], subject=subject, body_html=body_html)
            except Exception:
                await send_platform_email(to=company["owner_email"], subject=subject, body_html=body_html)
        else:
            await send_platform_email(to=company["owner_email"], subject=subject, body_html=body_html)
    except Exception:
        pass


async def _record_saas_payment_from_gateway(pr: dict, gateway_meta: dict) -> dict:
    """Idempotently mark a SaaS payment_request + linked invoice as paid, create
    a subscription_payment record, and activate the company."""
    if pr.get("status") == "paid":
        return pr
    inv = await db.subscription_invoices.find_one({"id": pr["invoice_id"]}, {"_id": 0})
    if not inv:
        return pr
    now = now_utc()
    paid_at = iso(now)
    company = await db.companies.find_one({"id": pr["company_id"]}, {"_id": 0}) or {}

    # Mark request paid
    await db.saas_payment_requests.update_one(
        {"id": pr["id"]},
        {"$set": {"status": "paid", "paid_at": paid_at, "gateway_meta": gateway_meta}},
    )
    # Mark invoice paid
    if inv.get("status") != "paid":
        await db.subscription_invoices.update_one(
            {"id": inv["id"]},
            {"$set": {"status": "paid", "paid_at": paid_at, "payment_method": pr["provider"]}},
        )
    # Create subscription_payment record
    pay = {
        "id": new_id(),
        "invoice_id": inv["id"],
        "company_id": pr["company_id"],
        "company_name": company.get("name", ""),
        "amount": pr["amount"],
        "currency": pr["currency"],
        "method": pr["provider"],
        "reference": f"{pr['provider']}:{pr['provider_id']}",
        "note": "Auto-registered via gateway webhook",
        "paid_at": paid_at,
        "created_at": paid_at,
        "created_by": "webhook",
        "amount_srd_equivalent": pr.get("amount_srd_equivalent"),
        "eur_per_srd": pr.get("eur_per_srd"),
    }
    await db.subscription_payments.insert_one(pay)
    # Activate company
    await _activate_company_after_saas_payment(pr["company_id"], plan_in_payment=inv.get("plan"))
    # Confirmation email (best-effort)
    await _send_saas_payment_email(company, pr["amount"], pr["currency"], pr["provider"], inv["id"])
    pr.update({"status": "paid", "paid_at": paid_at})
    return pr


@api.post("/webhooks/mope-saas")
async def mope_saas_webhook(request: Request):
    """Webhook for SaaS-level Mope payments (subscription billing).
    Separate from the per-company kiosk Mope webhook at /api/webhooks/mope."""
    from payments_service import mope_get_payment_request, GatewayError
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    pr_provider_id = (body or {}).get("id")
    if not pr_provider_id:
        raise HTTPException(status_code=400, detail="Missing id")
    pr = await db.saas_payment_requests.find_one(
        {"provider_id": str(pr_provider_id), "provider": "mope"}, {"_id": 0}
    )
    if not pr:
        return {"ok": True, "ignored": True}
    doc = await _saas_settings_doc()
    cfg = doc.get("mope") or {}
    expected_token = (cfg.get("api_key") or "").strip()
    auth_header = request.headers.get("authorization", "")
    sent_token = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else ""
    if expected_token and sent_token and sent_token != expected_token:
        raise HTTPException(status_code=401, detail="Invalid webhook token")
    try:
        remote = await mope_get_payment_request(cfg, pr_provider_id)
    except GatewayError:
        return {"ok": True, "queued": True}
    if (remote or {}).get("status") == "paid":
        await _record_saas_payment_from_gateway(pr, remote)
    else:
        await db.saas_payment_requests.update_one(
            {"id": pr["id"]}, {"$set": {"status": remote.get("status", pr["status"]), "gateway_meta": remote}}
        )
    return {"ok": True, "status": remote.get("status")}


@api.post("/webhooks/sumup-saas")
async def sumup_saas_webhook(request: Request):
    """SumUp webhook for SaaS subscriptions. Payload: {event_type, id}.
    See: https://developer.sumup.com/online-payments/webhooks/"""
    from payments_service import sumup_get_checkout, GatewayError
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    event_type = (body or {}).get("event_type")
    checkout_id = (body or {}).get("id")
    if not checkout_id:
        raise HTTPException(status_code=400, detail="Missing id")
    if event_type and event_type != "CHECKOUT_STATUS_CHANGED":
        return {"ok": True, "ignored": True}
    pr = await db.saas_payment_requests.find_one(
        {"provider_id": str(checkout_id), "provider": "sumup"}, {"_id": 0}
    )
    if not pr:
        return {"ok": True, "ignored": True}
    doc = await _saas_settings_doc()
    cfg = doc.get("sumup") or {}
    try:
        remote = await sumup_get_checkout(cfg, str(checkout_id))
    except GatewayError:
        return {"ok": True, "queued": True}
    status_val = (remote or {}).get("status", "").upper()
    # Validate amount/currency match to prevent stale/forged webhook from auto-marking paid
    try:
        if status_val == "PAID":
            if float(remote.get("amount") or 0) + 0.01 < float(pr["amount"]) - 0.01:
                return {"ok": True, "ignored": True, "reason": "amount mismatch"}
            if (remote.get("currency") or "").upper() != "EUR":
                return {"ok": True, "ignored": True, "reason": "currency mismatch"}
            await _record_saas_payment_from_gateway(pr, remote)
        else:
            await db.saas_payment_requests.update_one(
                {"id": pr["id"]}, {"$set": {"status": status_val.lower() or pr["status"], "gateway_meta": remote}}
            )
    except Exception:
        return {"ok": True, "error": True}
    return {"ok": True, "status": status_val}


# =====================================================================
# Landing-page CMS (superadmin live editor)
# =====================================================================
MAX_LANDING_ASSET_BYTES = 5 * 1024 * 1024  # 5 MB upload cap


@api.get("/landing/content")
async def get_landing_content():
    """Public — returns the *published* landing content merged with defaults."""
    doc = await db.landing_content.find_one({"id": PUBLISHED_ID}, {"_id": 0})
    content = merge_with_defaults(doc)
    return {"content": content, "allowed_icons": ALLOWED_FEATURE_ICONS}


@api.get("/superadmin/landing/content")
async def get_landing_content_admin(mode: Literal["draft", "published"] = "draft",
                                    user=Depends(require_role("superadmin"))):
    """Superadmin reads draft or published content (both merged with defaults)."""
    doc_id = DRAFT_ID if mode == "draft" else PUBLISHED_ID
    doc = await db.landing_content.find_one({"id": doc_id}, {"_id": 0})
    # If no draft yet, seed from published; if no published either, defaults.
    if mode == "draft" and not doc:
        pub = await db.landing_content.find_one({"id": PUBLISHED_ID}, {"_id": 0})
        if pub:
            doc = pub
    content = merge_with_defaults(doc)
    return {
        "content": content,
        "defaults": LANDING_DEFAULTS,
        "allowed_icons": ALLOWED_FEATURE_ICONS,
        "has_unpublished_changes": await _landing_has_unpublished_changes(),
        "updated_at": (doc or {}).get("updated_at"),
        "published_at": (await db.landing_content.find_one({"id": PUBLISHED_ID}, {"_id": 0}) or {}).get("updated_at"),
    }


async def _landing_has_unpublished_changes() -> bool:
    draft = await db.landing_content.find_one({"id": DRAFT_ID}, {"_id": 0, "content": 1})
    pub = await db.landing_content.find_one({"id": PUBLISHED_ID}, {"_id": 0, "content": 1})
    if not draft:
        return False
    return (draft.get("content") or {}) != ((pub or {}).get("content") or {})


class LandingContentIn(BaseModel):
    content: dict


@api.put("/superadmin/landing/content")
async def put_landing_content(body: LandingContentIn,
                               user=Depends(require_role("superadmin"))):
    """Save edits to the *draft*. Use POST /publish to make them public."""
    if not isinstance(body.content, dict):
        raise HTTPException(status_code=400, detail="content moet een object zijn")
    await db.landing_content.update_one(
        {"id": DRAFT_ID},
        {"$set": {
            "id": DRAFT_ID,
            "content": body.content,
            "updated_at": iso(now_utc()),
            "updated_by": user.get("email"),
        }},
        upsert=True,
    )
    return {"ok": True, "has_unpublished_changes": await _landing_has_unpublished_changes()}


@api.post("/superadmin/landing/publish")
async def publish_landing(user=Depends(require_role("superadmin"))):
    """Copy current draft into the published document."""
    draft = await db.landing_content.find_one({"id": DRAFT_ID}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=400, detail="Geen concept om te publiceren.")
    await db.landing_content.update_one(
        {"id": PUBLISHED_ID},
        {"$set": {
            "id": PUBLISHED_ID,
            "content": draft.get("content", {}),
            "updated_at": iso(now_utc()),
            "updated_by": user.get("email"),
            "published_from_draft_at": draft.get("updated_at"),
        }},
        upsert=True,
    )
    await db.audit_log.insert_one({
        "id": new_id(), "type": "landing_published",
        "actor": user.get("email"), "at": iso(now_utc()),
    })
    return {"ok": True, "published_at": iso(now_utc())}


@api.post("/superadmin/landing/discard")
async def discard_landing_draft(user=Depends(require_role("superadmin"))):
    """Reset the draft to match the published content (undo pending edits)."""
    pub = await db.landing_content.find_one({"id": PUBLISHED_ID}, {"_id": 0})
    await db.landing_content.update_one(
        {"id": DRAFT_ID},
        {"$set": {
            "id": DRAFT_ID,
            "content": (pub or {}).get("content", {}),
            "updated_at": iso(now_utc()),
            "updated_by": user.get("email"),
        }},
        upsert=True,
    )
    return {"ok": True}


@api.post("/superadmin/landing/upload")
async def upload_landing_asset(file: UploadFile = File(...),
                                user=Depends(require_role("superadmin"))):
    """Upload an image (max 5 MB). Returns {url, id} where url is
    /api/landing/asset/{id} and can be saved into any image_url field."""
    raw = await file.read()
    if len(raw) > MAX_LANDING_ASSET_BYTES:
        raise HTTPException(status_code=413, detail="Bestand groter dan 5 MB.")
    ctype = (file.content_type or "").lower()
    if not ctype.startswith("image/"):
        raise HTTPException(status_code=400, detail="Alleen afbeeldingen toegestaan.")
    asset_id = new_id()
    await db.landing_assets.insert_one({
        "id": asset_id,
        "filename": file.filename or f"asset-{asset_id}",
        "content_type": ctype,
        "data_b64": base64.b64encode(raw).decode("ascii"),
        "size": len(raw),
        "uploaded_by": user.get("email"),
        "uploaded_at": iso(now_utc()),
    })
    return {"id": asset_id, "url": f"/api/landing/asset/{asset_id}"}


@api.get("/landing/asset/{asset_id}")
async def get_landing_asset(asset_id: str):
    doc = await db.landing_assets.find_one({"id": asset_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Asset niet gevonden")
    try:
        data = base64.b64decode(doc["data_b64"])
    except Exception:
        raise HTTPException(status_code=500, detail="Asset corrupt")
    return StreamingResponse(io.BytesIO(data), media_type=doc.get("content_type", "image/png"),
                              headers={"Cache-Control": "public, max-age=3600"})


# =====================================================================
# Per-company branding (Logo + primary color + display name for PWA/login)
# =====================================================================
def _hex_color(v: Optional[str]) -> str:
    """Validate & normalize a #RRGGBB hex color. Falls back to brand orange."""
    if not v:
        return "#FF5C00"
    s = str(v).strip().lower()
    if not s.startswith("#"):
        s = "#" + s
    if len(s) == 4:  # #abc → #aabbcc
        s = "#" + "".join(ch * 2 for ch in s[1:])
    if len(s) != 7:
        return "#FF5C00"
    try:
        int(s[1:], 16)
        return s
    except ValueError:
        return "#FF5C00"


def _company_branding_response(c: dict) -> dict:
    b = (c.get("branding") or {}) if c else {}
    return {
        "id": c.get("id"),
        "slug": c.get("slug"),
        "name": c.get("name"),
        "app_name": b.get("app_name") or c.get("name") or "Vastgoed Kiosk",
        "primary_color": _hex_color(b.get("primary_color")),
        "logo_url": b.get("logo_url") or "",
        "tagline": b.get("tagline") or "",
        "contact_email": c.get("contact_email") or "",
        "contact_phone": c.get("contact_phone") or "",
        "address": c.get("address") or "",
        "bank_account_sr": c.get("bank_account_sr") or "",
        "bank_account_nl": c.get("bank_account_nl") or "",
        "mope_account": c.get("mope_account") or "",
        "uni5pay_account": c.get("uni5pay_account") or "",
    }


@api.get("/public/companies/{slug}/branding")
async def public_company_branding(slug: str):
    """Public — pre-login branding lookup by slug (no auth)."""
    if not slug or len(slug) > 80:
        raise HTTPException(status_code=400, detail="Ongeldige slug")
    c = await db.companies.find_one({"slug": slug.lower()}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    return _company_branding_response(c)


@api.get("/public/companies/{slug}/available")
async def public_slug_available(slug: str):
    """Public lightweight beschikbaarheids-check tijdens registratie.
    Returnt `{available: bool, reason?: str}` zonder enige interne data
    van het bestaande bedrijf te lekken (geen naam, geen branding).
    `reason` is een NL-vriendelijke fout-string:
      - "format"   → slug bevat ongeldige tekens / te kort / te lang
      - "reserved" → gereserveerde platform-slug (zoals 'admin', 'login')
      - "taken"    → reeds in gebruik door een ander bedrijf
    """
    import re
    s = (slug or "").lower().strip()
    if not s or len(s) > 40 or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,39}", s):
        return {"available": False, "reason": "format"}
    if s in RESERVED_SLUGS:
        return {"available": False, "reason": "reserved"}
    exists = await db.companies.find_one({"slug": s}, {"_id": 1})
    if exists:
        return {"available": False, "reason": "taken"}
    return {"available": True}




@api.get("/public/branding-default")
async def public_branding_default():
    """Wanneer er exact één actief bedrijf is, geef de branding terug.
    Gebruikt door de Huurder Kiosk om zonder slug/subdomain toch een
    bedrijfscontext te kunnen bepalen op single-tenant installaties."""
    # Tel actieve bedrijven (of valt terug op alle bedrijven indien `active` ontbreekt).
    q = {"$or": [{"active": True}, {"active": {"$exists": False}}]}
    total = await db.companies.count_documents(q)
    if total != 1:
        raise HTTPException(status_code=404, detail="Meerdere of geen bedrijven")
    c = await db.companies.find_one(q, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Geen bedrijf")
    return _company_branding_response(c)


@api.get("/public/branding-by-host")
async def public_branding_by_host(request: Request):
    """Resolve company branding using the HTTP Host header.
    Used when the app is deployed with wildcard DNS *.app.<root>
    (e.g. klantnaam.app.surirent.sr → slug=klantnaam).
    Returns {slug, ...branding} or {slug: null} if the host has no usable subdomain.
    """
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").lower()
    # Strip optional port
    host = host.split(":")[0].split(",")[0].strip()
    parts = [p for p in host.split(".") if p]
    # Need at least 3 segments (slug.app.<root>) and first part may not be 'app'/'www'.
    if len(parts) < 3:
        return {"slug": None, "host": host}
    first = parts[0]
    if first in ("app", "www") or not first.replace("-", "").isalnum():
        return {"slug": None, "host": host}
    c = await db.companies.find_one({"slug": first}, {"_id": 0})
    if not c:
        return {"slug": first, "host": host, "found": False}
    out = _company_branding_response(c)
    out["host"] = host
    out["found"] = True
    return out


@api.get("/companies/me/branding")
async def get_my_branding(user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf")
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    return _company_branding_response(c)


class BrandingIn(BaseModel):
    app_name: Optional[str] = None
    primary_color: Optional[str] = None
    logo_url: Optional[str] = None
    tagline: Optional[str] = None


@api.put("/companies/me/branding")
async def put_my_branding(body: BrandingIn, user=Depends(require_role("admin"))):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf")
    update = {
        "branding.app_name": (body.app_name or "").strip()[:80],
        "branding.primary_color": _hex_color(body.primary_color),
        "branding.logo_url": (body.logo_url or "").strip()[:500],
        "branding.tagline": (body.tagline or "").strip()[:200],
        "branding.updated_at": iso(now_utc()),
        "branding.updated_by": user.get("email"),
    }
    await db.companies.update_one({"id": cid}, {"$set": update})
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    return _company_branding_response(c)


class CompanyProfileIn(BaseModel):
    name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    bank_account_sr: Optional[str] = None
    bank_account_nl: Optional[str] = None
    mope_account: Optional[str] = None
    uni5pay_account: Optional[str] = None


@api.put("/companies/me/profile")
async def put_my_company_profile(
    body: CompanyProfileIn, user=Depends(require_role("admin"))
):
    """Admins kunnen hun eigen bedrijfsgegevens bewerken: bedrijfsnaam,
    contact-email, telefoon, adres en bankrekeningen (SR + NL). Slug en
    plan/billing blijven superadmin-only."""
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf")
    update = {}
    if body.name is not None:
        nm = body.name.strip()
        if not nm:
            raise HTTPException(status_code=400, detail="Bedrijfsnaam mag niet leeg zijn")
        update["name"] = nm[:120]
    if body.contact_email is not None:
        update["contact_email"] = body.contact_email.strip()[:200]
    if body.contact_phone is not None:
        update["contact_phone"] = body.contact_phone.strip()[:60]
    if body.address is not None:
        update["address"] = body.address.strip()[:300]
    if body.bank_account_sr is not None:
        update["bank_account_sr"] = body.bank_account_sr.strip()[:200]
    if body.bank_account_nl is not None:
        update["bank_account_nl"] = body.bank_account_nl.strip()[:200]
    if body.mope_account is not None:
        update["mope_account"] = body.mope_account.strip()[:200]
    if body.uni5pay_account is not None:
        update["uni5pay_account"] = body.uni5pay_account.strip()[:200]
    if not update:
        raise HTTPException(status_code=400, detail="Geen velden om bij te werken")
    update["updated_at"] = iso(now_utc())
    update["updated_by"] = user.get("email")
    await db.companies.update_one({"id": cid}, {"$set": update})
    # Invalidate de Gold Plaque cache zodat nieuwe bedrijfsnaam/adres direct
    # zichtbaar is in toekomstige plaquette-downloads.
    if "name" in update or "address" in update:
        try:
            await db.qr_plate_cache.delete_many({})
        except Exception:
            pass
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    return _company_branding_response(c)


@api.get("/companies/me/setup-status")
async def get_company_setup_status(user=Depends(require_role("admin"))):
    """Geeft een overzicht van wat er nog geconfigureerd moet worden voor een
    bedrijf om volledig functioneel te zijn. Gebruikt door de Setup Wizard
    om te bepalen welke stappen al klaar zijn en waar de wizard moet starten.
    """
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf")
    c = await db.companies.find_one({"id": cid}, {"_id": 0}) or {}

    has_name = bool((c.get("name") or "").strip()) and \
        (c.get("name") or "").strip().lower() not in ("nieuw bedrijf", "demo", "company")
    has_contact = bool((c.get("contact_email") or "").strip()) or \
        bool((c.get("contact_phone") or "").strip())
    has_bank = bool((c.get("bank_account_sr") or "").strip()) or \
        bool((c.get("bank_account_nl") or "").strip())
    has_wallet = bool((c.get("mope_account") or "").strip()) or \
        bool((c.get("uni5pay_account") or "").strip())

    apt_count = await db.apartments.count_documents({"company_id": cid})
    tenant_count = await db.tenants.count_documents({"company_id": cid})

    steps = [
        {"id": "profile", "label": "Bedrijfsgegevens", "done": bool(has_name and has_contact)},
        {"id": "bank", "label": "Bankrekening", "done": has_bank},
        {"id": "wallet", "label": "Mobile wallet (Mope/Uni5Pay)", "done": has_wallet},
        {"id": "apartment", "label": "Eerste appartement", "done": apt_count > 0},
        {"id": "tenant", "label": "Eerste huurder", "done": tenant_count > 0},
    ]
    completed = sum(1 for s in steps if s["done"])
    return {
        "complete": completed == len(steps),
        "completed": completed,
        "total": len(steps),
        "percent": round(completed / len(steps) * 100),
        "steps": steps,
        "next_step": next((s["id"] for s in steps if not s["done"]), None),
        "counts": {"apartments": apt_count, "tenants": tenant_count},
    }




@api.post("/companies/me/branding/upload")
async def upload_branding_asset(file: UploadFile = File(...),
                                 user=Depends(require_role("admin"))):
    """Upload a company logo (max 5 MB). Stored in same collection as landing assets
    so we reuse the public GET /api/landing/asset/{id} serve route."""
    raw = await file.read()
    if len(raw) > MAX_LANDING_ASSET_BYTES:
        raise HTTPException(status_code=413, detail="Bestand groter dan 5 MB.")
    ctype = (file.content_type or "").lower()
    if not ctype.startswith("image/"):
        raise HTTPException(status_code=400, detail="Alleen afbeeldingen toegestaan.")
    cid = company_id_of(user)
    asset_id = new_id()
    await db.landing_assets.insert_one({
        "id": asset_id,
        "filename": file.filename or f"asset-{asset_id}",
        "content_type": ctype,
        "data_b64": base64.b64encode(raw).decode("ascii"),
        "size": len(raw),
        "scope": "company",
        "company_id": cid,
        "uploaded_by": user.get("email"),
        "uploaded_at": iso(now_utc()),
    })
    return {"id": asset_id, "url": f"/api/landing/asset/{asset_id}"}


@api.get("/companies/me/url-info")
async def get_my_url_info(request: Request, user=Depends(get_current_user)):
    """Return all login-URL variants for the current company. Het branded pad
    `/c/<slug>/…` is altijd primair; eigen subdomein-feature is verwijderd.
    Bedrijven die een eigen domein willen, configureren dat in Instellingen →
    Eigen domein (CNAME → app host)."""
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf")
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    slug = c.get("slug") or ""

    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").lower().split(":")[0].strip()
    forwarded_proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    scheme = forwarded_proto or "https"
    app_domain = (os.environ.get("SAAS_APP_DOMAIN") or "").strip().lower() or host
    base_url = f"{scheme}://{app_domain}" if app_domain else ""
    query_url = f"{base_url}/login?c={slug}" if base_url else ""
    path_url = f"{base_url}/{slug}" if base_url else ""
    kiosk_url = f"{base_url}/{slug}/kiosk" if base_url else ""
    tenant_kiosk_url = f"{base_url}/{slug}/kiosk/huurder" if base_url else ""
    tenant_portal_url = tenant_kiosk_url
    customer_display_url = f"{base_url}/{slug}/kiosk/klant" if base_url else ""

    # Custom domain (uit Instellingen → Eigen domein). Toon als primary wanneer
    # admin het heeft ingesteld + DNS geverifieerd.
    custom_domain = None
    try:
        cs = await db.company_settings.find_one(
            {"company_id": cid}, {"_id": 0, "domain": 1}
        ) or {}
        dom = (cs.get("domain") or {})
        if dom.get("enabled") and dom.get("dns_verified") and dom.get("custom_domain"):
            custom_domain = (dom.get("custom_domain") or "").strip().lower()
    except Exception:
        custom_domain = None
    custom_domain_url = f"{scheme}://{custom_domain}" if custom_domain else None

    return {
        "slug": slug,
        "company_name": c.get("name"),
        "primary_url": custom_domain_url or path_url or query_url,
        "query_url": query_url,
        "path_url": path_url,
        "kiosk_url": kiosk_url,
        "tenant_kiosk_url": tenant_kiosk_url,
        "tenant_portal_url": tenant_portal_url,
        "customer_display_url": customer_display_url,
        "custom_domain_url": custom_domain_url,
        "app_domain": app_domain,
        # Legacy velden — leeg/none voor backward-compat met oude frontends.
        "subdomain_url": None,
        "dns_status": "na",
        "dns_error": None,
    }


# Welke entry-points een admin als QR kan delen. We bouwen de URL server-side
# zodat een gebruiker niet zomaar een willekeurige (phishing-)URL door onze
# QR-generator kan jagen.
_QR_KIND_PATHS = {
    "login":           "/{slug}",
    "kiosk":           "/{slug}/kiosk",
    "tenant_kiosk":    "/{slug}/kiosk/huurder",
    "customer_display":"/{slug}/kiosk/klant",
    # Huurportaal = zelfde route als de huurder-kiosk (PIN-only via QR).
    "tenant_portal":   "/{slug}/kiosk/huurder",
    "query":           "/login?c={slug}",
}


def _company_base_url(request: Request) -> str:
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").lower().split(":")[0].strip()
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower() or "https"
    # GEEN slug-prefix strippen — dat brak preview omgevingen waar de host meer
    # dan 3 DNS-componenten heeft maar geen company-subdomein is. Path bevat
    # al `/c/<slug>/…` zodat branding overal werkt.
    app_domain = (os.environ.get("SAAS_APP_DOMAIN") or "").strip().lower() or host
    return f"{proto}://{app_domain}" if app_domain else ""


@api.get("/companies/me/qr.png")
async def get_my_qr_png(kind: str = "kiosk", size: int = 320, request: Request = None,
                       user=Depends(get_current_user)):
    """Genereer een PNG QR-code voor één van de gepubliceerde entry-points
    van het huidige bedrijf. `kind` mag een van: login, kiosk, tenant_kiosk,
    customer_display, tenant_portal, query. De QR bevat de absolute branded
    URL (bv. https://app.surirent.sr/c/<slug>/kiosk) en wordt server-side
    gebouwd zodat de generator niet voor andere doeleinden misbruikt kan
    worden."""
    import io as _io
    import qrcode as _qrcode
    from fastapi.responses import StreamingResponse
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf")
    c = await db.companies.find_one({"id": cid}, {"_id": 0, "slug": 1})
    if not c or not c.get("slug"):
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    template = _QR_KIND_PATHS.get(kind)
    if not template:
        raise HTTPException(status_code=400, detail="Onbekend QR-type")
    size = max(160, min(int(size or 320), 800))
    base = _company_base_url(request)
    if not base:
        raise HTTPException(status_code=400, detail="Kan host niet bepalen")
    url = f"{base}{template.format(slug=c['slug'])}"
    qr = _qrcode.QRCode(version=None, error_correction=_qrcode.constants.ERROR_CORRECT_M,
                        box_size=10, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img = img.resize((size, size))
    buf = _io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    buf.seek(0)
    headers = {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": f'inline; filename="qr-{c["slug"]}-{kind}.png"',
    }
    return StreamingResponse(buf, media_type="image/png", headers=headers)




# =====================================================================
# Companies (superadmin)
# =====================================================================
class CompanyIn(BaseModel):
    name: str
    slug: str
    contact_email: Optional[str] = ""
    contact_phone: Optional[str] = ""
    address: Optional[str] = ""
    plan: str = "starter"
    active: bool = True


class CompanyOut(CompanyIn):
    id: str
    created_at: str
    billing_status: Optional[str] = None
    trial_started_at: Optional[str] = None
    trial_ends_at: Optional[str] = None
    days_left: Optional[int] = None
    owner_email: Optional[str] = None
    telefoon: Optional[str] = None
    monthly_amount: Optional[float] = None
    currency: Optional[str] = None
    stats: Optional[dict] = None


def _billing_summary(c: dict) -> dict:
    plan_id = c.get("plan", "starter")
    plan = PLAN_PRICES.get(plan_id, PLAN_PRICES.get("starter", {"amount": 0, "currency": "SRD"}))
    status = c.get("billing_status") or ("trial" if c.get("trial_ends_at") else "active")
    days_left = None
    trial_ends = c.get("trial_ends_at")
    if trial_ends:
        try:
            end = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
            delta = end - now_utc()
            days_left = max(0, int(delta.total_seconds() // 86400) + (1 if delta.total_seconds() % 86400 > 0 else 0))
        except Exception:
            days_left = None
    if status == "trial" and days_left is not None and days_left <= 0:
        status = "expired"
    return {
        "billing_status": status,
        "days_left": days_left,
        "monthly_amount": plan.get("amount"),
        "currency": plan.get("currency", "SRD"),
    }


@api.get("/companies", response_model=List[CompanyOut])
async def list_companies(user=Depends(require_role("superadmin"))):
    """Lijst alle bedrijven (superadmin). N+1 queries elimineren via 3
    parallelle aggregaties die counts per company_id in één query halen,
    daarna joinen we lokaal. Voorheen: 1 + 3×N queries → nu altijd 4."""
    docs = await db.companies.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    if not docs:
        return []
    company_ids = [c["id"] for c in docs]
    # Parallel: 3 aggregaties (apartments, tenants, users) gefiltered op de
    # exacte company_ids zodat MongoDB de bestaande indexes kan gebruiken.
    def pipeline():
        return [
            {"$match": {"company_id": {"$in": company_ids}}},
            {"$group": {"_id": "$company_id", "count": {"$sum": 1}}},
        ]
    apt_agg, ten_agg, usr_agg = await asyncio.gather(
        db.apartments.aggregate(pipeline()).to_list(None),
        db.tenants.aggregate(pipeline()).to_list(None),
        db.users.aggregate(pipeline()).to_list(None),
    )
    apt_counts = {d["_id"]: d["count"] for d in apt_agg}
    ten_counts = {d["_id"]: d["count"] for d in ten_agg}
    usr_counts = {d["_id"]: d["count"] for d in usr_agg}
    out = []
    for c in docs:
        cid = c["id"]
        out.append({
            **c,
            **_billing_summary(c),
            "stats": {
                "apartments": apt_counts.get(cid, 0),
                "tenants": ten_counts.get(cid, 0),
                "admins": usr_counts.get(cid, 0),
            },
        })
    return out


class ExtendTrialIn(BaseModel):
    days: int = Field(ge=1, le=365)


@api.post("/companies/{cid}/extend-trial")
async def extend_trial(cid: str, body: ExtendTrialIn, user=Depends(require_role("superadmin"))):
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    base = c.get("trial_ends_at")
    try:
        cur_end = datetime.fromisoformat(base.replace("Z", "+00:00")) if base else now_utc()
    except Exception:
        cur_end = now_utc()
    if cur_end < now_utc():
        cur_end = now_utc()
    new_end = cur_end + timedelta(days=int(body.days))
    await db.companies.update_one({"id": cid}, {"$set": {
        "trial_ends_at": iso(new_end), "billing_status": "trial",
    }})
    return {"ok": True, "trial_ends_at": iso(new_end)}


@api.post("/companies/{cid}/activate-subscription")
async def activate_subscription(cid: str, user=Depends(require_role("superadmin"))):
    """Mark a company's subscription as active (manual confirmation of bank
    transfer or other offline payment). Creates a paid SaaS invoice record."""
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    plan_id = c.get("plan", "starter")
    plan = PLAN_PRICES.get(plan_id, PLAN_PRICES["starter"])
    now = now_utc()
    period_end = now + timedelta(days=30)
    inv = {
        "id": new_id(),
        "company_id": cid,
        "company_name": c.get("name", ""),
        "plan": plan_id,
        "amount": plan["amount"],
        "currency": plan["currency"],
        "status": "paid",
        "period_start": iso(now),
        "period_end": iso(period_end),
        "paid_at": iso(now),
        "created_at": iso(now),
        "created_by": user.get("email"),
    }
    await db.subscription_invoices.insert_one(inv)
    await db.companies.update_one({"id": cid}, {"$set": {
        "billing_status": "active", "subscription_started_at": iso(now),
        "subscription_renews_at": iso(period_end),
    }})
    inv.pop("_id", None)
    return {"ok": True, "invoice": inv}


@api.post("/companies/{cid}/cancel-subscription")
async def cancel_subscription(cid: str, user=Depends(require_role("superadmin"))):
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    await db.companies.update_one({"id": cid}, {"$set": {"billing_status": "cancelled"}})
    return {"ok": True}


@api.get("/superadmin/overview")
async def superadmin_overview(user=Depends(require_role("superadmin"))):
    """Aggregate metrics for the superadmin dashboard."""
    companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
    total = len(companies)
    trial = active = expired = cancelled = 0
    mrr = 0.0
    for c in companies:
        s = _billing_summary(c)
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
    paid_invoices = await db.subscription_invoices.count_documents({"status": "paid"})
    return {
        "companies_total": total,
        "trial": trial, "active": active, "expired": expired, "cancelled": cancelled,
        "mrr": mrr, "currency": "SRD",
        "paid_invoices": paid_invoices,
    }


@api.get("/superadmin/subscription-invoices")
async def list_subscription_invoices(user=Depends(require_role("superadmin"))):
    docs = await db.subscription_invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api.post("/superadmin/subscription-invoices/{inv_id}/mark-paid")
async def mark_invoice_paid(inv_id: str, user=Depends(require_role("superadmin"))):
    from pymongo import ReturnDocument
    res = await db.subscription_invoices.find_one_and_update(
        {"id": inv_id},
        {"$set": {"status": "paid", "paid_at": iso(now_utc())}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden")
    return res


class SubscriptionPaymentIn(BaseModel):
    company_id: str
    amount: float
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    method: Literal["bank", "mope", "contant", "overig"] = "bank"
    reference: Optional[str] = ""
    note: Optional[str] = ""
    paid_at: Optional[str] = None  # ISO date; defaults to now


@api.get("/superadmin/subscription-payments")
async def list_subscription_payments(user=Depends(require_role("superadmin"))):
    docs = await db.subscription_payments.find({}, {"_id": 0}).sort("paid_at", -1).to_list(500)
    return docs


@api.post("/superadmin/subscription-payments")
async def register_subscription_payment(body: SubscriptionPaymentIn, user=Depends(require_role("superadmin"))):
    """Register an incoming SaaS payment (bank transfer or Mope) and auto-activate the company."""
    c = await db.companies.find_one({"id": body.company_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    plan_id = c.get("plan", "starter")
    now = now_utc()
    paid_at = body.paid_at or iso(now)
    period_end = now + timedelta(days=30)

    # Create invoice (paid) + payment record
    inv = {
        "id": new_id(),
        "company_id": body.company_id,
        "company_name": c.get("name", ""),
        "plan": plan_id,
        "amount": body.amount,
        "currency": body.currency,
        "status": "paid",
        "period_start": iso(now),
        "period_end": iso(period_end),
        "paid_at": paid_at,
        "created_at": iso(now),
        "created_by": user.get("email"),
        "payment_method": body.method,
    }
    await db.subscription_invoices.insert_one(inv)

    pay = {
        "id": new_id(),
        "invoice_id": inv["id"],
        "company_id": body.company_id,
        "company_name": c.get("name", ""),
        "amount": body.amount,
        "currency": body.currency,
        "method": body.method,
        "reference": (body.reference or "").strip(),
        "note": (body.note or "").strip(),
        "paid_at": paid_at,
        "created_at": iso(now),
        "created_by": user.get("email"),
    }
    await db.subscription_payments.insert_one(pay)

    # If company had a pending_plan, apply it now
    update_fields = {
        "billing_status": "active",
        "subscription_started_at": iso(now),
        "subscription_renews_at": iso(period_end),
    }
    pending_plan = c.get("pending_plan")
    if pending_plan and pending_plan != c.get("plan"):
        update_fields["plan"] = pending_plan
        update_fields["pending_plan"] = None
        update_fields["pending_invoice_id"] = None
        update_fields["plan_changed_at"] = iso(now)
    await db.companies.update_one({"id": body.company_id}, {"$set": update_fields})

    # Best-effort confirmation email to the company owner
    if c.get("owner_email"):
        try:
            from email_service import send_email as _send_smtp, send_platform_email, wrap_template
            saas = await db.saas_settings.find_one({"id": SAAS_SETTINGS_ID}, {"_id": 0}) or {}
            smtp = saas.get("smtp") or {}
            app_url = (os.environ.get("APP_PUBLIC_URL") or "https://app.surirent.sr").rstrip("/")
            plan_label = PLAN_PRICES.get(update_fields.get("plan", c.get("plan", "starter")), {}).get("name", "Starter")
            content = f"""
                <h1>Betaling ontvangen — bedankt!</h1>
                <p>Wij hebben uw betaling van <strong>{body.currency} {int(body.amount):,}</strong> ontvangen via {body.method}.</p>
                <table class="kv">
                  <tr><td>Pakket</td><td>{plan_label}</td></tr>
                  <tr><td>Periode</td><td>tot {(now + timedelta(days=30)).strftime("%d %b %Y")}</td></tr>
                  <tr><td>Referentie</td><td>{body.reference or '—'}</td></tr>
                  <tr><td>Factuur</td><td>{inv['id'][:8].upper()}</td></tr>
                </table>
                <p style="margin-top:14px;">U kunt direct verder werken in uw dashboard:</p>
                <p><a href="{app_url}/admin" style="display:inline-block;background:#10B981;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:700;">Open dashboard</a></p>
            """.replace(",", ".")
            subject = f"Betaling ontvangen — {plan_label} actief"
            body_html = wrap_template(content, footer=f"SuriRent · {app_url}")
            if smtp.get("enabled") and smtp.get("host"):
                try:
                    await _send_smtp(smtp, to=c["owner_email"], subject=subject, body_html=body_html)
                except Exception:
                    await send_platform_email(to=c["owner_email"], subject=subject, body_html=body_html)
            else:
                await send_platform_email(to=c["owner_email"], subject=subject, body_html=body_html)
        except Exception:
            pass

    inv.pop("_id", None)
    pay.pop("_id", None)
    return {"ok": True, "invoice": inv, "payment": pay, "applied_plan": update_fields.get("plan")}


# Impersonation — superadmin can act as a company's admin to assist support
IMPERSONATE_TOKEN_MIN = 60  # 1 hour


@api.post("/superadmin/companies/{cid}/impersonate")
async def impersonate_company(cid: str, response: Response, user=Depends(require_role("superadmin"))):
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    # Pick any admin of that company, or fall back to the superadmin email
    admin = await db.users.find_one({"company_id": cid, "role": "admin"}, {"_id": 0})
    target_user_id = (admin or user).get("id")
    target_email = (admin or user).get("email")
    payload = {
        "sub": target_user_id, "email": target_email, "type": "access",
        "company_id": cid, "role": "admin",
        "impersonated_by": user.get("email"),
        "original_user_id": user.get("id"),
    }
    token = create_token(payload, IMPERSONATE_TOKEN_MIN)
    _set_access_cookie(response, token, minutes=IMPERSONATE_TOKEN_MIN)
    await db.audit_log.insert_one({
        "id": new_id(), "type": "impersonate",
        "actor": user.get("email"), "company_id": cid,
        "company_name": c.get("name"), "at": iso(now_utc()),
    })
    return {
        "token": token,
        "company": {k: c.get(k) for k in ("id", "slug", "name", "plan")},
        "expires_in_minutes": IMPERSONATE_TOKEN_MIN,
    }


@api.post("/auth/stop-impersonating")
async def stop_impersonating(response: Response, user=Depends(get_current_user)):
    """Return to the original superadmin session after an impersonation."""
    original_id = user.get("original_user_id")
    if not original_id:
        raise HTTPException(status_code=400, detail="Geen impersonatie-sessie actief")
    super_user = await db.users.find_one({"id": original_id}, {"_id": 0, "password_hash": 0})
    if not super_user or super_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Origineel account niet gevonden of niet superadmin")
    token = create_token({
        "sub": super_user["id"], "email": super_user["email"], "type": "access",
        "company_id": super_user.get("company_id"), "role": "superadmin",
    }, ACCESS_MIN)
    _set_access_cookie(response, token)
    return {"token": token, "user": super_user}


# SaaS-level settings (banking, Mope creds, branding) stored centrally
# (SAAS_SETTINGS_ID is declared earlier near the billing helpers)


@api.get("/superadmin/settings")
async def get_saas_settings(user=Depends(require_role("superadmin"))):
    doc = await db.saas_settings.find_one({"id": SAAS_SETTINGS_ID}, {"_id": 0}) or {}
    # Mask Mope/SMTP secrets in response — only return whether they're set
    mope = doc.get("mope", {}) or {}
    smtp = doc.get("smtp", {}) or {}
    return {
        "banking": doc.get("banking", {
            "bank_name": "", "account_name": "", "account_number": "", "swift": "",
            "support_email": "", "whatsapp": "",
        }),
        "mope": {
            "enabled": bool(mope.get("enabled")),
            "merchant_id": mope.get("merchant_id", ""),
            "api_key_set": bool(mope.get("api_key")),
            "test_mode": bool(mope.get("test_mode", True)),
        },
        "sumup": {
            "enabled": bool((doc.get("sumup") or {}).get("enabled")),
            "merchant_code": (doc.get("sumup") or {}).get("merchant_code", ""),
            "api_key_set": bool((doc.get("sumup") or {}).get("api_key")),
            "test_mode": bool((doc.get("sumup") or {}).get("test_mode", True)),
        },
        "fx": {
            "mode": (doc.get("fx") or {}).get("mode", "auto"),
            "manual_eur_per_srd": (doc.get("fx") or {}).get("manual_eur_per_srd", 0),
            "cached_rate": (doc.get("fx") or {}).get("cached_rate", 0),
            "cached_at": (doc.get("fx") or {}).get("cached_at"),
        },
        "smtp": {
            "enabled": bool(smtp.get("enabled")),
            "host": smtp.get("host", ""),
            "port": smtp.get("port", 587),
            "username": smtp.get("username", ""),
            "password_set": bool(smtp.get("password")),
            "from_name": smtp.get("from_name", "SuriRent"),
            "from_email": smtp.get("from_email", ""),
            "use_tls": bool(smtp.get("use_tls", True)),
        },
        "branding": doc.get("branding", {
            "platform_name": "SuriRent", "app_url": "",
        }),
    }


class SaasSettingsIn(BaseModel):
    banking: Optional[dict] = None
    mope: Optional[dict] = None
    sumup: Optional[dict] = None
    fx: Optional[dict] = None
    smtp: Optional[dict] = None
    branding: Optional[dict] = None


@api.put("/superadmin/settings")
async def update_saas_settings(body: SaasSettingsIn, user=Depends(require_role("superadmin"))):
    existing = await db.saas_settings.find_one({"id": SAAS_SETTINGS_ID}, {"_id": 0}) or {}
    update = {}
    if body.banking is not None:
        update["banking"] = body.banking
    if body.branding is not None:
        update["branding"] = body.branding
    if body.mope is not None:
        cur = existing.get("mope", {}) or {}
        new_mope = {
            "enabled": bool(body.mope.get("enabled", cur.get("enabled", False))),
            "merchant_id": body.mope.get("merchant_id", cur.get("merchant_id", "")),
            "test_mode": bool(body.mope.get("test_mode", cur.get("test_mode", True))),
            "api_key": body.mope.get("api_key") if body.mope.get("api_key") else cur.get("api_key", ""),
        }
        update["mope"] = new_mope
    if body.sumup is not None:
        cur = existing.get("sumup", {}) or {}
        new_sumup = {
            "enabled": bool(body.sumup.get("enabled", cur.get("enabled", False))),
            "merchant_code": body.sumup.get("merchant_code", cur.get("merchant_code", "")),
            "test_mode": bool(body.sumup.get("test_mode", cur.get("test_mode", True))),
            "api_key": body.sumup.get("api_key") if body.sumup.get("api_key") else cur.get("api_key", ""),
        }
        update["sumup"] = new_sumup
    if body.fx is not None:
        cur = existing.get("fx", {}) or {}
        new_fx = {
            "mode": body.fx.get("mode", cur.get("mode", "auto")),
            "manual_eur_per_srd": float(body.fx.get("manual_eur_per_srd", cur.get("manual_eur_per_srd", 0)) or 0),
            "cached_rate": cur.get("cached_rate", 0),
            "cached_at": cur.get("cached_at"),
        }
        if new_fx["mode"] not in ("auto", "manual"):
            new_fx["mode"] = "auto"
        update["fx"] = new_fx
    if body.smtp is not None:
        cur = existing.get("smtp", {}) or {}
        new_smtp = {
            "enabled": bool(body.smtp.get("enabled", cur.get("enabled", False))),
            "host": body.smtp.get("host", cur.get("host", "")),
            "port": int(body.smtp.get("port", cur.get("port", 587))),
            "username": body.smtp.get("username", cur.get("username", "")),
            "password": body.smtp.get("password") if body.smtp.get("password") else cur.get("password", ""),
            "from_name": body.smtp.get("from_name", cur.get("from_name", "SuriRent")),
            "from_email": body.smtp.get("from_email", cur.get("from_email", "")),
            "use_tls": bool(body.smtp.get("use_tls", cur.get("use_tls", True))),
        }
        update["smtp"] = new_smtp
    await db.saas_settings.update_one(
        {"id": SAAS_SETTINGS_ID},
        {"$set": {"id": SAAS_SETTINGS_ID, **update, "updated_at": iso(now_utc()), "updated_by": user.get("email")}},
        upsert=True,
    )
    return {"ok": True}


@api.post("/superadmin/settings/test-smtp")
async def test_saas_smtp(user=Depends(require_role("superadmin"))):
    """Send a test e-mail to the superadmin's own address using saved SMTP."""
    doc = await db.saas_settings.find_one({"id": SAAS_SETTINGS_ID}, {"_id": 0}) or {}
    smtp = doc.get("smtp", {}) or {}
    if not smtp.get("enabled") or not smtp.get("host"):
        raise HTTPException(status_code=400, detail="SMTP is niet ingeschakeld of host ontbreekt")
    from email_service import send_email, wrap_template, EmailError
    try:
        await send_email(
            smtp, to=user.get("email"),
            subject="SuriRent — SMTP test",
            body_html=wrap_template("<h1>SMTP werkt!</h1><p>Dit is een testbericht vanuit de SaaS-omgeving.</p>"),
        )
    except EmailError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"ok": True}


@api.post("/companies", response_model=CompanyOut)
async def create_company(body: CompanyIn, user=Depends(require_role("superadmin"))):
    slug = _validate_slug_or_raise(body.slug)
    existing = await db.companies.find_one({"slug": slug})
    if existing:
        raise HTTPException(status_code=400, detail="Slug is al in gebruik")
    doc = {"id": new_id(), **body.model_dump(), "slug": slug, "created_at": iso(now_utc())}
    await db.companies.insert_one(doc)
    doc.pop("_id", None)
    return {**doc, "stats": {"apartments": 0, "tenants": 0, "admins": 0}}


@api.put("/companies/{cid}", response_model=CompanyOut)
async def update_company(cid: str, body: CompanyIn, user=Depends(require_role("superadmin"))):
    from pymongo import ReturnDocument
    payload = body.model_dump()
    new_slug = _validate_slug_or_raise(payload["slug"])
    # Check of nieuwe slug niet al door een ander bedrijf in gebruik is.
    clash = await db.companies.find_one({"slug": new_slug, "id": {"$ne": cid}}, {"_id": 0, "id": 1})
    if clash:
        raise HTTPException(status_code=400, detail="Slug is al in gebruik")
    payload["slug"] = new_slug
    res = await db.companies.find_one_and_update(
        {"id": cid}, {"$set": payload},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    return {**res, "stats": None}


@api.delete("/companies/{cid}")
async def delete_company(cid: str, user=Depends(require_role("superadmin"))):
    # Refuse to delete default company
    default = await db.companies.find_one({"slug": DEFAULT_COMPANY_SLUG})
    if default and default["id"] == cid:
        raise HTTPException(status_code=400, detail="Standaard bedrijf kan niet worden verwijderd")
    # Refuse if it has data
    for coll in TENANT_SCOPED_COLLECTIONS:
        cnt = await db[coll].count_documents({"company_id": cid})
        if cnt:
            raise HTTPException(status_code=400, detail=f"Bedrijf heeft nog {cnt} records in {coll}, verwijder eerst")
    await db.companies.delete_one({"id": cid})
    await db.users.delete_many({"company_id": cid})
    await db.kiosk_pins.delete_one({"company_id": cid})
    return {"ok": True}


@api.post("/companies/{cid}/seed-admin")
async def seed_company_admin(cid: str, body: RegisterIn, user=Depends(require_role("superadmin"))):
    """Create the first admin for a company."""
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="E-mailadres is al in gebruik")
    udoc = {
        "id": new_id(), "email": email, "name": body.name.strip(),
        "role": "admin", "company_id": cid,
        "password_hash": hash_password(body.password),
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(udoc)
    udoc.pop("_id", None)
    udoc.pop("password_hash", None)
    return udoc


# Kiosk PIN
@api.post("/auth/kiosk-pin")
async def kiosk_pin(body: PinIn, request: Request, response: Response):
    """Verifieer een PIN binnen de SCOPE van één bedrijf.

    De PIN-login werkt alleen op het branded login-scherm (`/<slug>/login` of
    `/login?c=<slug>`). De frontend stuurt `company_slug` of `company_id`
    mee zodat we alleen tegen die bedrijfs-PIN + diens medewerker-PINs
    matchen. Dit voorkomt dat twee bedrijven met dezelfde PIN per ongeluk
    in elkaars omgeving belanden.

    Retourneert zowel een kiosk_token (kort-levend, kiosk-scope) ALS een
    admin access token voor de primary admin van het bedrijf, zodat de
    "Beheerder"-knop direct door kan navigeren zonder tweede login.

    Voor employee-PINs: GEEN admin_token (zij mogen niet bij Beheer).
    """
    throttle_key = f"kiosk:{_client_ip(request)}"
    _pin_throttle_check(throttle_key)

    # ---- Bepaal bedrijfs-scope ----
    target_cid = None
    if body.company_id:
        c = await db.companies.find_one({"id": body.company_id.strip()}, {"_id": 0, "id": 1})
        if c:
            target_cid = c["id"]
    elif body.company_slug:
        c = await db.companies.find_one({"slug": body.company_slug.strip().lower()}, {"_id": 0, "id": 1})
        if c:
            target_cid = c["id"]
    if not target_cid:
        raise HTTPException(
            status_code=400,
            detail="PIN-login werkt alleen op uw bedrijfs-portaal. Open de link uw bedrijf u stuurde, of gebruik e-mail + wachtwoord.",
        )

    # ---- Probeer eerst de gedeelde bedrijfs-PIN ----
    pin_doc = await db.kiosk_pins.find_one({"company_id": target_cid}, {"_id": 0})
    matched_company_id = None
    if pin_doc and verify_password(body.pin, pin_doc.get("pin_hash", "")):
        matched_company_id = target_cid

    # ---- NIEUWE FLOW: employee PIN binnen dit bedrijf ----
    if not matched_company_id:
        emp_docs = await db.employees.find(
            {
                "company_id": target_cid,
                "active": True,
                "app_role": "kiosk",
                "kiosk_pin_hash": {"$exists": True, "$ne": None},
            },
            {"_id": 0},
        ).to_list(2000)
        matched_emp = None
        for e in emp_docs:
            if verify_password(body.pin, e.get("kiosk_pin_hash", "")):
                matched_emp = e
                break
        if matched_emp:
            _pin_throttle_clear(throttle_key)
            cid = matched_emp.get("company_id")
            c = await db.companies.find_one({"id": cid}, {"_id": 0}) if cid else None
            token = create_token({
                "sub": "kiosk", "type": "kiosk", "company_id": cid,
            }, KIOSK_TOKEN_MIN)
            _set_access_cookie(response, token, name="kiosk_token", minutes=KIOSK_TOKEN_MIN)
            return {
                "token": token,
                "company": c and {k: c[k] for k in ("id", "slug", "name")},
                "admin_token": None,
                "admin_user": None,
                "employee": {
                    "id": matched_emp["id"],
                    "name": matched_emp.get("name", ""),
                    "pin": body.pin,  # frontend gebruikt dit voor sessionStorage → withKioskEmployee()
                },
            }
        _pin_throttle_fail(throttle_key)
        raise HTTPException(status_code=401, detail="Ongeldige PIN code")
    _pin_throttle_clear(throttle_key)
    c = await db.companies.find_one({"id": matched_company_id}, {"_id": 0})
    token = create_token({
        "sub": "kiosk", "type": "kiosk", "company_id": matched_company_id,
    }, KIOSK_TOKEN_MIN)
    _set_access_cookie(response, token, name="kiosk_token", minutes=KIOSK_TOKEN_MIN)

    # Find the company's primary admin (oldest admin user for this company),
    # so we can also hand back an admin access token. Best-effort: if no admin
    # exists yet (e.g. orphaned company), just return the kiosk token alone.
    admin_token = None
    admin_user_out = None
    if matched_company_id:
        admin_user = await db.users.find_one(
            {"company_id": matched_company_id, "role": "admin"},
            sort=[("created_at", 1)],
        )
        if admin_user:
            admin_token = create_token({
                "sub": admin_user["id"], "email": admin_user["email"], "type": "access",
                "company_id": admin_user.get("company_id"), "role": admin_user.get("role", "admin"),
            }, ACCESS_MIN)
            admin_user_out = {
                "id": admin_user["id"],
                "email": admin_user["email"],
                "name": admin_user.get("name", ""),
                "role": admin_user.get("role", "admin"),
                "company_id": admin_user.get("company_id"),
                "created_at": admin_user.get("created_at"),
            }
    return {
        "token": token,
        "company": c and {k: c[k] for k in ("id", "slug", "name")},
        "admin_token": admin_token,
        "admin_user": admin_user_out,
    }


@api.post("/auth/kiosk-set-pin")
async def set_kiosk_pin(body: SetPinIn, user=Depends(get_current_user)):
    if not body.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN moet 4 cijfers zijn")
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    # Uniqueness alleen BINNEN dit bedrijf — andere bedrijven mogen dezelfde
    # PIN gebruiken omdat PIN-login altijd company-scoped is.
    emps = await db.employees.find(
        {
            "company_id": cid,
            "active": True,
            "kiosk_pin_hash": {"$exists": True, "$ne": None},
        },
        {"_id": 0, "name": 1, "kiosk_pin_hash": 1},
    ).to_list(2000)
    for e in emps:
        if verify_password(body.pin, e.get("kiosk_pin_hash", "")):
            raise HTTPException(status_code=409, detail=f"Deze PIN is al in gebruik door medewerker {e.get('name', '')}, kies een andere")
    await db.kiosk_pins.update_one(
        {"company_id": cid},
        {"$set": {"company_id": cid, "pin_hash": hash_password(body.pin), "updated_at": iso(now_utc())}},
        upsert=True,
    )
    return {"ok": True}


# =====================================================================
# Tenant portal auth
# =====================================================================
TENANT_TOKEN_MIN = 60 * 24  # 24h


async def get_tenant_session(request: Request) -> dict:
    token = extract_token(request, "tenant_token")
    if not token:
        raise HTTPException(status_code=401, detail="Niet ingelogd")
    try:
        payload = decode_token(token)
        if payload.get("type") != "tenant":
            raise HTTPException(status_code=401, detail="Ongeldig token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessie verlopen")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Ongeldig token")
    tenant = await db.tenants.find_one({"id": payload["sub"]}, {"_id": 0, "pin_hash": 0})
    if not tenant:
        raise HTTPException(status_code=401, detail="Huurder niet gevonden")
    return tenant


class TenantLoginIn(BaseModel):
    identifier: str  # phone or email
    pin: str = Field(min_length=4, max_length=4)


class TenantSetPinIn(BaseModel):
    tenant_id: str
    pin: str = Field(min_length=4, max_length=4)


@api.post("/tenant-portal/login")
async def tenant_portal_login(body: TenantLoginIn, request: Request, response: Response):
    throttle_key = f"tenant:{_client_ip(request)}:{body.identifier.strip().lower()[:40]}"
    _pin_throttle_check(throttle_key)
    ident = body.identifier.strip().lower()
    # Find by email or phone (normalize phone by stripping non-digits)
    digits = "".join(ch for ch in body.identifier if ch.isdigit())
    query = {"$or": [
        {"email": ident},
        {"phone": body.identifier},
    ]}
    if digits:
        query["$or"].append({"phone_digits": digits})
    tenant = await db.tenants.find_one(query)
    if not tenant or not tenant.get("pin_hash"):
        _pin_throttle_fail(throttle_key)
        raise HTTPException(status_code=401, detail="Onjuiste gegevens of PIN niet ingesteld")
    if not verify_password(body.pin, tenant.get("pin_hash", "")):
        _pin_throttle_fail(throttle_key)
        raise HTTPException(status_code=401, detail="Onjuiste PIN")
    _pin_throttle_clear(throttle_key)
    token = create_token({"sub": tenant["id"], "type": "tenant"}, TENANT_TOKEN_MIN)
    _set_access_cookie(response, token, name="tenant_token", minutes=TENANT_TOKEN_MIN)
    return {
        "token": token,
        "tenant": {"id": tenant["id"], "name": tenant["name"], "email": tenant.get("email"), "phone": tenant.get("phone")},
    }


@api.post("/auth/tenant-set-pin")
async def admin_set_tenant_pin(body: TenantSetPinIn, user=Depends(get_current_user)):
    """Admin sets/resets a tenant's portal PIN."""
    if not body.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN moet 4 cijfers zijn")
    t = await db.tenants.find_one({"id": body.tenant_id, **scope(user)}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    # PIN moet uniek zijn binnen het bedrijf — zo kan de huurder later
    # alléén met PIN inloggen (zonder e-mail) op de Huurder Kiosk.
    cid = t.get("company_id")
    if cid:
        others = await db.tenants.find(
            {"company_id": cid, "id": {"$ne": body.tenant_id}, "pin_hash": {"$exists": True, "$ne": None}},
            {"_id": 0, "id": 1, "name": 1, "pin_hash": 1},
        ).to_list(2000)
        for o in others:
            if verify_password(body.pin, o.get("pin_hash") or ""):
                raise HTTPException(
                    status_code=409,
                    detail=f"Deze PIN is al in gebruik door {o.get('name', 'een andere huurder')} — kies een andere code.",
                )
    await db.tenants.update_one(
        {"id": body.tenant_id, **scope(user)},
        {"$set": {
            "pin_hash": hash_password(body.pin),
            "phone_digits": "".join(ch for ch in (t.get("phone") or "") if ch.isdigit()),
        }},
    )
    return {"ok": True}


@api.post("/tenant-portal/logout")
async def tenant_portal_logout(response: Response):
    response.delete_cookie("tenant_token", path="/")
    return {"ok": True}


class TenantPinLoginIn(BaseModel):
    pin: str = Field(min_length=4, max_length=4)
    company_id: Optional[str] = None
    company_slug: Optional[str] = None


@api.get("/tenant-portal/welcome/{tenant_id}")
async def tenant_portal_welcome(tenant_id: str):
    """Public lookup endpoint voor persoonlijke huurder-QR.
    Geeft alleen de minimale info terug: naam + of er al een PIN is gezet.
    GEEN authenticatie nodig — de tenant_id in de QR is bewust geen geheim
    (de QR krijgt de huurder fysiek aangeleverd; PIN beschermt de toegang)."""
    t = await db.tenants.find_one(
        {"id": tenant_id}, {"_id": 0, "id": 1, "name": 1, "company_id": 1, "pin_hash": 1}
    )
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    c = await db.companies.find_one(
        {"id": t.get("company_id")},
        {"_id": 0, "id": 1, "name": 1, "slug": 1, "branding": 1},
    ) if t.get("company_id") else None
    return {
        "tenant_id": t["id"],
        "tenant_name": t.get("name"),
        "has_pin": bool(t.get("pin_hash")),
        "company": c and {
            "id": c["id"], "name": c.get("name"), "slug": c.get("slug"),
            "branding": c.get("branding") or {},
        },
    }


class TenantSetupPinIn(BaseModel):
    tenant_id: str
    pin: str = Field(min_length=4, max_length=4)


@api.post("/tenant-portal/setup-pin")
async def tenant_portal_setup_pin(body: TenantSetupPinIn, request: Request, response: Response):
    """Eerste-keer PIN setup voor een huurder via de persoonlijke QR.
    Werkt ALLEEN als de huurder nog GEEN PIN heeft (anti-takeover).
    Resultaat: PIN wordt opgeslagen + huurder krijgt direct een geldig
    tenant_token zodat hij na de setup meteen ingelogd is in zijn portal.

    Veiligheid:
      • Tenant_id staat in QR (semi-publiek) maar zonder PIN kan een aanvaller
        niets doen — eerste setup is one-shot.
      • Bij bestaande PIN: 409 Conflict → frontend toont login i.p.v. setup.
      • Throttling via IP zodat brute-force PIN setup niet mogelijk is.
    """
    if not body.pin.isdigit() or len(body.pin) != 4:
        raise HTTPException(status_code=400, detail="PIN moet exact 4 cijfers zijn")
    throttle_key = f"tenant-setup-pin:{_client_ip(request)}"
    _pin_throttle_check(throttle_key)
    t = await db.tenants.find_one(
        {"id": body.tenant_id},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1,
         "pin_hash": 1, "company_id": 1, "apartment_id": 1},
    )
    if not t:
        _pin_throttle_fail(throttle_key)
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    if t.get("pin_hash"):
        _pin_throttle_fail(throttle_key)
        raise HTTPException(status_code=409, detail="PIN is al ingesteld — log in met uw bestaande PIN")
    # Conflict-check: deze PIN mag nog niet in gebruik zijn binnen hetzelfde
    # bedrijf (anders zou PIN-only login twee huurders vinden).
    cid = t.get("company_id")
    if cid:
        async for other in db.tenants.find(
            {"company_id": cid, "pin_hash": {"$exists": True, "$ne": None},
             "id": {"$ne": t["id"]}},
            {"_id": 0, "pin_hash": 1},
        ):
            if verify_password(body.pin, other.get("pin_hash") or ""):
                raise HTTPException(
                    status_code=409,
                    detail="Deze PIN is al in gebruik. Kies een andere 4-cijferige PIN.",
                )
    # PIN opslaan
    await db.tenants.update_one(
        {"id": t["id"]},
        {"$set": {"pin_hash": hash_password(body.pin),
                  "pin_set_at": iso(now_utc())}},
    )
    _pin_throttle_clear(throttle_key)
    # Direct inloggen — geef token mee zodat user na setup gelijk doorgaat
    token = create_token({"sub": t["id"], "type": "tenant"}, TENANT_TOKEN_MIN)
    _set_access_cookie(response, token, name="tenant_token", minutes=TENANT_TOKEN_MIN)
    return {
        "token": token,
        "tenant": {
            "id": t["id"], "name": t.get("name"),
            "email": t.get("email"), "phone": t.get("phone"),
        },
    }


@api.post("/tenant-portal/pin-login")
async def tenant_portal_pin_login(body: TenantPinLoginIn, request: Request, response: Response):
    """PIN-only login voor de Huurder Kiosk.
    De PIN is uniek per bedrijf (afgedwongen bij `tenant-set-pin`), dus
    we hebben naast de PIN een bedrijfscontext nodig (slug of id) om de
    juiste huurder te vinden. Zonder context: 400.
    """
    if not body.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN moet 4 cijfers zijn")
    cid = body.company_id
    if not cid and body.company_slug:
        c = await db.companies.find_one({"slug": body.company_slug.lower()}, {"_id": 0, "id": 1})
        cid = c["id"] if c else None
    if not cid:
        raise HTTPException(status_code=400, detail="Bedrijfscontext ontbreekt")
    throttle_key = f"tenant-pin:{_client_ip(request)}:{cid}"
    _pin_throttle_check(throttle_key)
    cursor = db.tenants.find(
        {"company_id": cid, "pin_hash": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "pin_hash": 1, "company_id": 1, "apartment_id": 1},
    )
    match = None
    async for t in cursor:
        if verify_password(body.pin, t.get("pin_hash") or ""):
            match = t
            break
    if not match:
        _pin_throttle_fail(throttle_key)
        raise HTTPException(status_code=401, detail="Onjuiste PIN")
    _pin_throttle_clear(throttle_key)
    token = create_token({"sub": match["id"], "type": "tenant"}, TENANT_TOKEN_MIN)
    _set_access_cookie(response, token, name="tenant_token", minutes=TENANT_TOKEN_MIN)
    return {
        "token": token,
        "tenant": {
            "id": match["id"], "name": match.get("name"),
            "email": match.get("email"), "phone": match.get("phone"),
        },
    }


class TenantForgotPinIn(BaseModel):
    identifier: str  # email of telefoonnummer
    company_id: Optional[str] = None
    company_slug: Optional[str] = None


def _generate_unique_pin(used_hashes: list, max_tries: int = 25) -> str:
    """Genereer een 4-cijferige PIN die nog niet in `used_hashes` voorkomt.
    PIN's beginnen niet met '0' zodat de huurder ze beter kan onthouden
    (anders gaat een leading-zero op de display soms verloren).

    Gebruikt `secrets.randbelow` (cryptografisch sterke RNG) i.p.v. `random`
    zodat de PIN niet voorspelbaar is — relevant omdat het de enige
    authenticatie van een huurder is op de Kiosk.
    """
    for _ in range(max_tries):
        pin = f"{1000 + secrets.randbelow(9000)}"
        clash = False
        for h in used_hashes:
            if h and verify_password(pin, h):
                clash = True
                break
        if not clash:
            return pin
    # Fall-back: 5-cijferige PIN als 4-cijfers volledig "op" is — extreem
    # zeldzaam in de praktijk (>1000 huurders met PIN) maar voorkomt loop.
    return f"{10000 + secrets.randbelow(90000)}"


@api.post("/tenant-portal/forgot-pin")
async def tenant_forgot_pin(body: TenantForgotPinIn, request: Request):
    """Stuur de huurder een nieuwe PIN via Email + WhatsApp.

    Aangeroepen vanaf de Huurder Kiosk na bv. 3 foute PIN-pogingen.
    We zoeken de huurder op basis van email (case-insensitive) of
    laatste-4-cijfers van het telefoonnummer binnen de gegeven company.
    Voor de UX retourneren we altijd `{ok:true}` (anti-enumeratie) maar
    daarbij ook welke kanalen gebruikt zijn ("via Email", "via WhatsApp",
    of beide) als we de tenant gevonden hebben.

    Anti-misbruik: max 3 forgot-pin requests per IP per 10 minuten via
    de bestaande _pin_throttle_* helpers (key prefix 'forgot-pin').
    """
    # Throttle — onafhankelijk van pin-throttle zodat het loslaten van
    # de lockout ook na 3 foute PIN-pogingen blijft gelden.
    throttle_key = f"forgot-pin:{_client_ip(request)}"
    _pin_throttle_check(throttle_key)

    # Resolve company
    cid = body.company_id
    if not cid and body.company_slug:
        c = await db.companies.find_one({"slug": body.company_slug.lower()}, {"_id": 0, "id": 1})
        cid = c["id"] if c else None
    if not cid:
        raise HTTPException(status_code=400, detail="Bedrijfscontext ontbreekt")

    ident = (body.identifier or "").strip()
    if not ident:
        raise HTTPException(status_code=400, detail="Vul uw email of telefoonnummer in")

    # Find tenant: email match (case-insensitive) of phone-digits ends-with
    digits = "".join(ch for ch in ident if ch.isdigit())
    or_clauses = [{"email": ident.lower()}]
    if digits:
        # Last 4-12 cijfers van het telefoonnummer moeten matchen op
        # phone_digits suffix — dat ondersteunt zowel "597 8123456" als
        # "+597 8 123 456" varianten.
        or_clauses.append({"phone_digits": {"$regex": f"{re.escape(digits)}$"}})
    tenant = await db.tenants.find_one(
        {"company_id": cid, "$or": or_clauses},
        {"_id": 0},
    )
    if not tenant:
        # Anti-enumeratie: tel als poging zodat brute-force phone-suffix
        # gissen wordt afgestraft.
        _pin_throttle_fail(throttle_key)
        # Generieke OK-response — geen info-leak.
        return {"ok": True, "via": []}

    # Generate fresh PIN, ensure uniek binnen company.
    others = await db.tenants.find(
        {"company_id": cid, "id": {"$ne": tenant["id"]}, "pin_hash": {"$exists": True, "$ne": None}},
        {"_id": 0, "pin_hash": 1},
    ).to_list(2000)
    used = [o["pin_hash"] for o in others]
    new_pin = _generate_unique_pin(used)

    await db.tenants.update_one(
        {"id": tenant["id"]},
        {"$set": {
            "pin_hash": hash_password(new_pin),
            "phone_digits": "".join(ch for ch in (tenant.get("phone") or "") if ch.isdigit()),
            "pin_reset_at": iso(now_utc()),
        }},
    )

    via: list = []
    company = await db.companies.find_one({"id": cid}, {"_id": 0})
    company_name = (company or {}).get("name") or "Vastgoed Kiosk"

    # Email
    email = (tenant.get("email") or "").strip()
    if email:
        try:
            from email_service import send_email as _send_smtp, wrap_template
            smtp = await get_company_section(cid, "smtp")
            if smtp and smtp.get("enabled") and smtp.get("host"):
                subject = f"Uw nieuwe PIN voor {company_name}"
                content_html = (
                    f"<h2 style='color:#FF5C00;margin:0 0 12px 0;'>Nieuwe PIN code</h2>"
                    f"<p>Beste {tenant.get('name', 'huurder')},</p>"
                    f"<p>U heeft een nieuwe PIN aangevraagd om in te loggen op uw huurder-kiosk:</p>"
                    f"<p style='font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;"
                    f"padding:16px;background:#f5f5f5;border-radius:12px;color:#FF5C00;'>{new_pin}</p>"
                    f"<p>Gebruik deze code om uw saldo en betalingen te bekijken. "
                    f"Heeft u dit niet aangevraagd? Neem dan contact op met de receptie.</p>"
                )
                body_html = wrap_template(content_html, footer=company_name)
                await _send_smtp(smtp, to=email, subject=subject, body_html=body_html)
                via.append("email")
        except Exception as e:
            print(f"[forgot-pin] email send failed: {e}")

    # WhatsApp (en SMS-fallback)
    phone = (tenant.get("phone") or "").strip()
    if phone:
        try:
            from twilio_service import send_whatsapp, send_sms
            cfg = await get_company_section(cid, "twilio")
            if cfg and cfg.get("account_sid") and cfg.get("auth_token"):
                msg = (
                    f"{company_name} — Uw nieuwe PIN: *{new_pin}*\n"
                    f"Gebruik deze code op de Huurder Kiosk om in te loggen. "
                    f"Niet aangevraagd? Neem contact op met de receptie."
                )
                try:
                    await send_whatsapp(cfg, phone, msg)
                    via.append("whatsapp")
                except Exception:
                    # Val terug op SMS als WhatsApp faalt (geen joined-channel etc.)
                    try:
                        await send_sms(cfg, phone, msg)
                        via.append("sms")
                    except Exception as e2:
                        print(f"[forgot-pin] whatsapp+sms send failed: {e2}")
        except Exception as e:
            print(f"[forgot-pin] twilio config failed: {e}")

    # Reset throttle alleen bij succesvolle verzending (anders moedigen we
    # iemand aan om met emptyresult te blijven proberen).
    if via:
        _pin_throttle_clear(throttle_key)
    else:
        _pin_throttle_fail(throttle_key)

    return {"ok": True, "via": via}


@api.get("/tenant-portal/me")
async def tenant_portal_me(tenant=Depends(get_tenant_session)):
    return {
        "id": tenant["id"],
        "name": tenant["name"],
        "email": tenant.get("email"),
        "phone": tenant.get("phone"),
    }


@api.get("/tenant-portal/overview")
async def tenant_portal_overview(tenant=Depends(get_tenant_session)):
    apt = None
    if tenant.get("apartment_id"):
        apt = await db.apartments.find_one({"id": tenant["apartment_id"]}, {"_id": 0})
    bal = await _calc_balance(tenant)
    return {
        "tenant": {"id": tenant["id"], "name": tenant["name"], "phone": tenant.get("phone"), "email": tenant.get("email")},
        "apartment": apt and {
            "id": apt["id"], "number": apt["number"], "address": apt.get("address", ""),
            "rent_amount": apt["rent_amount"], "currency": apt["currency"],
        },
        "balance": bal,
    }


@api.get("/tenant-portal/payments")
async def tenant_portal_payments(tenant=Depends(get_tenant_session)):
    docs = await db.payments.find({"tenant_id": tenant["id"]}, {"_id": 0}).sort("paid_at", -1).to_list(200)
    return await _enrich_payments_bulk(docs)


@api.get("/tenant-portal/contracts")
async def tenant_portal_contracts(tenant=Depends(get_tenant_session)):
    docs = await db.contracts.find({"tenant_id": tenant["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return [await _enrich_contract(d) for d in docs]


@api.get("/tenant-portal/maintenance")
async def tenant_portal_maintenance(tenant=Depends(get_tenant_session)):
    if not tenant.get("apartment_id"):
        return []
    docs = await db.maintenance.find({"apartment_id": tenant["apartment_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [await _enrich_maint(d) for d in docs]


# ---------------------------------------------------------------------------
# OCR + auto-approve voor bankafschriften (Gemini 2.5 Flash via Emergent LLM key).
# ---------------------------------------------------------------------------

OCR_AMOUNT_TOLERANCE_PCT = 0.01
OCR_AMOUNT_TOLERANCE_ABS = 1.0
OCR_DATE_WINDOW_DAYS = 21


async def _ocr_bank_statement(statement_id: str) -> dict:
    """Stuurt bankafschrift naar Gemini en haalt gestructureerde data op."""
    import os
    import json
    import tempfile
    from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY ontbreekt in environment")

    doc = await db.bank_statements.find_one({"id": statement_id}, {"_id": 0})
    if not doc:
        raise RuntimeError(f"Bankafschrift {statement_id} niet gevonden")

    raw = base64.b64decode(doc["data_b64"])
    ctype = (doc.get("content_type") or "").lower()
    if "pdf" in ctype:
        mime, suffix = "application/pdf", ".pdf"
    elif "png" in ctype:
        mime, suffix = "image/png", ".png"
    elif "webp" in ctype:
        mime, suffix = "image/webp", ".webp"
    else:
        mime, suffix = "image/jpeg", ".jpg"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
        f.write(raw)
        tmp_path = f.name

    prompt = (
        "Je bent een precieze OCR-extractie engine voor bankafschriften en "
        "betalingsbewijzen (Suriname DSB/Finabank, Nederlandse banken zoals "
        "ING/ABN/RABO). Analyseer het bijgevoegde document en haal de "
        "transactie-informatie eruit.\n\n"
        "Antwoord UITSLUITEND met geldig JSON (geen markdown, geen code-blok, "
        "geen uitleg) in dit exacte schema:\n"
        '{\n'
        '  "amount": <number of null>,\n'
        '  "currency": "SRD"|"EUR"|"USD"|null,\n'
        '  "date_iso": "YYYY-MM-DD" of null,\n'
        '  "payer_name": "<string>" of null,\n'
        '  "beneficiary": "<string>" of null,\n'
        '  "reference": "<string>" of null,\n'
        '  "confidence": <0..1>,\n'
        '  "raw_text": "<korte samenvatting>"\n'
        '}\n\n'
        "Belangrijk:\n"
        "- Als het document GEEN bankafschrift is, zet confidence op 0.\n"
        "- Bedragen: gebruik punt als decimaalteken (bv 7000.00).\n"
        "- Datum altijd in ISO-formaat YYYY-MM-DD.\n"
        "- Confidence = 1.0 alleen als ALLES duidelijk leesbaar is."
    )

    chat = LlmChat(
        api_key=api_key,
        session_id=f"ocr-{statement_id[:8]}",
        system_message="Je bent een OCR-extractie engine die uitsluitend geldig JSON terug geeft.",
    ).with_model("gemini", "gemini-2.5-flash")

    try:
        file_attach = FileContentWithMimeType(file_path=tmp_path, mime_type=mime)
        msg = UserMessage(text=prompt, file_contents=[file_attach])
        response_text = await chat.send_message(msg)
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    txt = (response_text or "").strip()
    if txt.startswith("```"):
        lines = txt.split("\n")
        txt = "\n".join(line for line in lines if not line.startswith("```"))
    try:
        result = json.loads(txt)
    except Exception as e:
        raise RuntimeError(f"OCR JSON parse faalde: {e}; raw={txt[:200]}")

    try:
        if result.get("amount") is not None:
            result["amount"] = float(result["amount"])
    except Exception:
        result["amount"] = None
    try:
        result["confidence"] = float(result.get("confidence") or 0)
    except Exception:
        result["confidence"] = 0.0
    return result


def _ocr_match_ok(ocr: dict, *, expected_amount: float, expected_currency: str):
    """Returns (ok, reasons[])."""
    reasons: list[str] = []
    if not ocr or not isinstance(ocr, dict):
        return False, ["geen OCR-resultaat"]
    conf = float(ocr.get("confidence") or 0)
    if conf < 0.7:
        reasons.append(f"lage confidence {conf:.2f}")
    ocr_amount = ocr.get("amount")
    if ocr_amount is None:
        reasons.append("geen bedrag gedetecteerd")
    else:
        diff = abs(float(ocr_amount) - float(expected_amount))
        tol = max(OCR_AMOUNT_TOLERANCE_ABS,
                  OCR_AMOUNT_TOLERANCE_PCT * float(expected_amount))
        if diff > tol:
            reasons.append(
                f"bedrag {ocr_amount} ≠ claim {expected_amount} (verschil {diff:.2f})"
            )
    ocr_curr = (ocr.get("currency") or "").upper()
    if ocr_curr and ocr_curr != (expected_currency or "").upper():
        reasons.append(f"valuta {ocr_curr} ≠ {expected_currency}")
    date_iso = ocr.get("date_iso")
    if date_iso:
        try:
            d = datetime.fromisoformat(date_iso)
            age_days = (now_utc().replace(tzinfo=None) - d).days
            if age_days > OCR_DATE_WINDOW_DAYS:
                reasons.append(f"afschrift {age_days} dagen oud (>21)")
            if age_days < -2:
                reasons.append("afschrift heeft toekomst-datum")
        except Exception:
            reasons.append(f"datum '{date_iso}' onleesbaar")
    else:
        reasons.append("geen datum gedetecteerd")
    return (len(reasons) == 0), reasons


async def _ocr_and_auto_approve_payment(*, payment_id: str, statement_id: str,
                                        expected_amount: float,
                                        expected_currency: str,
                                        tenant_name: str,
                                        company_id: Optional[str]):
    """Achtergrond-task: OCR + auto-approve indien match."""
    try:
        ocr = await _ocr_bank_statement(statement_id)
    except Exception as e:
        await db.payments.update_one(
            {"id": payment_id},
            {"$set": {"ocr_status": "failed", "ocr_error": str(e)[:300],
                      "ocr_run_at": iso(now_utc())}},
        )
        print(f"[ocr] payment={payment_id[:8]} faalde: {e}")
        return

    ok, reasons = _ocr_match_ok(
        ocr, expected_amount=expected_amount, expected_currency=expected_currency
    )
    ocr_doc = {
        "ocr_status": "matched" if ok else "mismatch",
        "ocr_amount": ocr.get("amount"),
        "ocr_currency": ocr.get("currency"),
        "ocr_date_iso": ocr.get("date_iso"),
        "ocr_payer_name": ocr.get("payer_name"),
        "ocr_beneficiary": ocr.get("beneficiary"),
        "ocr_reference": ocr.get("reference"),
        "ocr_confidence": ocr.get("confidence"),
        "ocr_raw_text": (ocr.get("raw_text") or "")[:500],
        "ocr_mismatch_reasons": reasons,
        "ocr_run_at": iso(now_utc()),
    }
    await db.payments.update_one({"id": payment_id}, {"$set": ocr_doc})

    if not ok:
        try:
            await _notify_company_admins(
                company_id,
                "OCR-controle: handmatige goedkeuring nodig",
                f"{tenant_name}: {', '.join(reasons[:2])}",
                {"kind": "payment_pending", "url": "/admin/payments",
                 "payment_id": payment_id, "badge_inc": 0},
            )
        except Exception:
            pass
        return

    p = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not p or p.get("status") != "pending_approval":
        return
    approved_at = iso(now_utc())

    matched_invoice = None
    if p.get("category") == "huur":
        inv_q = {"tenant_id": p["tenant_id"], "status": {"$ne": "paid"}}
        if company_id:
            inv_q["company_id"] = company_id
        if p.get("period_month") and p.get("period_year"):
            scoped_q = {**inv_q, "period_month": p["period_month"],
                        "period_year": p["period_year"]}
            matched_invoice = await db.invoices.find_one(scoped_q, {"_id": 0})
        if not matched_invoice:
            matched_invoice = await db.invoices.find_one(
                inv_q, {"_id": 0},
                sort=[("period_year", 1), ("period_month", 1)],
            )

    update = {
        "status": "approved", "approved_at": approved_at,
        "approved_by": "OCR auto-approve", "auto_approved": True,
    }
    if matched_invoice:
        update["invoice_id"] = matched_invoice["id"]
        update["invoice_number"] = matched_invoice.get("invoice_number")
    await db.payments.update_one({"id": payment_id}, {"$set": update})

    if matched_invoice:
        try:
            inv_amt = float(matched_invoice.get("amount") or 0)
            already_paid = matched_invoice.get("paid_amount")
            if already_paid is None:
                already_paid = await _invoice_currently_paid(matched_invoice["id"])
            open_on = max(0.0, round(inv_amt - float(already_paid or 0), 2))
            pay_amt = float(p.get("amount") or 0)
            primary = min(pay_amt, open_on) if open_on > 0 else pay_amt
            overflow = round(pay_amt - primary, 2)
            if primary > 0:
                await _apply_payment_to_invoice(
                    matched_invoice["id"], primary,
                    payment_id=p["id"], paid_at=approved_at,
                    method=p.get("method"),
                    receipt_number=p.get("receipt_number"),
                )
            if overflow > 0:
                other_ids: list[str] = []
                async for inv in db.invoices.find(
                    {"tenant_id": p["tenant_id"],
                     "currency": p.get("currency") or "SRD",
                     "status": {"$nin": ["paid", "cancelled"]},
                     "id": {"$ne": matched_invoice["id"]},
                     **({"company_id": company_id} if company_id else {})},
                    {"_id": 0, "id": 1},
                ).sort([("period_year", 1), ("period_month", 1)]):
                    other_ids.append(inv["id"])
                if other_ids:
                    await _allocate_payment_to_invoices(
                        other_ids, overflow,
                        payment_id=p["id"], paid_at=approved_at,
                        method=p.get("method"),
                        receipt_number=p.get("receipt_number"),
                    )
        except Exception as e:
            print(f"[ocr.auto-approve] invoice apply failed: {e}")

    try:
        await _notify_company_admins(
            company_id,
            "Bankoverschrijving automatisch goedgekeurd (OCR)",
            f"{tenant_name}: {expected_currency} {expected_amount:,.2f} — bedrag/datum kloppen",
            {"kind": "payment", "url": "/admin/payments",
             "payment_id": payment_id, "badge_inc": 1},
        )
    except Exception:
        pass




class TenantMaintenanceIn(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: Literal["low", "medium", "high"] = "medium"


class TenantPaymentIn(BaseModel):
    amount: float
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    method: Literal["contant", "bank", "mope", "sumup", "uni5pay"] = "contant"
    category: Literal["huur", "servicekosten", "borg", "boete", "internet", "overig", "vooruitbetaling"] = "huur"
    period_month: Optional[int] = None
    period_year: Optional[int] = None
    note: Optional[str] = ""
    invoice_id: Optional[str] = None
    # Bankoverschrijving-velden (alleen relevant als method == "bank")
    bank_country: Optional[Literal["SR", "NL"]] = None
    bank_statement_id: Optional[str] = None  # asset-id van geüpload afschrift


@api.post("/tenant-portal/bank-statement-upload")
async def tenant_bank_statement_upload(
    file: UploadFile = File(...), tenant=Depends(get_tenant_session)
):
    """Huurder upload bankafschrift (PDF/JPG/PNG, max 5 MB) als bewijs van
    bankoverschrijving. Asset wordt opgeslagen in `bank_statements` collectie
    (separate van landing_assets om eenvoudiger te scopen per company).

    Returns: {id, url} — id wordt meegestuurd in de payment payload.
    """
    raw = await file.read()
    if len(raw) > MAX_LANDING_ASSET_BYTES:
        raise HTTPException(status_code=413, detail="Bestand groter dan 5 MB.")
    ctype = (file.content_type or "").lower()
    allowed = ("image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf")
    if not any(ctype.startswith(a) or ctype == a for a in allowed):
        raise HTTPException(status_code=400, detail="Alleen PDF, JPG of PNG toegestaan.")
    asset_id = new_id()
    await db.bank_statements.insert_one({
        "id": asset_id,
        "filename": file.filename or f"afschrift-{asset_id}",
        "content_type": ctype,
        "data_b64": base64.b64encode(raw).decode("ascii"),
        "size": len(raw),
        "tenant_id": tenant["id"],
        "company_id": tenant.get("company_id"),
        "uploaded_at": iso(now_utc()),
    })
    return {"id": asset_id, "url": f"/api/bank-statements/{asset_id}", "size": len(raw)}


@api.get("/bank-statements/{asset_id}")
async def get_bank_statement(asset_id: str, user=Depends(get_current_user)):
    """Admin/owner/boekhouder kan bankafschrift inzien. Tenant-scoped via
    company_id zodat huurder van bedrijf A geen afschriften van B ziet."""
    cid = company_id_of(user)
    doc = await db.bank_statements.find_one(
        {"id": asset_id, **({"company_id": cid} if cid else {})}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Bankafschrift niet gevonden")
    try:
        data = base64.b64decode(doc["data_b64"])
    except Exception:
        raise HTTPException(status_code=500, detail="Bankafschrift corrupt")
    return Response(content=data, media_type=doc.get("content_type", "application/octet-stream"))


@api.get("/tenant-portal/invoices")
async def tenant_portal_invoices(tenant=Depends(get_tenant_session)):
    """Open + recent paid invoices voor de ingelogde huurder."""
    docs = await db.invoices.find(
        {"tenant_id": tenant["id"]}, {"_id": 0}
    ).sort([("period_year", -1), ("period_month", -1)]).to_list(200)
    return [await _enrich_invoice(d) for d in docs]


@api.post("/tenant-portal/payments", response_model=PaymentOut)
async def tenant_portal_create_payment(body: TenantPaymentIn, tenant=Depends(get_tenant_session)):
    """Huurder registreert zelf een betaling via de Kiosk.

    Bewijs-vereiste flow (bank, Mope, Uni5Pay):
      • method == "bank|mope|uni5pay" → status = "pending_approval"
      • bank_statement_id is verplicht (geüpload via /bank-statement-upload)
      • bank_country (alleen bij bank): "SR" of "NL"
      • Factuur blijft open tot OCR auto-approve of admin manual approve
    """
    is_bank = body.method == "bank"
    needs_proof = body.method in ("bank", "mope", "uni5pay")
    proof_label = {
        "bank": "Bankafschrift", "mope": "Mope betaalbewijs",
        "uni5pay": "Uni5Pay betaalbewijs",
    }.get(body.method, "Betaalbewijs")
    if needs_proof:
        if not body.bank_statement_id:
            raise HTTPException(
                status_code=400,
                detail=f"{proof_label} is verplicht.",
            )
        stmt = await db.bank_statements.find_one(
            {"id": body.bank_statement_id, "tenant_id": tenant["id"]},
            {"_id": 0, "id": 1, "filename": 1, "size": 1, "content_type": 1},
        )
        if not stmt:
            raise HTTPException(status_code=404, detail=f"{proof_label} niet gevonden")
        if is_bank and not body.bank_country:
            raise HTTPException(status_code=400, detail="Geef aan vanuit welk land u betaalt.")

    if body.invoice_id:
        inv = await db.invoices.find_one(
            {"id": body.invoice_id, "tenant_id": tenant["id"]}, {"_id": 0}
        )
        if not inv:
            raise HTTPException(status_code=404, detail="Factuur niet gevonden")
        period_month = body.period_month or inv.get("period_month")
        period_year = body.period_year or inv.get("period_year")
    else:
        period_month = body.period_month
        period_year = body.period_year
    pin = PaymentIn(
        tenant_id=tenant["id"],
        apartment_id=tenant.get("apartment_id"),
        amount=body.amount,
        currency=body.currency,
        method=body.method,
        category=body.category,
        period_month=period_month,
        period_year=period_year,
        note=body.note or "",
        received_by=tenant.get("name") or "Huurder Kiosk",
    )
    payment_status = "pending_approval" if needs_proof else "approved"
    doc = await _create_payment_doc(
        pin, company_id=tenant.get("company_id"),
        approved_by=tenant.get("name") or "Huurder Kiosk",
        status=payment_status,
    )
    # Voeg bewijs-metadata toe (bank/mope/uni5pay)
    if needs_proof:
        await db.payments.update_one(
            {"id": doc["id"]},
            {"$set": {
                "bank_country": body.bank_country if is_bank else None,
                "bank_statement_id": body.bank_statement_id,
                "bank_statement_filename": stmt.get("filename"),
                "bank_statement_size": stmt.get("size"),
                "bank_statement_content_type": stmt.get("content_type"),
                "submitted_at": iso(now_utc()),
            }},
        )
        doc["bank_country"] = body.bank_country if is_bank else None
        doc["bank_statement_id"] = body.bank_statement_id
        doc["bank_statement_filename"] = stmt.get("filename")
        # Vuur-en-vergeet OCR + auto-approve in achtergrond zodat de huurder
        # direct een snelle "Verstuurd ter goedkeuring" bevestiging krijgt.
        try:
            import asyncio as _asyncio
            _asyncio.create_task(_ocr_and_auto_approve_payment(
                payment_id=doc["id"],
                statement_id=body.bank_statement_id,
                expected_amount=float(doc.get("amount") or 0),
                expected_currency=doc.get("currency") or body.currency,
                tenant_name=tenant.get("name") or "",
                company_id=tenant.get("company_id"),
            ))
        except Exception as e:
            print(f"[ocr] kon achtergrond OCR niet starten: {e}")
    enriched = await _enrich_payment(doc)
    # Notify admins of the company about the self-service payment.
    try:
        if needs_proof:
            method_label = {"bank": "Bankoverschrijving", "mope": "Mope-betaling",
                            "uni5pay": "Uni5Pay-betaling"}.get(body.method, "Betaling")
            extra = ""
            if is_bank:
                extra = f" ({'Suriname' if body.bank_country == 'SR' else 'Nederland'})"
            title = f"{method_label} wacht op goedkeuring · {enriched.get('currency', '')} {float(enriched.get('amount', 0)):,.2f}"
            body_msg = f"{enriched.get('tenant_name') or tenant.get('name')}{extra} — controleer bewijs"
            kind = "payment_pending"
        else:
            title = f"Huurder-betaling {enriched.get('currency', '')} {float(enriched.get('amount', 0)):,.2f}"
            body_msg = f"{enriched.get('tenant_name') or tenant.get('name')} via Huurder Kiosk"
            kind = "payment"
        await _notify_company_admins(
            tenant.get("company_id"), title, body_msg,
            {"kind": kind, "url": "/admin/payments", "payment_id": enriched.get("id"), "badge_inc": 1},
        )
    except Exception as e:
        print(f"[push] tenant-portal payment notify failed: {e}")
    return enriched


@api.post("/tenant-portal/maintenance")
async def tenant_portal_maintenance_create(body: TenantMaintenanceIn, tenant=Depends(get_tenant_session)):
    if not tenant.get("apartment_id"):
        raise HTTPException(status_code=400, detail="U bent niet gekoppeld aan een appartement")
    cid = tenant.get("company_id")
    if not cid:
        # Fallback: lookup via apartment om robuust te zijn voor oude tenant-records
        apt = await db.apartments.find_one(
            {"id": tenant["apartment_id"]}, {"_id": 0, "company_id": 1}
        )
        cid = (apt or {}).get("company_id")
    doc = {
        "id": new_id(),
        "company_id": cid,
        "apartment_id": tenant["apartment_id"],
        "title": body.title,
        "description": body.description or "",
        "priority": body.priority,
        "cost": 0,
        "currency": "SRD",
        "status": "open",
        "created_at": iso(now_utc()),
        "resolved_at": None,
        "created_by_tenant": tenant["id"],
    }
    await db.maintenance.insert_one(doc)
    doc.pop("_id", None)
    enriched = await _enrich_maint(doc)
    # Notify alle admins/owners/boekhouders van het bedrijf zodat ze een
    # push-melding én een SSE-update krijgen, en de melding direct in de
    # admin maintenance lijst verschijnt.
    try:
        prio_label = {
            "low": "lage", "medium": "normale", "high": "hoge",
        }.get(body.priority, body.priority or "")
        prio_prefix = f"[{prio_label} prioriteit] " if prio_label else ""
        apt_lbl = enriched.get("apartment_number") or "appartement"
        tenant_name = tenant.get("name") or "Huurder"
        await _notify_company_admins(
            cid,
            f"Nieuwe onderhoudsmelding · {apt_lbl}",
            f"{prio_prefix}{tenant_name}: {body.title}",
            {
                "kind": "maintenance",
                "url": "/admin/maintenance",
                "maintenance_id": enriched.get("id"),
                "badge_inc": 1,
            },
        )
    except Exception as e:
        print(f"[push] tenant-portal maintenance notify failed: {e}")
    return enriched


# =====================================================================
# Apartment routes (admin)
# =====================================================================
def _strip_doc(doc):
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


async def _enrich_apartment(apt: dict) -> dict:
    tenant_name = None
    if apt.get("tenant_id"):
        t = await db.tenants.find_one({"id": apt["tenant_id"]}, {"_id": 0, "name": 1})
        tenant_name = t["name"] if t else None
    return {**apt, "tenant_name": tenant_name}


@api.get("/apartments", response_model=List[ApartmentOut])
async def list_apartments(user=Depends(get_current_user)):
    docs = await db.apartments.find(scope(user), {"_id": 0}).sort("number", 1).to_list(1000)
    return [await _enrich_apartment(d) for d in docs]


@api.post("/apartments", response_model=ApartmentOut)
async def create_apartment(body: ApartmentIn, user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    doc = {
        "id": new_id(),
        "company_id": cid,
        **body.model_dump(),
        "status": "vacant",
        "tenant_id": None,
        "created_at": iso(now_utc()),
    }
    await db.apartments.insert_one(doc)
    doc.pop("_id", None)
    return await _enrich_apartment(doc)


@api.put("/apartments/{apt_id}", response_model=ApartmentOut)
async def update_apartment(apt_id: str, body: ApartmentIn, user=Depends(get_current_user)):
    from pymongo import ReturnDocument
    res = await db.apartments.find_one_and_update(
        {"id": apt_id, **scope(user)}, {"$set": body.model_dump()},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    return await _enrich_apartment(res)


@api.delete("/apartments/{apt_id}")
async def delete_apartment(apt_id: str, user=Depends(get_current_user)):
    apt = await db.apartments.find_one({"id": apt_id, **scope(user)}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    if apt.get("tenant_id"):
        await db.tenants.update_one({"id": apt["tenant_id"]}, {"$set": {"apartment_id": None}})
    await db.apartments.delete_one({"id": apt_id})
    return {"ok": True}


@api.post("/apartments/{apt_id}/assign-tenant")
async def assign_tenant(apt_id: str, body: dict, user=Depends(get_current_user)):
    tenant_id = body.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id is verplicht")
    apt = await db.apartments.find_one({"id": apt_id, **scope(user)}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    tenant = await db.tenants.find_one({"id": tenant_id, **scope(user)}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    if apt.get("tenant_id"):
        await db.tenants.update_one({"id": apt["tenant_id"]}, {"$set": {"apartment_id": None}})
    if tenant.get("apartment_id") and tenant["apartment_id"] != apt_id:
        await db.apartments.update_one(
            {"id": tenant["apartment_id"]},
            {"$set": {"tenant_id": None, "status": "vacant"}},
        )
    await db.apartments.update_one(
        {"id": apt_id}, {"$set": {"tenant_id": tenant_id, "status": "occupied"}}
    )
    await db.tenants.update_one({"id": tenant_id}, {"$set": {"apartment_id": apt_id}})
    return {"ok": True}


@api.post("/apartments/{apt_id}/remove-tenant")
async def remove_tenant(apt_id: str, user=Depends(get_current_user)):
    apt = await db.apartments.find_one({"id": apt_id, **scope(user)}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    if apt.get("tenant_id"):
        await db.tenants.update_one(
            {"id": apt["tenant_id"]}, {"$set": {"apartment_id": None}}
        )
    await db.apartments.update_one(
        {"id": apt_id}, {"$set": {"tenant_id": None, "status": "vacant"}}
    )
    return {"ok": True}


@api.get("/tenant-portal/lookup-apartment/{apt_id}")
async def tenant_portal_lookup_apartment(apt_id: str):
    """Publiek (zonder auth): wordt aangeroepen door de Huurder Kiosk wanneer
    de QR-sticker bij de voordeur is gescand met `?apt=<id>` in de URL.

    Geeft minimaal genoeg info terug om de PIN-stap voor te bereiden:
    - tenant naam + e-mailadres (nodig voor `/tenant-portal/login`)
    - appartement-nummer en eventuele bedrijfsnaam (voor de header)

    De PIN blijft de enige beveiligingslaag — niemand kan zonder PIN inloggen.
    """
    apt = await db.apartments.find_one({"id": apt_id}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    tenant = None
    if apt.get("tenant_id"):
        tenant = await db.tenants.find_one(
            {"id": apt["tenant_id"]},
            {"_id": 0, "name": 1, "email": 1, "phone": 1, "pin_hash": 1},
        )
    if not tenant or not tenant.get("pin_hash"):
        raise HTTPException(status_code=404, detail="Geen huurder met PIN op dit appartement")
    company_name = None
    if apt.get("company_id"):
        c = await db.companies.find_one({"id": apt["company_id"]}, {"_id": 0, "name": 1})
        company_name = (c or {}).get("name")
    return {
        "apartment": {"id": apt["id"], "number": apt["number"], "address": apt.get("address", "")},
        "tenant": {
            "name": tenant.get("name"),
            "email": tenant.get("email"),
            "first_name": (tenant.get("name") or "").split(" ")[0] or None,
        },
        "company": {"name": company_name},
    }


@api.get("/apartments/{apt_id}/kiosk-sticker.pdf")
async def apartment_kiosk_sticker(apt_id: str, request: Request):
    """Genereert een A4 print-poster met QR-code → `/c/<slug>/kiosk/huurder?apt=<id>`.
    Publiek (geen auth) zodat de beheerder de link direct in een nieuw
    tabblad kan openen — het PDF bevat enkel het appartement-nummer en
    de huurder-naam (al fysiek leesbaar bij de voordeur)."""
    apt = await db.apartments.find_one({"id": apt_id}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    tenant_name = None
    if apt.get("tenant_id"):
        t = await db.tenants.find_one({"id": apt["tenant_id"]}, {"_id": 0, "name": 1})
        tenant_name = (t or {}).get("name")
    company_name = "SuriRent"
    primary_hex = "#FF5C00"
    slug = ""
    cid = apt.get("company_id")
    if cid:
        c = await db.companies.find_one({"id": cid}, {"_id": 0, "name": 1, "slug": 1, "branding": 1})
        if c:
            company_name = c.get("name") or company_name
            primary_hex = ((c.get("branding") or {}).get("primary_color")) or primary_hex
            slug = c.get("slug") or ""
    # Bouw een absolute URL met scheme + host. Als we de bedrijfsslug kennen
    # gebruiken we het branded pad zodat de juiste kleuren laden bij scan.
    # Per-tenant: gebruik `?t=<tenant_id>` zodat de huurder bij eerste scan
    # direct een PIN kan kiezen (welkom-flow) en daarna altijd herkend wordt.
    # Fallback `?apt=` blijft werken voor stickers van vóór deze feature.
    base = _company_base_url(request) or _public_url("")
    tenant_param = f"?t={apt['tenant_id']}" if apt.get("tenant_id") else f"?apt={apt_id}"
    if slug:
        kiosk_url = f"{base}/{slug}/kiosk/huurder{tenant_param}"
    else:
        kiosk_url = f"{base}/kiosk/huurder{tenant_param}"
    from pdf_gen import kiosk_sticker_pdf
    pdf = kiosk_sticker_pdf(
        apartment_number=apt.get("number", "—"),
        address=apt.get("address", "") or "",
        tenant_name=tenant_name,
        company_name=company_name,
        kiosk_url=kiosk_url,
        primary_hex=primary_hex,
    )
    return _pdf_response(pdf, f"kiosk-sticker-{apt.get('number', apt_id)}.pdf")


@api.get("/tenants/{tenant_id}/qr-plate.pdf")
async def tenant_qr_plate(tenant_id: str, request: Request, refresh: int = 0,
                          size: str = "medium"):
    """Luxueuze "gouden plaat" QR-poster per huurder voor naast de voordeur.
    Bevat persoonlijke QR (?t=<tenant_id>) zodat huurder bij eerste scan
    een eigen PIN kan kiezen. Publiek (geen auth) zodat beheerder de link
    direct in een nieuw tabblad kan openen voor afdrukken.

    Query params:
        refresh=1                       → bypass de cache en regenereer via AI.
        size=small|medium|large         → PDF-pagina formaat:
            • small  = 200×133 mm (~A5 landschap)
            • medium = 300×200 mm (~A4 landschap, default)
            • large  = 400×267 mm (~A3 landschap)
    """
    size = (size or "medium").lower().strip()
    if size not in ("small", "medium", "large"):
        size = "medium"
    t = await db.tenants.find_one(
        {"id": tenant_id},
        {"_id": 0, "id": 1, "name": 1, "company_id": 1, "apartment_id": 1},
    )
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    # Appartement info ophalen
    apt_number = "—"
    address = ""
    if t.get("apartment_id"):
        a = await db.apartments.find_one(
            {"id": t["apartment_id"]}, {"_id": 0, "number": 1, "address": 1}
        )
        if a:
            apt_number = a.get("number") or apt_number
            address = a.get("address") or ""
    # Bedrijf branding ophalen
    company_name = "SuriRent"
    accent_hex = "#D4AF37"  # default goud
    company_logo_bytes = None
    slug = ""
    cid = t.get("company_id")
    if cid:
        c = await db.companies.find_one(
            {"id": cid}, {"_id": 0, "name": 1, "slug": 1, "branding": 1, "logo_url": 1}
        )
        if c:
            company_name = c.get("name") or company_name
            slug = c.get("slug") or ""
            # Probeer logo te laden uit branding.logo_url
            logo_url = (c.get("branding") or {}).get("logo_url") or c.get("logo_url")
            if logo_url:
                brand = await _company_brand_info(cid)
                company_logo_bytes = (brand or {}).get("company_logo_bytes")
    # URL bouwen — persoonlijke huurder-QR
    base = _company_base_url(request) or _public_url("")
    if slug:
        kiosk_url = f"{base}/{slug}/kiosk/huurder?t={tenant_id}"
    else:
        kiosk_url = f"{base}/kiosk/huurder?t={tenant_id}"
    from pdf_gen import luxury_plate_pdf, luxury_plate_pdf_ai
    import hashlib as _hashlib
    # Cache key: tenant + alle dynamische inputs. Voorkomt herhaald LLM-budget
    # verbruik bij elke download.
    cache_inputs = f"{tenant_id}|{company_name}|{apt_number}|{address}|{kiosk_url}|{size}|v10"
    cache_hash = _hashlib.sha256(cache_inputs.encode("utf-8")).hexdigest()
    cached = await db.qr_plate_cache.find_one(
        {"hash": cache_hash}, {"_id": 0, "pdf_b64": 1}
    ) if not refresh else None
    if cached and cached.get("pdf_b64"):
        import base64 as _b64
        pdf = _b64.b64decode(cached["pdf_b64"])
    else:
        try:
            pdf = await luxury_plate_pdf_ai(
                tenant_name=t.get("name") or "",
                apartment_number=apt_number,
                address=address,
                company_name=company_name,
                kiosk_url=kiosk_url,
                company_logo=company_logo_bytes,
                accent_hex=accent_hex,
                size=size,
            )
        except Exception as e:
            # Fallback naar PIL-versie als AI faalt (offline, quota, etc.)
            import logging as _logging
            _logging.getLogger("uvicorn.error").warning(
                f"AI plaque generatie faalde, fallback naar PIL: {e}"
            )
            pdf = luxury_plate_pdf(
                tenant_name=t.get("name") or "",
                apartment_number=apt_number,
                address=address,
                company_name=company_name,
                kiosk_url=kiosk_url,
                company_logo=company_logo_bytes,
                accent_hex=accent_hex,
                size=size,
            )
        else:
            # Alleen succesvolle AI-renders cachen
            import base64 as _b64
            await db.qr_plate_cache.update_one(
                {"hash": cache_hash},
                {"$set": {
                    "hash": cache_hash,
                    "tenant_id": tenant_id,
                    "pdf_b64": _b64.b64encode(pdf).decode("ascii"),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
    safe_name = (t.get("name") or "huurder").split()[0].lower()
    return _pdf_response(pdf, f"qr-plaat-{safe_name}-{apt_number}.pdf")


@api.get("/companies/me/portal-poster.pdf")
async def company_portal_poster(request: Request, user=Depends(get_current_user)):
    """A6 printbare poster met QR-code naar het algemene huurportaal van het
    bedrijf (`/c/<slug>/huurder`). Handig om als sticker bij de receptie of
    in een welkomstmap op te hangen — huurders scannen, vullen email/telefoon
    + PIN in en zijn binnen."""
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf")
    c = await db.companies.find_one({"id": cid}, {"_id": 0, "name": 1, "slug": 1, "branding": 1})
    if not c or not c.get("slug"):
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    base = _company_base_url(request) or _public_url("")
    portal_url = f"{base}/{c['slug']}/kiosk/huurder"
    primary_hex = ((c.get("branding") or {}).get("primary_color")) or "#FF5C00"
    from pdf_gen import portal_poster_pdf
    pdf = portal_poster_pdf(
        company_name=c.get("name") or "SuriRent",
        portal_url=portal_url,
        primary_hex=primary_hex,
    )
    return _pdf_response(pdf, f"huurportaal-{c['slug']}.pdf")


@api.get("/tenants/{tenant_id}/portal-poster.pdf")
async def tenant_portal_poster(tenant_id: str, request: Request, user=Depends(get_current_user)):
    """Per-huurder A6 portal-poster — de QR linkt naar `/c/<slug>/huurder?identifier=<email_of_telefoon>`,
    zodat de huurder alleen een PIN hoeft in te tikken om in te loggen."""
    t = await db.tenants.find_one(
        {"id": tenant_id, **scope(user)},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "company_id": 1, "apartment_id": 1},
    )
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    cid = t.get("company_id") or company_id_of(user)
    c = await db.companies.find_one({"id": cid}, {"_id": 0, "name": 1, "slug": 1, "branding": 1})
    if not c or not c.get("slug"):
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    apt_number, apt_address = None, None
    if t.get("apartment_id"):
        a = await db.apartments.find_one(
            {"id": t["apartment_id"]}, {"_id": 0, "number": 1, "address": 1},
        )
        if a:
            apt_number = a.get("number")
            apt_address = a.get("address")
    # Huurportaal = Huurder Kiosk (PIN-only). De QR linkt voor alle huurders
    # naar dezelfde route — de PIN identificeert de huurder. We tonen op de
    # poster wel naam + appartement zodat iedereen weet welke sticker bij
    # welk huis hoort.
    base = _company_base_url(request) or _public_url("")
    portal_url = f"{base}/{c['slug']}/kiosk/huurder"
    primary_hex = ((c.get("branding") or {}).get("primary_color")) or "#FF5C00"
    from pdf_gen import portal_poster_pdf
    pdf = portal_poster_pdf(
        company_name=c.get("name") or "SuriRent",
        portal_url=portal_url,
        tenant_name=t.get("name"),
        apartment_number=apt_number,
        apartment_address=apt_address,
        primary_hex=primary_hex,
    )
    safe_name = "".join(ch for ch in (t.get("name") or tenant_id) if ch.isalnum() or ch in "-_") or tenant_id
    return _pdf_response(pdf, f"huurportaal-{safe_name}.pdf")


# =====================================================================
# Tenants
# =====================================================================
async def _enrich_tenant(t: dict) -> dict:
    apt_number, rent, cur = None, None, None
    if t.get("apartment_id"):
        a = await db.apartments.find_one(
            {"id": t["apartment_id"]},
            {"_id": 0, "number": 1, "rent_amount": 1, "currency": 1},
        )
        if a:
            apt_number = a.get("number")
            rent = a.get("rent_amount")
            cur = a.get("currency")
    return {**t, "apartment_number": apt_number, "rent_amount": rent, "currency": cur}


@api.get("/tenants", response_model=List[TenantOut])
async def list_tenants(user=Depends(get_current_user)):
    docs = await db.tenants.find(scope(user), {"_id": 0}).sort("name", 1).to_list(1000)
    return [await _enrich_tenant(d) for d in docs]


@api.post("/tenants", response_model=TenantOut)
async def create_tenant(body: TenantIn, user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    payload = body.model_dump()
    if payload.get("email"):
        payload["email"] = payload["email"].strip().lower()
    payload["phone_digits"] = "".join(ch for ch in (payload.get("phone") or "") if ch.isdigit())
    doc = {"id": new_id(), "company_id": cid, **payload, "created_at": iso(now_utc())}
    await db.tenants.insert_one(doc)
    doc.pop("_id", None)
    if doc.get("apartment_id"):
        await db.apartments.update_one(
            {"id": doc["apartment_id"], **scope(user)},
            {"$set": {"tenant_id": doc["id"], "status": "occupied"}},
        )
    return await _enrich_tenant(doc)


@api.put("/tenants/{tenant_id}", response_model=TenantOut)
async def update_tenant(tenant_id: str, body: TenantIn, user=Depends(get_current_user)):
    from pymongo import ReturnDocument
    payload = body.model_dump()
    if payload.get("email"):
        payload["email"] = payload["email"].strip().lower()
    payload["phone_digits"] = "".join(ch for ch in (payload.get("phone") or "") if ch.isdigit())
    res = await db.tenants.find_one_and_update(
        {"id": tenant_id, **scope(user)}, {"$set": payload},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    return await _enrich_tenant(res)


@api.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, user=Depends(get_current_user)):
    t = await db.tenants.find_one({"id": tenant_id, **scope(user)}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    if t.get("apartment_id"):
        await db.apartments.update_one(
            {"id": t["apartment_id"]}, {"$set": {"tenant_id": None, "status": "vacant"}}
        )
    await db.tenants.delete_one({"id": tenant_id})
    return {"ok": True}


# =====================================================================
# Payments (admin)
# =====================================================================
async def _next_receipt_number() -> str:
    # KW{year}-{seq 5 digits}
    from pymongo import ReturnDocument
    year = now_utc().year
    counter = await db.counters.find_one_and_update(
        {"_id": f"receipt_{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    seq = counter.get("seq", 1)
    return f"KW{year}-{seq:05d}"


async def _company_brand_info(company_id: Optional[str]) -> dict:
    """Geef bedrijfs-branding info voor PDF headers (name, address, phone,
    email, logo_bytes, signature_data). Lege dict bij geen company_id."""
    if not company_id:
        return {}
    co = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "name": 1, "contact_email": 1, "contact_phone": 1,
         "address": 1, "branding": 1},
    ) or {}
    settings = await db.company_settings.find_one(
        {"company_id": company_id}, {"_id": 0, "signature_data": 1},
    ) or {}
    # Logo bytes ophalen via asset_id uit branding.logo_url
    logo_bytes = None
    logo_url = (co.get("branding") or {}).get("logo_url") or ""
    if logo_url:
        try:
            # logo_url is meestal "/api/landing/asset/<id>"
            asset_id = logo_url.rsplit("/", 1)[-1]
            if asset_id:
                doc = await db.landing_assets.find_one({"id": asset_id}, {"_id": 0, "data_b64": 1})
                if doc and doc.get("data_b64"):
                    logo_bytes = base64.b64decode(doc["data_b64"])
        except Exception:
            logo_bytes = None
    return {
        "company_name": co.get("name") or "",
        "company_address": co.get("address") or "",
        "company_phone": co.get("contact_phone") or "",
        "company_email": co.get("contact_email") or "",
        "company_logo_bytes": logo_bytes,
        "company_primary_color": (co.get("branding") or {}).get("primary_color") or "#FF5C00",
        "signature_data": settings.get("signature_data") or "",
    }



async def _enrich_payment(p: dict) -> dict:
    tenant_name = None
    apt_number = None
    location_name = None
    if p.get("tenant_id"):
        t = await db.tenants.find_one({"id": p["tenant_id"]}, {"_id": 0, "name": 1})
        tenant_name = t["name"] if t else None
    if p.get("apartment_id"):
        a = await db.apartments.find_one(
            {"id": p["apartment_id"]}, {"_id": 0, "number": 1, "location_id": 1}
        )
        if a:
            apt_number = a.get("number")
            if a.get("location_id"):
                loc = await db.locations.find_one({"id": a["location_id"]}, {"_id": 0, "name": 1})
                if loc:
                    location_name = loc.get("name")
    # Bedrijfsinfo voor de PDF-header (branding-look uit voorbeeld).
    company_info = {}
    if p.get("company_id"):
        brand = await _company_brand_info(p["company_id"])
        company_info = brand
    # Openstaand na deze betaling — som van remaining_amount over alle
    # niet-betaalde facturen van deze huurder, in dezelfde currency.
    outstanding_after = 0.0
    if p.get("tenant_id"):
        try:
            cur = p.get("currency") or "SRD"
            async for inv in db.invoices.find(
                {"tenant_id": p["tenant_id"], "currency": cur,
                 "status": {"$nin": ["paid", "cancelled"]}},
                {"_id": 0, "amount": 1, "paid_amount": 1, "id": 1},
            ):
                inv_amt = float(inv.get("amount") or 0)
                paid = inv.get("paid_amount")
                if paid is None:
                    paid = await _invoice_currently_paid(inv["id"])
                outstanding_after += max(0.0, inv_amt - float(paid or 0))
        except Exception:
            pass
    return {**p, "tenant_name": tenant_name, "apartment_number": apt_number,
            "location_name": location_name,
            "outstanding_after": round(outstanding_after, 2),
            **company_info}


async def _enrich_payments_bulk(payments: list[dict]) -> list[dict]:
    """Bulk-versie van _enrich_payment voor lijst-endpoints. Reduceert
    queries van O(N) per payment naar O(1) constante batch-fetches.

    Voorheen: 200 payments × 4-6 queries = 800-1200 DB calls.
    Nu: 4 batch-queries + 1 brand-lookup per unieke company. Voor één
    bedrijf met 200 betalingen: ~5 queries totaal.
    """
    if not payments:
        return []
    tenant_ids = {p["tenant_id"] for p in payments if p.get("tenant_id")}
    apt_ids = {p["apartment_id"] for p in payments if p.get("apartment_id")}
    company_ids = {p["company_id"] for p in payments if p.get("company_id")}

    # Parallel: tenants + apartments + companies
    tenants_task = db.tenants.find(
        {"id": {"$in": list(tenant_ids)}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(None) if tenant_ids else asyncio.sleep(0, result=[])
    apartments_task = db.apartments.find(
        {"id": {"$in": list(apt_ids)}}, {"_id": 0, "id": 1, "number": 1, "location_id": 1}
    ).to_list(None) if apt_ids else asyncio.sleep(0, result=[])
    tenants, apartments = await asyncio.gather(tenants_task, apartments_task)
    tenant_by_id = {t["id"]: t for t in tenants}
    apt_by_id = {a["id"]: a for a in apartments}

    # Locations — alleen voor de apartments die er een hebben
    loc_ids = {a.get("location_id") for a in apartments if a.get("location_id")}
    locs = await db.locations.find(
        {"id": {"$in": list(loc_ids)}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(None) if loc_ids else []
    loc_by_id = {loc["id"]: loc for loc in locs}

    # Brand info per company — éénmaal per unieke company gecached.
    # We strippen `company_logo_bytes` (binary PNG) zodat FastAPI's JSON
    # encoder niet faalt op de bytes; logo wordt enkel gebruikt in PDF
    # generatie, niet in lijst-endpoints.
    brand_cache = {}
    for cid in company_ids:
        b = await _company_brand_info(cid)
        if b:
            b = {k: v for k, v in b.items() if k != "company_logo_bytes"}
        brand_cache[cid] = b

    # Outstanding-per-tenant: groepeer alle openstaande facturen per
    # (tenant_id, currency) zodat we sommen kunnen pre-rekenen.
    outstanding_by_tenant_cur: dict[tuple[str, str], float] = {}
    if tenant_ids:
        async for inv in db.invoices.find(
            {"tenant_id": {"$in": list(tenant_ids)},
             "status": {"$nin": ["paid", "cancelled"]}},
            {"_id": 0, "id": 1, "tenant_id": 1, "currency": 1,
             "amount": 1, "paid_amount": 1},
        ):
            tid = inv.get("tenant_id")
            cur = inv.get("currency") or "SRD"
            inv_amt = float(inv.get("amount") or 0)
            paid = inv.get("paid_amount")
            if paid is None:
                # Fallback wanneer paid_amount niet gemigreerd is — alleen
                # voor deze ene factuur, niet voor alle.
                paid = await _invoice_currently_paid(inv["id"])
            outstanding_by_tenant_cur[(tid, cur)] = (
                outstanding_by_tenant_cur.get((tid, cur), 0.0)
                + max(0.0, inv_amt - float(paid or 0))
            )

    # Bouw de output
    out = []
    for p in payments:
        tid = p.get("tenant_id")
        aid = p.get("apartment_id")
        cid = p.get("company_id")
        t = tenant_by_id.get(tid) if tid else None
        a = apt_by_id.get(aid) if aid else None
        loc = loc_by_id.get(a.get("location_id")) if a and a.get("location_id") else None
        cur = p.get("currency") or "SRD"
        out.append({
            **p,
            "tenant_name": t.get("name") if t else None,
            "apartment_number": a.get("number") if a else None,
            "location_name": loc.get("name") if loc else None,
            "outstanding_after": round(outstanding_by_tenant_cur.get((tid, cur), 0.0), 2),
            **(brand_cache.get(cid) or {}),
        })
    return out


async def _invoice_currently_paid(invoice_id: str) -> float:
    """Som van alle approved payments die aan deze factuur gelinkt zijn.
    Wordt gebruikt voor fallback wanneer `paid_amount` nog niet gemigreerd is."""
    total = 0.0
    async for p in db.payments.find(
        {"invoice_id": invoice_id, "status": "approved"}, {"_id": 0, "amount": 1},
    ):
        try:
            total += float(p.get("amount") or 0)
        except Exception:
            pass
    return round(total + 1e-9, 2)


async def _apply_payment_to_invoice(invoice_id: str, amount: float,
                                    payment_id: Optional[str] = None,
                                    paid_at: Optional[str] = None,
                                    method: Optional[str] = None,
                                    receipt_number: Optional[str] = None) -> dict:
    """Past `amount` toe op factuur:
       • paid_amount += amount (cumulatief — meerdere partial-payments mogelijk)
       • status → 'paid' wanneer paid_amount >= 95% van het factuurbedrag
       Retourneert de bijgewerkte factuur (of {} bij ontbreken).
    """
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        return {}
    inv_amt = float(inv.get("amount") or 0)
    # Migratie-fallback: als paid_amount nog niet bestaat, bereken uit payments.
    if inv.get("paid_amount") is None:
        existing = await _invoice_currently_paid(invoice_id)
        # Trek de huidige payment_id ervan af als die al meegerekend wordt
        # — anders dubbel-tellen we. Het payment doc staat al in DB op moment
        # van aanroep van deze helper, dus we subtraheren `amount` (de delta).
        base = max(0.0, existing - float(amount or 0))
        await db.invoices.update_one(
            {"id": invoice_id}, {"$set": {"paid_amount": round(base, 2)}}
        )
        inv["paid_amount"] = round(base, 2)
    new_paid = round(float(inv.get("paid_amount") or 0) + float(amount or 0), 2)
    update = {"paid_amount": new_paid}
    if payment_id:
        update["payment_id"] = payment_id
    if method:
        update["paid_method"] = method
    if receipt_number:
        update["receipt_number"] = receipt_number
    if inv_amt <= 0 or new_paid >= inv_amt * 0.95:
        update["status"] = "paid"
        update["paid_at"] = paid_at or iso(now_utc())
    await db.invoices.update_one({"id": invoice_id}, {"$set": update})
    inv.update(update)
    return inv


async def _allocate_payment_to_invoices(
    invoice_ids: List[str], amount: float, payment_id: Optional[str],
    paid_at: Optional[str] = None, method: Optional[str] = None,
    receipt_number: Optional[str] = None,
) -> float:
    """FIFO-allocatie: verdeel `amount` over de opgegeven facturen
    (oudst eerst, oude facturen krijgen voorrang). Stopt zodra het bedrag
    op is. Retourneert het werkelijk gealloceerde bedrag."""
    if not invoice_ids or amount <= 0:
        return 0.0
    # Haal facturen op + sorteer oudst-eerst (period_year, period_month, created_at)
    invs: list = []
    async for inv in db.invoices.find({"id": {"$in": invoice_ids}}, {"_id": 0}):
        invs.append(inv)
    invs.sort(key=lambda x: (
        x.get("period_year", 0), x.get("period_month", 0), x.get("created_at") or "",
    ))
    remaining = float(amount)
    allocated = 0.0
    for inv in invs:
        if remaining <= 0:
            break
        inv_amt = float(inv.get("amount") or 0)
        # Bepaal hoeveel deze factuur nog open heeft.
        if inv.get("paid_amount") is None:
            existing = await _invoice_currently_paid(inv["id"])
        else:
            existing = float(inv.get("paid_amount") or 0)
        open_amt = max(0.0, round(inv_amt - existing, 2))
        if open_amt <= 0:
            continue
        chunk = round(min(remaining, open_amt), 2)
        await _apply_payment_to_invoice(
            inv["id"], chunk, payment_id=payment_id, paid_at=paid_at,
            method=method, receipt_number=receipt_number,
        )
        remaining = round(remaining - chunk, 2)
        allocated = round(allocated + chunk, 2)
    return allocated



async def _create_payment_doc(body: PaymentIn, company_id: Optional[str] = None,
                              approved_by: Optional[str] = None,
                              status: str = "approved",
                              kiosk_employee_id: Optional[str] = None,
                              kiosk_employee_name: Optional[str] = None,
                              approved_at: Optional[str] = None,
                              approved_by_user_id: Optional[str] = None) -> dict:
    q = {"id": body.tenant_id}
    if company_id:
        q["company_id"] = company_id
    tenant = await db.tenants.find_one(q, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    apt_id = body.apartment_id or tenant.get("apartment_id")
    receipt_no = await _next_receipt_number()
    company_name = ""
    if company_id:
        c = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1})
        company_name = (c or {}).get("name", "")
    paid_at = iso(now_utc())
    # Automatisch koppelen aan een openstaande factuur:
    #  • Alleen voor categorie "huur" (overige categorieën hebben geen factuur).
    #  • Match op tenant + period_month + period_year wanneer beide aanwezig zijn.
    #  • Anders: pak de oudst openstaande huur-factuur van deze huurder.
    #  • Bij pending_approval: koppelen we NIET automatisch — pas bij goedkeuring.
    matched_invoice = None
    if body.category == "huur" and status == "approved":
        inv_q = {"tenant_id": body.tenant_id, "status": {"$ne": "paid"}}
        if company_id:
            inv_q["company_id"] = company_id
        if body.period_month and body.period_year:
            scoped = {**inv_q, "period_month": body.period_month, "period_year": body.period_year}
            matched_invoice = await db.invoices.find_one(scoped, {"_id": 0})
        if not matched_invoice:
            matched_invoice = await db.invoices.find_one(
                inv_q, {"_id": 0}, sort=[("period_year", 1), ("period_month", 1)]
            )
    doc = {
        "id": new_id(),
        "company_id": company_id or tenant.get("company_id"),
        "tenant_id": body.tenant_id,
        "apartment_id": apt_id,
        "amount": body.amount,
        "currency": body.currency,
        "method": body.method,
        "category": body.category,
        "period_month": body.period_month or (matched_invoice or {}).get("period_month"),
        "period_year": body.period_year or (matched_invoice or {}).get("period_year"),
        "invoice_id": matched_invoice["id"] if matched_invoice else None,
        "invoice_number": matched_invoice.get("invoice_number") if matched_invoice else None,
        "receipt_number": receipt_no,
        "paid_at": paid_at,
        "note": body.note or "",
        "received_by": (body.received_by or "").strip() or (kiosk_employee_name or ""),
        "approved_by": approved_by or company_name,
        "status": status,
        "kiosk_employee_id": kiosk_employee_id,
        "kiosk_employee_name": kiosk_employee_name,
        "approved_at": approved_at,
        "approved_by_user_id": approved_by_user_id,
    }
    # Vooruitbetaling: bewaar het bedrag als beschikbaar krediet zodat de
    # volgende factuur-generatie het automatisch kan verrekenen (FIFO oudst
    # eerst). Wordt alleen bij approved status meegerekend.
    if body.category == "vooruitbetaling" and status == "approved":
        doc["credit_remaining"] = float(body.amount or 0)
        doc["credit_applied_at"] = None
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    # Factuur sluiten — alleen voor approved payments. Pending betalingen krijgen
    # bij goedkeuring alsnog de invoice-koppeling via /payments/{id}/approve.
    if matched_invoice and status == "approved":
        try:
            # Bereken hoeveel deze specifieke factuur nog open heeft. Als de
            # betaling MEER is dan het openstaande bedrag van deze factuur,
            # past de "overflow" automatisch toe op andere openstaande
            # facturen van dezelfde huurder (oudst eerst, FIFO). Voorheen
            # ging de overflow verloren: 15.000 op een 10.000 factuur
            # sloot factuur 1 maar liet factuur 2 (april) ongewijzigd op
            # 10.000 staan. Nu: 10.000 → factuur 1 (paid), 5.000 → factuur 2.
            inv_amt = float(matched_invoice.get("amount") or 0)
            already_paid = matched_invoice.get("paid_amount")
            if already_paid is None:
                already_paid = await _invoice_currently_paid(matched_invoice["id"])
            open_on_matched = max(0.0, round(inv_amt - float(already_paid or 0), 2))
            pay_amt = float(body.amount or 0)
            primary_chunk = min(pay_amt, open_on_matched) if open_on_matched > 0 else pay_amt
            overflow = round(pay_amt - primary_chunk, 2)
            # Pas primary chunk toe op de gematchte factuur
            if primary_chunk > 0:
                await _apply_payment_to_invoice(
                    matched_invoice["id"], primary_chunk,
                    payment_id=doc["id"], paid_at=paid_at,
                    method=body.method, receipt_number=receipt_no,
                )
            # Overflow FIFO-alloceren over andere openstaande facturen
            # (zelfde tenant + currency, niet de matched factuur)
            if overflow > 0:
                other_inv_ids = []
                async for inv in db.invoices.find(
                    {"tenant_id": body.tenant_id,
                     "currency": body.currency,
                     "status": {"$nin": ["paid", "cancelled"]},
                     "id": {"$ne": matched_invoice["id"]},
                     **({"company_id": company_id} if company_id else {})},
                    {"_id": 0, "id": 1},
                ).sort([("period_year", 1), ("period_month", 1)]):
                    other_inv_ids.append(inv["id"])
                if other_inv_ids:
                    applied_overflow = await _allocate_payment_to_invoices(
                        other_inv_ids, overflow,
                        payment_id=doc["id"], paid_at=paid_at,
                        method=body.method, receipt_number=receipt_no,
                    )
                    leftover = round(overflow - applied_overflow, 2)
                else:
                    leftover = overflow
                # Als er nog steeds overflow over is na alle openstaande
                # facturen → bewaar als krediet op de huurder voor de
                # volgende auto-generatie.
                if leftover and leftover > 0:
                    await db.payments.update_one(
                        {"id": doc["id"]},
                        {"$set": {"credit_remaining": float(leftover),
                                  "credit_origin": "overflow"}},
                    )
        except Exception as e:
            print(f"[payments] invoice apply failed: {e}")
    return doc


@api.get("/payments", response_model=List[PaymentOut])
async def list_payments(
    user=Depends(get_current_user),
    tenant_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="approved | pending_approval | all"),
    limit: int = Query(200),
):
    q = dict(scope(user))
    if tenant_id:
        q["tenant_id"] = tenant_id
    # Standaard: alleen approved zien op de hoofdpagina. Pending heeft eigen sectie.
    if status == "pending_approval":
        q["status"] = "pending_approval"
    elif status == "all":
        pass  # geen filter
    else:
        # Default sluit pending uit zodat totalen kloppen.
        q["status"] = {"$ne": "pending_approval"}
    docs = await db.payments.find(q, {"_id": 0}).sort("paid_at", -1).to_list(limit)
    return await _enrich_payments_bulk(docs)


@api.get("/payments/pending-count")
async def payments_pending_count(user=Depends(get_current_user)):
    """Lichte endpoint voor de bell-badge: telling + meta van de meest
    recente pending betaling. Frontend gebruikt het laatste id om te
    detecteren wanneer er een NIEUWE pending bijgekomen is — daarmee
    kunnen we ook op iOS Guided Access (waar push-notificaties OS-niveau
    geblokkeerd zijn) een in-app banner + ding-ding tonen via polling."""
    q = {**scope(user), "status": "pending_approval"}
    n = await db.payments.count_documents(q)
    latest = None
    if n > 0:
        # Payment docs hebben `paid_at` als timestamp (geen created_at — zie
        # _create_payment_doc). Sorteren op paid_at desc geeft betrouwbaar
        # de meest recent ingediende pending.
        doc = await db.payments.find_one(
            q,
            {"_id": 0, "id": 1, "amount": 1, "currency": 1, "tenant_id": 1, "tenant_name": 1,
             "apartment_id": 1, "apartment_number": 1, "received_by": 1, "paid_at": 1, "category": 1},
            sort=[("paid_at", -1)],
        )
        if doc:
            # tenant_name + apartment_number worden niet op de payment doc
            # opgeslagen — pas bij read-time door _enrich_payment. Doen we
            # hier handmatig zodat de banner een echte naam toont (anders
            # blijft het "Onbekende huurder").
            tenant_name = doc.get("tenant_name") or ""
            apartment_number = doc.get("apartment_number") or ""
            if not tenant_name and doc.get("tenant_id"):
                t = await db.tenants.find_one({"id": doc["tenant_id"]}, {"_id": 0, "name": 1})
                if t:
                    tenant_name = t.get("name") or ""
            if not apartment_number and doc.get("apartment_id"):
                a = await db.apartments.find_one({"id": doc["apartment_id"]}, {"_id": 0, "number": 1})
                if a:
                    apartment_number = a.get("number") or ""
            latest = {
                "id": doc.get("id"),
                "amount": doc.get("amount"),
                "currency": doc.get("currency"),
                "tenant_name": tenant_name,
                "apartment_number": apartment_number,
                "received_by": doc.get("received_by") or "",
                "category": doc.get("category") or "",
                "created_at": doc.get("paid_at"),
            }
    return {"count": n, "latest": latest}


@api.post("/payments/{pid}/approve", response_model=PaymentOut)
async def approve_payment(pid: str, body: PaymentApproveIn, user=Depends(require_role("admin"))):
    """Beheerder keurt een pending kiosk-betaling goed. Slaat handtekening op
    en koppelt eventueel een openstaande factuur (zelfde logic als nieuwe
    approved betaling), zodat het bedrag NU pas meetelt in de totalen."""
    q = {"id": pid, **scope(user)}
    p = await db.payments.find_one(q, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Betaling niet gevonden")
    if p.get("status") != "pending_approval":
        raise HTTPException(status_code=400, detail="Deze betaling is geen pending betaling")
    if not (body.signature_data_url or "").startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Handtekening ontbreekt")
    approved_at = iso(now_utc())
    # Probeer alsnog een openstaande factuur te matchen bij approval.
    matched_invoice = None
    if p.get("category") == "huur":
        inv_q = {"tenant_id": p["tenant_id"], "status": {"$ne": "paid"}}
        cid = p.get("company_id")
        if cid:
            inv_q["company_id"] = cid
        if p.get("period_month") and p.get("period_year"):
            scoped_q = {**inv_q, "period_month": p["period_month"], "period_year": p["period_year"]}
            matched_invoice = await db.invoices.find_one(scoped_q, {"_id": 0})
        if not matched_invoice:
            matched_invoice = await db.invoices.find_one(
                inv_q, {"_id": 0}, sort=[("period_year", 1), ("period_month", 1)]
            )
    update = {
        "status": "approved",
        "signature_data_url": body.signature_data_url,
        "approved_at": approved_at,
        "approved_by_user_id": user.get("id") or user.get("sub"),
        "approved_by": user.get("name") or user.get("email") or "Beheerder",
    }
    if matched_invoice:
        update["invoice_id"] = matched_invoice["id"]
        update["invoice_number"] = matched_invoice.get("invoice_number")
        try:
            # Zelfde overflow-allocatie logica als bij _create_payment_doc:
            # als de betaling > openstaand op deze factuur, schuif het
            # overschot door naar oudere openstaande facturen FIFO.
            inv_amt_a = float(matched_invoice.get("amount") or 0)
            already_paid_a = matched_invoice.get("paid_amount")
            if already_paid_a is None:
                already_paid_a = await _invoice_currently_paid(matched_invoice["id"])
            open_on_matched_a = max(0.0, round(inv_amt_a - float(already_paid_a or 0), 2))
            pay_amt_a = float(p.get("amount") or 0)
            primary_chunk_a = min(pay_amt_a, open_on_matched_a) if open_on_matched_a > 0 else pay_amt_a
            overflow_a = round(pay_amt_a - primary_chunk_a, 2)
            if primary_chunk_a > 0:
                await _apply_payment_to_invoice(
                    matched_invoice["id"], primary_chunk_a,
                    payment_id=p["id"], paid_at=approved_at,
                    method=p.get("method"), receipt_number=p.get("receipt_number"),
                )
            if overflow_a > 0:
                other_inv_ids_a = []
                async for inv in db.invoices.find(
                    {"tenant_id": p["tenant_id"],
                     "currency": p.get("currency") or "SRD",
                     "status": {"$nin": ["paid", "cancelled"]},
                     "id": {"$ne": matched_invoice["id"]},
                     **({"company_id": p.get("company_id")} if p.get("company_id") else {})},
                    {"_id": 0, "id": 1},
                ).sort([("period_year", 1), ("period_month", 1)]):
                    other_inv_ids_a.append(inv["id"])
                if other_inv_ids_a:
                    await _allocate_payment_to_invoices(
                        other_inv_ids_a, overflow_a,
                        payment_id=p["id"], paid_at=approved_at,
                        method=p.get("method"), receipt_number=p.get("receipt_number"),
                    )
        except Exception as e:
            print(f"[payments.approve] invoice apply failed: {e}")
    # Goedkeuring van een betalingsregeling-termijn (kiosk-flow met
    # pending_approval): alloceer alsnog op de gelinkte facturen + mark de
    # bijbehorende installment als 'paid'.
    plan_id = (p.get("metadata") or {}).get("plan_id") if isinstance(p.get("metadata"), dict) else None
    inst_seq = (p.get("metadata") or {}).get("installment_seq") if isinstance(p.get("metadata"), dict) else None
    if plan_id and p.get("category") == "betalingsregeling":
        try:
            plan = await db.payment_plans.find_one({"id": plan_id}, {"_id": 0})
            if plan and (plan.get("invoice_ids") or []):
                await _allocate_payment_to_invoices(
                    plan["invoice_ids"], float(p.get("amount") or 0),
                    payment_id=p["id"], paid_at=approved_at,
                    method=p.get("method"), receipt_number=p.get("receipt_number"),
                )
            # Markeer installment als paid (was 'pending_payment')
            if inst_seq is not None:
                await db.payment_plan_installments.update_one(
                    {"plan_id": plan_id, "sequence": inst_seq},
                    {"$set": {"status": "paid"}},
                )
            # Plan-completion check
            if plan:
                remaining_pending = await db.payment_plan_installments.count_documents(
                    {"plan_id": plan_id, "status": {"$in": ["pending", "pending_payment"]}}
                )
                if remaining_pending == 0:
                    await db.payment_plans.update_one(
                        {"id": plan_id},
                        {"$set": {"status": "completed", "completed_at": approved_at}},
                    )
            # WhatsApp/SMS bevestiging — ook bij admin-approval van kiosk-pending.
            # FIRE-AND-FORGET: Twilio + SMTP + PDF render kunnen 5-10s duren;
            # de admin UI moet NIET wachten daarop. Background task stuurt
            # de notificatie nadat de response al uit is.
            if inst_seq is not None:
                asyncio.create_task(_notify_tenant_installment_paid(plan_id, inst_seq))
        except Exception as e:  # noqa: BLE001
            print(f"[payments.approve] plan allocation failed: {e}")
    await db.payments.update_one({"id": pid}, {"$set": update})
    p.update(update)
    return await _enrich_payment(p)


@api.post("/payments/{pid}/reject", response_model=PaymentOut)
async def reject_payment(pid: str, body: PaymentRejectIn, user=Depends(require_role("admin"))):
    """Beheerder wijst een pending betaling af (bv. verkeerd bedrag, geen geld
    ontvangen). Bedrag wordt nooit meegerekend in totalen."""
    q = {"id": pid, **scope(user)}
    p = await db.payments.find_one(q, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Betaling niet gevonden")
    if p.get("status") != "pending_approval":
        raise HTTPException(status_code=400, detail="Deze betaling is geen pending betaling")
    update = {"status": "rejected", "rejected_reason": (body.reason or "").strip(),
              "approved_at": iso(now_utc()),
              "approved_by_user_id": user.get("id") or user.get("sub")}
    # Revert pending plan-installment to 'pending' zodat huurder/kiosk
    # 'm opnieuw kan betalen.
    plan_id = (p.get("metadata") or {}).get("plan_id") if isinstance(p.get("metadata"), dict) else None
    inst_seq = (p.get("metadata") or {}).get("installment_seq") if isinstance(p.get("metadata"), dict) else None
    if plan_id and inst_seq is not None and p.get("category") == "betalingsregeling":
        try:
            await db.payment_plan_installments.update_one(
                {"plan_id": plan_id, "sequence": inst_seq, "status": "pending_payment"},
                {"$set": {"status": "pending", "paid_at": None, "payment_id": None}},
            )
        except Exception as e:  # noqa: BLE001
            print(f"[payments.reject] plan revert failed: {e}")
    await db.payments.update_one({"id": pid}, {"$set": update})
    p.update(update)
    return await _enrich_payment(p)


@api.post("/payments", response_model=PaymentOut)
async def create_payment(body: PaymentIn, user=Depends(get_current_user)):
    cid = company_id_of(user)
    doc = await _create_payment_doc(body, cid, approved_by=user.get("name") or user.get("email"))
    enriched = await _enrich_payment(doc)
    # Push notificatie naar andere admins van dezelfde company
    try:
        cur = enriched.get('currency', '')
        amt = float(enriched.get('amount', 0))
        await _notify_company_admins(
            cid, f"Betaling {cur} {amt:,.2f}",
            f"{enriched.get('tenant_name', 'Onbekend')} via {enriched.get('method', '')}",
            {"kind": "payment", "url": "/admin/payments", "payment_id": enriched.get("id"), "badge_inc": 1},
        )
    except Exception as e:
        print(f"[push] admin payment notify failed: {e}")
    return enriched


@api.get("/tenants/{tenant_id}/balance")
async def tenant_balance(tenant_id: str, user=Depends(get_current_user)):
    t = await db.tenants.find_one({"id": tenant_id, **scope(user)}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    return await _calc_balance(t)


# =====================================================================
# Balance helper
# =====================================================================
async def _calc_balance(tenant: dict) -> dict:
    """Compute simple monthly rent balance.
    - If tenant has apartment, monthly rent applies from move-in (or first day of created_at month).
    - Total paid for category 'huur' deducted.
    """
    apt_id = tenant.get("apartment_id")
    if not apt_id:
        return {
            "rent_amount": 0,
            "currency": "SRD",
            "months_due": 0,
            "total_due": 0,
            "total_paid": 0,
            "balance": 0,
            "next_period": None,
        }
    apt = await db.apartments.find_one({"id": apt_id}, {"_id": 0})
    if not apt:
        return {
            "rent_amount": 0, "currency": "SRD", "months_due": 0,
            "total_due": 0, "total_paid": 0, "balance": 0, "next_period": None,
        }
    rent = apt.get("rent_amount", 0)
    currency = apt.get("currency", "SRD")
    created = tenant.get("created_at") or iso(now_utc())
    try:
        start = datetime.fromisoformat(created.replace("Z", "+00:00"))
    except Exception:
        start = now_utc()
    today = now_utc()
    months = (today.year - start.year) * 12 + (today.month - start.month) + 1
    months = max(months, 1)
    total_due = rent * months
    # Sum huur payments
    cursor = db.payments.find(
        {"tenant_id": tenant["id"], "category": "huur", "currency": currency},
        {"_id": 0, "amount": 1},
    )
    total_paid = 0.0
    async for p in cursor:
        total_paid += float(p.get("amount", 0))
    balance = total_due - total_paid
    # Next due period - last paid period or first unpaid
    paid_periods = set()
    async for p in db.payments.find(
        {"tenant_id": tenant["id"], "category": "huur"},
        {"_id": 0, "period_month": 1, "period_year": 1},
    ):
        if p.get("period_month") and p.get("period_year"):
            paid_periods.add((int(p["period_year"]), int(p["period_month"])))
    # Find earliest unpaid month from start month onwards
    next_period = None
    y, m = start.year, start.month
    for _ in range(months + 12):
        if (y, m) not in paid_periods:
            next_period = {"year": y, "month": m}
            break
        m += 1
        if m > 12:
            m = 1
            y += 1
    return {
        "rent_amount": rent,
        "currency": currency,
        "months_due": months,
        "total_due": total_due,
        "total_paid": total_paid,
        "balance": balance,
        "next_period": next_period,
    }


# =====================================================================
# Locations (admin only) — appartementen worden gegroepeerd per locatie
# =====================================================================
async def _enrich_location(loc: dict) -> dict:
    total = await db.apartments.count_documents({"location_id": loc["id"], "company_id": loc["company_id"]})
    occupied = await db.apartments.count_documents({"location_id": loc["id"], "company_id": loc["company_id"], "status": "occupied"})
    return {**loc, "apartments_total": total, "apartments_occupied": occupied}


@api.get("/locations", response_model=List[LocationOut])
async def list_locations(user=Depends(get_current_user)):
    docs = await db.locations.find(scope(user), {"_id": 0}).sort("name", 1).to_list(1000)
    return [await _enrich_location(d) for d in docs]


@api.post("/locations", response_model=LocationOut)
async def create_location(body: LocationIn, user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    doc = {
        "id": new_id(),
        "company_id": cid,
        "name": body.name,
        "address": body.address or "",
        "photo_url": body.photo_url or "",
        "created_at": iso(now_utc()),
    }
    await db.locations.insert_one(doc)
    doc.pop("_id", None)
    return await _enrich_location(doc)


@api.put("/locations/{loc_id}", response_model=LocationOut)
async def update_location(loc_id: str, body: LocationIn, user=Depends(get_current_user)):
    from pymongo import ReturnDocument
    res = await db.locations.find_one_and_update(
        {"id": loc_id, **scope(user)}, {"$set": body.model_dump()},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Locatie niet gevonden")
    return await _enrich_location(res)


@api.delete("/locations/{loc_id}")
async def delete_location(loc_id: str, user=Depends(get_current_user)):
    loc = await db.locations.find_one({"id": loc_id, **scope(user)}, {"_id": 0})
    if not loc:
        raise HTTPException(status_code=404, detail="Locatie niet gevonden")
    # Detach apartments instead of refusing — keeps admin flow simple.
    await db.apartments.update_many({"location_id": loc_id, **scope(user)}, {"$unset": {"location_id": ""}})
    await db.locations.delete_one({"id": loc_id})
    return {"ok": True}


# =====================================================================
# Kiosk public endpoints (no auth, but expects kiosk session for payments)
# =====================================================================
@api.get("/kiosk/locations")
async def kiosk_list_locations(_session=Depends(get_kiosk_session)):
    """List locations for the kiosk's company, with apartment counts."""
    sc = kiosk_scope(_session)
    docs = await db.locations.find(sc, {"_id": 0}).sort("name", 1).to_list(500)
    out = []
    for loc in docs:
        total = await db.apartments.count_documents({**sc, "location_id": loc["id"]})
        occupied = await db.apartments.count_documents({**sc, "location_id": loc["id"], "status": "occupied"})
        out.append({**loc, "apartments_total": total, "apartments_occupied": occupied})
    # Also surface "no location" group when there are unassigned apartments.
    unassigned = await db.apartments.count_documents({
        **sc, "$or": [{"location_id": None}, {"location_id": {"$exists": False}}, {"location_id": ""}]
    })
    if unassigned > 0:
        out.append({
            "id": "_none", "name": "Overige appartementen",
            "address": "", "photo_url": "",
            "apartments_total": unassigned, "apartments_occupied": 0,
            "created_at": "",
        })
    return out


@api.get("/kiosk/apartments")
async def kiosk_list_apartments(location_id: Optional[str] = None, _session=Depends(get_kiosk_session)):
    """List apartments for the kiosk's company, optionally filtered by location."""
    sc = kiosk_scope(_session)
    q = {**sc}
    if location_id is not None:
        if location_id in ("_none", ""):
            q["$or"] = [{"location_id": None}, {"location_id": {"$exists": False}}, {"location_id": ""}]
        else:
            q["location_id"] = location_id
    docs = await db.apartments.find(q, {"_id": 0}).sort("number", 1).to_list(1000)
    out = []
    for a in docs:
        tenant_name = None
        if a.get("tenant_id"):
            t = await db.tenants.find_one({"id": a["tenant_id"]}, {"_id": 0, "name": 1})
            tenant_name = t["name"] if t else None
        out.append({
            "id": a["id"],
            "number": a["number"],
            "address": a.get("address", ""),
            "rent_amount": a["rent_amount"],
            "currency": a["currency"],
            "status": a["status"],
            "tenant_id": a.get("tenant_id"),
            "tenant_name": tenant_name,
            "location_id": a.get("location_id"),
        })
    return out


@api.get("/kiosk/tenants/{tenant_id}/overview")
async def kiosk_tenant_overview(tenant_id: str, _session=Depends(get_kiosk_session)):
    t = await db.tenants.find_one({"id": tenant_id, **kiosk_scope(_session)}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    apt = None
    if t.get("apartment_id"):
        apt = await db.apartments.find_one({"id": t["apartment_id"]}, {"_id": 0})
    balance = await _calc_balance(t)
    # Bereken huidig positief saldo (vooruitbetaald krediet, nog niet
    # verrekend met een factuur). Wordt zichtbaar gemaakt in de Kiosk
    # Financieel Overzicht zodat huurder/medewerker zien dat ze
    # vooruit hebben betaald.
    credit = 0.0
    async for p in db.payments.find(
        {"tenant_id": tenant_id, "credit_remaining": {"$gt": 0},
         "status": "approved"},
        {"_id": 0, "credit_remaining": 1, "currency": 1},
    ):
        # Aanname: huurder werkt in 1 valuta (SRD) — anders zou je per
        # valuta moeten optellen. Voor nu enkel SRD/lokaal.
        credit += float(p.get("credit_remaining") or 0)
    return {
        "tenant": {
            "id": t["id"],
            "name": t["name"],
            "phone": t.get("phone", ""),
            "email": t.get("email", ""),
            "internet_amount": float(t.get("internet_amount") or 0),
        },
        "apartment": apt and {
            "id": apt["id"],
            "number": apt["number"],
            "address": apt.get("address", ""),
            "rent_amount": apt["rent_amount"],
            "currency": apt["currency"],
        },
        "balance": balance,
        "credit_balance": round(credit, 2),
    }


# =====================================================================
# Customer Display (klantenscherm)
# =====================================================================
class CustomerDisplayIn(BaseModel):
    step: str  # 'idle'|'select'|'overview'|'pay'|'method'|'confirm'|'receipt'
    apartment: Optional[dict] = None
    tenant: Optional[dict] = None
    overview: Optional[dict] = None
    payload: Optional[dict] = None  # selected categories + total
    payment: Optional[dict] = None  # final receipt
    note: Optional[str] = ""


@api.put("/kiosk/customer-display")
async def update_customer_display(body: CustomerDisplayIn, request: Request):
    """Admin Kiosk pusht hier de huidige stap-state naar. Accepteert zowel
    kiosk-token (PIN sessie) als admin/staff token zodat de push werkt
    onafhankelijk van welk token de browser meestuurt."""
    cid = None
    # Probeer kiosk-token eerst.
    try:
        ks = await get_kiosk_session(request)
        cid = ks.get("company_id")
    except HTTPException:
        pass
    if not cid:
        # Val terug op admin/staff sessie.
        try:
            user = await get_current_user(request)
            cid = company_id_of(user)
        except HTTPException:
            cid = None
    if not cid:
        raise HTTPException(status_code=401, detail="Niet ingelogd op kiosk")
    new_state = body.model_dump()
    # Smart merge: bewaar de keuze van de klant over heartbeats heen.
    # Wanneer de klant zelf een methode heeft getikt (method_chosen_at), of de
    # klant zelf een betaling heeft gestart (customer_initiated), mag de
    # heartbeat van de admin die niet overschrijven.
    existing_doc = await db.customer_display.find_one({"company_id": cid}, {"_id": 0})
    existing_state = (existing_doc or {}).get("state") or {}
    existing_payload = existing_state.get("payload") or {}
    new_payload = new_state.get("payload") or {}

    customer_locked = bool(existing_payload.get("method_chosen_at") or existing_payload.get("customer_initiated"))
    # 1) Step-bescherming: terwijl klant betaalt mag admin niet "terug" springen.
    if customer_locked and existing_state.get("step") in ("method", "confirm", "receipt") \
            and new_state.get("step") in ("idle", "check", "select", "overview", "pay"):
        new_state["step"] = existing_state.get("step")
    # 2) Payload-bescherming: bewaar method + method_chosen_at + customer_initiated.
    if existing_payload.get("method_chosen_at") and not new_payload.get("method_chosen_at"):
        new_payload["method"] = existing_payload.get("method")
        new_payload["method_chosen_at"] = existing_payload.get("method_chosen_at")
    if existing_payload.get("customer_initiated") and not new_payload.get("customer_initiated"):
        new_payload["customer_initiated"] = True
        new_payload["customer_initiated_at"] = existing_payload.get("customer_initiated_at")
        # Behoud ook bedrag + categorieën die door start-payment zijn gezet.
        if not new_payload.get("amount") and existing_payload.get("amount"):
            new_payload["amount"] = existing_payload["amount"]
            new_payload["currency"] = existing_payload.get("currency") or new_payload.get("currency")
            new_payload["categories"] = existing_payload.get("categories") or new_payload.get("categories") or []
    # Behoud Mope QR/ref/mode/paid_at over admin heartbeats heen.
    for k in ("mope_qr", "mope_ref", "mope_mode", "mope_amount", "mope_currency", "mope_created_at", "mope_paid_at"):
        if existing_payload.get(k) and not new_payload.get(k):
            new_payload[k] = existing_payload[k]
    if new_payload:
        new_state["payload"] = new_payload

    new_state["updated_at"] = iso(now_utc())
    await db.customer_display.update_one(
        {"company_id": cid},
        {"$set": {"company_id": cid, "state": new_state, "updated_at": new_state["updated_at"]}},
        upsert=True,
    )
    return {"ok": True, "updated_at": new_state["updated_at"]}


@api.get("/kiosk/customer-display")
async def kiosk_get_customer_display(request: Request):
    """Authenticated readback voor admin Kiosk — geen slug nodig, gebruikt
    de company van de huidige sessie. Zo werkt de polling ook wanneer de
    pwa_company_slug niet in localStorage staat."""
    cid = None
    try:
        ks = await get_kiosk_session(request)
        cid = ks.get("company_id")
    except HTTPException:
        pass
    if not cid:
        try:
            user = await get_current_user(request)
            cid = company_id_of(user)
        except HTTPException:
            cid = None
    if not cid:
        raise HTTPException(status_code=401, detail="Niet ingelogd op kiosk")
    doc = await db.customer_display.find_one({"company_id": cid}, {"_id": 0})
    state = (doc or {}).get("state") or {"step": "idle"}
    # Auto-refresh Mope status wanneer er een actief request_id is en geen paid_at.
    payload = state.get("payload") or {}
    req_id = payload.get("mope_request_id")
    if req_id and not payload.get("mope_paid_at") and payload.get("mope_mode") in ("test", "live"):
        company = await db.companies.find_one({"id": cid}, {"_id": 0, "id": 1, "integrations": 1})
        api_key = await _mope_api_key_for_company(company)
        if api_key:
            try:
                status_data = await _mope_get_payment_status(api_key, req_id)
                new_status = status_data.get("status")
                if new_status and new_status != payload.get("mope_status"):
                    payload["mope_status"] = new_status
                    if new_status == "paid":
                        payload["mope_paid_at"] = iso(now_utc())
                    state["payload"] = payload
                    state["updated_at"] = iso(now_utc())
                    await db.customer_display.update_one(
                        {"company_id": cid},
                        {"$set": {"state": state, "updated_at": state["updated_at"]}},
                    )
            except Exception as e:
                print(f"[mope] poll status failed: {e}")
    return {"state": state}



@api.delete("/kiosk/customer-display")
async def clear_customer_display(request: Request):
    cid = None
    try:
        ks = await get_kiosk_session(request)
        cid = ks.get("company_id")
    except HTTPException:
        pass
    if not cid:
        try:
            user = await get_current_user(request)
            cid = company_id_of(user)
        except HTTPException:
            cid = None
    if cid:
        await db.customer_display.update_one(
            {"company_id": cid},
            {"$set": {"state": {"step": "idle", "updated_at": iso(now_utc())},
                      "updated_at": iso(now_utc())}},
            upsert=True,
        )
    return {"ok": True}


class CustomerMethodIn(BaseModel):
    method: Literal["contant", "bank", "mope", "sumup", "uni5pay"]


def _generate_qr_data_url(payload: str, size_px: int = 480) -> str:
    """Returns a data:image/png;base64,... URL for the given QR payload."""
    from pdf_gen import _make_qr_png
    png = _make_qr_png(payload, size_px=size_px)
    return "data:image/png;base64," + base64.b64encode(png).decode("ascii")


MOPE_API_BASE = "https://api.mope.sr/api"


async def _mope_create_payment_request(api_key: str, amount: float, currency: str,
                                       description: str, order_id: str, redirect_url: str):
    """Create a payment request via Mope API. Returns (request_id, payment_url)."""
    import httpx as _httpx
    amount_cents = int(round(amount * 100))
    async with _httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{MOPE_API_BASE}/shop/payment_request",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "description": description[:120],
                "amount": amount_cents,
                "order_id": order_id[:120],
                "currency": currency,
                "redirect_url": redirect_url[:255],
            },
        )
        r.raise_for_status()
        data = r.json()
        return data["id"], data["url"]


async def _mope_get_payment_status(api_key: str, request_id: str) -> dict:
    import httpx as _httpx
    async with _httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{MOPE_API_BASE}/shop/payment_request/{request_id}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        r.raise_for_status()
        return r.json()


async def _mope_api_key_for_company(company: dict) -> str:
    """Resolve Mope API key. Priority:
    1. company_settings.mope.api_key (gezet via Instellingen UI)
    2. company.integrations.mope.api_key (legacy)
    3. env MOPE_API_KEY (globale fallback voor test)"""
    cid = (company or {}).get("id")
    if cid:
        settings = await db.company_settings.find_one(
            {"company_id": cid}, {"_id": 0, "mope": 1}
        )
        key = ((settings or {}).get("mope") or {}).get("api_key") or ""
        if key:
            return key
    integrations = (company or {}).get("integrations") or {}
    cfg = integrations.get("mope") or {}
    return cfg.get("api_key") or os.environ.get("MOPE_API_KEY") or ""


@api.post("/kiosk/mope/create-qr")
async def kiosk_mope_create_qr(request: Request):
    """Maakt een Mope payment_request via de echte Mope-API wanneer een
    API-key beschikbaar is (env MOPE_API_KEY of company.integrations.mope.api_key).
    De QR bevat `https://mope.sr/p/<id>` zodat de Mope-app hem herkent en
    direct de betaal-flow opent. Zonder API-key: lokale mock-QR."""
    cid = None
    try:
        ks = await get_kiosk_session(request)
        cid = ks.get("company_id")
    except HTTPException:
        pass
    if not cid:
        try:
            user = await get_current_user(request)
            cid = company_id_of(user)
        except HTTPException:
            cid = None
    if not cid:
        raise HTTPException(status_code=401, detail="Niet ingelogd op kiosk")

    doc = await db.customer_display.find_one({"company_id": cid}, {"_id": 0})
    state = (doc or {}).get("state") or {}
    payload = state.get("payload") or {}
    if (payload.get("method") or "").lower() != "mope":
        raise HTTPException(status_code=400, detail="Klant heeft Mope niet gekozen")
    amount = float(payload.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Geen bedrag")
    currency = payload.get("currency") or "SRD"

    company = await db.companies.find_one({"id": cid}, {"_id": 0, "id": 1, "integrations": 1, "name": 1, "slug": 1})
    api_key = await _mope_api_key_for_company(company)
    order_id = f"KIOSK-{secrets.token_hex(4).upper()}"
    redirect_url = _public_url(f"/kiosk/klant?c={(company or {}).get('slug', '')}")

    mode = "mock"
    request_id = None
    qr_text = None
    api_error = None
    if api_key:
        try:
            request_id, qr_text = await _mope_create_payment_request(
                api_key=api_key,
                amount=amount,
                currency=currency,
                description=f"{(company or {}).get('name', 'Vastgoed')} kiosk",
                order_id=order_id,
                redirect_url=redirect_url,
            )
            mode = "test" if api_key.startswith("test_") else "live"
        except Exception as e:
            api_error = str(e)
            print(f"[mope] create-qr API call failed, falling back to mock: {e}")

    if not qr_text:
        # Mock fallback — QR die de echte app NIET kan scannen, maar onze
        # test-knop wel kan bevestigen.
        request_id = f"MOCK-{secrets.token_hex(8)}"
        qr_text = f"mope://pay?merchant={cid[:8]}&amount={amount:.2f}&currency={currency}&ref={request_id}"

    qr_data_url = _generate_qr_data_url(qr_text, size_px=480)

    payload["mope_qr"] = qr_data_url
    payload["mope_qr_url"] = qr_text  # de URL zelf, zodat we 'em ook plain kunnen tonen
    payload["mope_ref"] = order_id
    payload["mope_request_id"] = request_id
    payload["mope_mode"] = mode
    payload["mope_amount"] = amount
    payload["mope_currency"] = currency
    payload["mope_created_at"] = iso(now_utc())
    if api_error:
        payload["mope_api_error"] = api_error[:200]
    payload.pop("mope_paid_at", None)
    state["payload"] = payload
    state["updated_at"] = iso(now_utc())
    await db.customer_display.update_one(
        {"company_id": cid},
        {"$set": {"state": state, "updated_at": state["updated_at"]}},
        upsert=True,
    )
    return {
        "ok": True, "mode": mode, "ref": order_id, "request_id": request_id,
        "qr": qr_data_url, "qr_url": qr_text,
        "amount": amount, "currency": currency,
        **({"api_error": api_error} if api_error else {}),
    }


@api.post("/integrations/mope/webhook")
async def mope_webhook(request: Request):
    """Mope's webhook stuurt enkel het payment_request_id. Wij zoeken
    in alle bedrijven naar een actieve customer_display met dit id en
    refreshen de status via de Mope GET endpoint."""
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    req_id = (body or {}).get("id")
    if not req_id:
        raise HTTPException(status_code=400, detail="Missing id")
    docs = await db.customer_display.find(
        {"state.payload.mope_request_id": req_id}, {"_id": 0}
    ).to_list(10)
    for doc in docs:
        cid = doc.get("company_id")
        company = await db.companies.find_one({"id": cid}, {"_id": 0, "id": 1, "integrations": 1})
        api_key = await _mope_api_key_for_company(company)
        if not api_key:
            continue
        try:
            status_data = await _mope_get_payment_status(api_key, req_id)
        except Exception:
            continue
        state = doc.get("state") or {}
        payload = state.get("payload") or {}
        payload["mope_status"] = status_data.get("status")
        if status_data.get("status") == "paid" and not payload.get("mope_paid_at"):
            payload["mope_paid_at"] = iso(now_utc())
        state["payload"] = payload
        state["updated_at"] = iso(now_utc())
        await db.customer_display.update_one(
            {"company_id": cid},
            {"$set": {"state": state, "updated_at": state["updated_at"]}},
        )
    return Response(status_code=204)


@api.post("/admin/integrations/mope")
async def admin_set_mope_integration(request: Request, user=Depends(get_current_user)):
    """Beheerder slaat Mope API-key op voor zijn bedrijf. Body:
    `{api_key: str, merchant_id?: str}`. Token kan `test_` of `live_` prefix
    hebben — wij detecteren het type automatisch."""
    body = await request.json()
    api_key = (body or {}).get("api_key", "").strip()
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen bedrijfscontext")
    company = await db.companies.find_one({"id": cid}, {"_id": 0})
    integrations = company.get("integrations") or {}
    integrations["mope"] = {
        "api_key": api_key,
        "merchant_id": (body or {}).get("merchant_id", ""),
        "live": bool(api_key and not api_key.startswith("test_")),
        "updated_at": iso(now_utc()),
    }
    await db.companies.update_one({"id": cid}, {"$set": {"integrations": integrations}})
    return {"ok": True, "mode": "live" if integrations["mope"]["live"] else ("test" if api_key.startswith("test_") else "mock")}


@api.get("/admin/integrations/mope")
async def admin_get_mope_integration(user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen bedrijfscontext")
    company = await db.companies.find_one({"id": cid}, {"_id": 0})
    cfg = ((company or {}).get("integrations") or {}).get("mope") or {}
    key = cfg.get("api_key") or ""
    return {
        "configured": bool(key),
        "mode": "live" if cfg.get("live") else ("test" if key.startswith("test_") else ("mock" if not key else "unknown")),
        # Mask key — show only last 4 chars
        "api_key_preview": ("•" * max(0, len(key) - 4) + key[-4:]) if key else "",
        "merchant_id": cfg.get("merchant_id", ""),
        "updated_at": cfg.get("updated_at"),
    }


@api.post("/public/customer-display/{slug}/mope-confirm")
async def public_mope_confirm(slug: str):
    """Publiek — mock 'webhook' die de klant zelf triggert door op
    'Ik heb betaald' te tikken op het klantenscherm. In LIVE-modus is dit
    de echte Mope-webhook handler. Markeert de betaling als bevestigd zodat
    de admin Kiosk er op verder kan."""
    c = await db.companies.find_one({"slug": slug.lower()}, {"_id": 0, "id": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    doc = await db.customer_display.find_one({"company_id": c["id"]}, {"_id": 0})
    state = (doc or {}).get("state") or {}
    payload = state.get("payload") or {}
    if not payload.get("mope_ref"):
        raise HTTPException(status_code=409, detail="Geen actieve Mope-betaling")
    if payload.get("mope_paid_at"):
        return {"ok": True, "already": True}
    payload["mope_paid_at"] = iso(now_utc())
    state["payload"] = payload
    state["updated_at"] = iso(now_utc())
    await db.customer_display.update_one(
        {"company_id": c["id"]},
        {"$set": {"state": state, "updated_at": state["updated_at"]}},
    )
    return {"ok": True, "ref": payload.get("mope_ref")}


@api.post("/public/customer-display/{slug}/select-method")
async def customer_pick_method(slug: str, body: CustomerMethodIn):
    """Publiek — wordt aangeroepen door het klantenscherm zelf wanneer de
    klant op een betaalmethode-tegel tapt. De admin Kiosk poll't dit veld
    en gaat dan automatisch door naar het bevestig-scherm."""
    c = await db.companies.find_one({"slug": slug.lower()}, {"_id": 0, "id": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    doc = await db.customer_display.find_one({"company_id": c["id"]}, {"_id": 0})
    state = (doc or {}).get("state") or {}
    if state.get("step") not in ("method", "confirm", "pay"):
        raise HTTPException(status_code=409, detail="Niet in betaalfase")
    payload = state.get("payload") or {}
    payload["method"] = body.method
    payload["method_chosen_at"] = iso(now_utc())
    state["payload"] = payload
    state["updated_at"] = iso(now_utc())
    await db.customer_display.update_one(
        {"company_id": c["id"]},
        {"$set": {"state": state, "updated_at": state["updated_at"]}},
    )
    return {"ok": True, "method": body.method}



class CustomerStartPayIn(BaseModel):
    pass


@api.post("/public/customer-display/{slug}/start-payment")
async def customer_start_payment(slug: str):
    """Publiek — de klant tikt zelf op 'Betaal nu' op het klantenscherm
    tijdens de overview-stap. We zetten de stap meteen naar 'method' en
    kopiëren het totale openstaande bedrag in het payload. De admin Kiosk
    poll't dit en gaat automatisch mee."""
    c = await db.companies.find_one({"slug": slug.lower()}, {"_id": 0, "id": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    doc = await db.customer_display.find_one({"company_id": c["id"]}, {"_id": 0})
    state = (doc or {}).get("state") or {}
    if state.get("step") not in ("overview", "pay"):
        raise HTTPException(status_code=409, detail="Niet in overzichtsfase")
    overview = state.get("overview") or {}
    bal = overview.get("balance") or {}
    apt = overview.get("apartment") or state.get("apartment") or {}
    tenant = state.get("tenant") or {}
    open_rent = max(0.0, float(bal.get("balance") or 0))
    internet = float(tenant.get("internet_amount") or overview.get("internet") or 0)
    total_due = float(overview.get("total_due") or (open_rent + internet))
    if total_due <= 0:
        raise HTTPException(status_code=400, detail="Geen openstaand bedrag")
    currency = bal.get("currency") or apt.get("currency") or "SRD"
    categories = []
    if open_rent > 0:
        categories.append({"key": "huur", "value": open_rent})
    if internet > 0:
        categories.append({"key": "internet", "value": internet})
    state["step"] = "method"
    state["payload"] = {
        "amount": total_due,
        "currency": currency,
        "categories": categories,
        "method": None,
        "customer_initiated": True,
        "customer_initiated_at": iso(now_utc()),
    }
    state["updated_at"] = iso(now_utc())
    await db.customer_display.update_one(
        {"company_id": c["id"]},
        {"$set": {"state": state, "updated_at": state["updated_at"]}},
    )
    return {"ok": True, "step": "method", "amount": total_due}


@api.get("/public/customer-display/{slug}")
async def get_customer_display(slug: str, response: Response):
    """Publiek — het klantenscherm poll't dit endpoint elke ~500ms."""
    # Strikte no-cache headers — voorkomt dat iPhone Safari / PWA proxy
    # een gecachte respons teruggeeft tijdens polling.
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    if not slug or len(slug) > 80:
        raise HTTPException(status_code=400, detail="Ongeldige slug")
    c = await db.companies.find_one(
        {"slug": slug.lower()},
        {"_id": 0, "id": 1, "name": 1, "slug": 1, "branding": 1},
    )
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    doc = await db.customer_display.find_one({"company_id": c["id"]}, {"_id": 0})
    branding = _company_branding_response(c)
    state = (doc or {}).get("state") or {"step": "idle"}
    # Auto-idle wanneer er meer dan 5 minuten geen update is geweest.
    updated_at = state.get("updated_at")
    try:
        if updated_at:
            t = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
            if (now_utc() - t).total_seconds() > 300:
                state = {"step": "idle"}
    except Exception:
        pass
    return {"branding": branding, "state": state}




@api.post("/kiosk/payments", response_model=PaymentOut)
async def kiosk_create_payment(
    body: PaymentIn,
    _session=Depends(get_kiosk_session),
    employee_id: Optional[str] = Query(None, description="Kiosk-medewerker ID voor pending workflow"),
    employee_pin: Optional[str] = Query(None, description="PIN ter dubbele bevestiging"),
):
    cid = _session.get("company_id")
    # Als een kiosk-medewerker is opgegeven → betaling gaat in pending_approval.
    # Beheerder ziet het en moet handtekening zetten om te bevestigen.
    # Zonder employee_id → klassieke directe boeking (legacy gedrag).
    kiosk_emp_id, kiosk_emp_name, status = None, None, "approved"
    if employee_id:
        emp = await db.employees.find_one(
            {"id": employee_id, "company_id": cid, "active": True, "app_role": "kiosk"},
            {"_id": 0},
        )
        if not emp:
            raise HTTPException(status_code=404, detail="Kiosk-medewerker niet gevonden")
        if not emp.get("kiosk_pin_hash") or not verify_password((employee_pin or "").strip(), emp["kiosk_pin_hash"]):
            raise HTTPException(status_code=401, detail="Ongeldige PIN")
        kiosk_emp_id, kiosk_emp_name, status = emp["id"], emp.get("name", ""), "pending_approval"

    doc = await _create_payment_doc(
        body, cid,
        status=status,
        kiosk_employee_id=kiosk_emp_id,
        kiosk_employee_name=kiosk_emp_name,
    )
    enriched = await _enrich_payment(doc)

    # Push notify alle admins van deze company (fire-and-forget — niet
    # blocking voor de kiosk UX als pywebpush traag is, maar de kiosk wacht
    # toch al op de receipt response).
    try:
        currency = enriched.get("currency", "")
        amount = float(enriched.get("amount", 0))
        tenant = enriched.get("tenant_name", "Onbekend")
        apt = enriched.get("apartment_number")
        method = enriched.get("method", "")
        apt_str = f" · Appt. {apt}" if apt else ""
        if status == "pending_approval":
            emp_name = kiosk_emp_name or "Medewerker"
            title = f"Goedkeuring nodig · {currency} {amount:,.2f}"
            body_msg = f"Door {emp_name} · {tenant}{apt_str}"
            push_kind = "payment_pending_approval"
            push_url = "/admin/payments?filter=pending"
        else:
            title = f"Betaling {currency} {amount:,.2f}"
            body_msg = f"{tenant}{apt_str} via {method}"
            push_kind = "payment"
            push_url = "/admin/payments"
        await _notify_company_admins(
            cid,
            title,
            body_msg,
            {
                "kind": push_kind,
                "url": push_url,
                "payment_id": enriched.get("id"),
                "amount": amount,
                "tenant": tenant,
                "status": status,
                "received_by": kiosk_emp_name or "",
                "badge_inc": 1,
                "require_approval": status == "pending_approval",
            },
        )
    except Exception as e:
        print(f"[push] kiosk payment notify failed: {e}")
    return enriched


@api.get("/kiosk/tenants/{tenant_id}/payments")
async def kiosk_tenant_payments(tenant_id: str, _session=Depends(get_kiosk_session)):
    """List recent payments for a tenant (used in kiosk 'Betalingsgeschiedenis' modal)."""
    t = await db.tenants.find_one({"id": tenant_id, **kiosk_scope(_session)}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    docs = await db.payments.find(
        {"tenant_id": tenant_id, **kiosk_scope(_session)}, {"_id": 0}
    ).sort("paid_at", -1).to_list(50)
    return await _enrich_payments_bulk(docs)


@api.get("/kiosk/receipts/{payment_id}")
async def kiosk_receipt(payment_id: str):
    p = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Kwitantie niet gevonden")
    return await _enrich_payment(p)


@api.post("/kiosk/payments/{payment_id}/email")
async def kiosk_email_receipt(payment_id: str, _session=Depends(get_kiosk_session)):
    """Stuur PDF-kwitantie naar het huurder-e-mailadres (best-effort vanuit Kiosk).
    Bedoeld als "fire-and-forget" call vanuit de KioskLayout direct na de
    tear-animatie. Faalt nooit met 5xx — als SMTP niet ingericht is of de
    huurder geen e-mailadres heeft, retourneren we {sent: false} zodat de
    UX onverstoord blijft. Echte fouten worden in de logs gerapporteerd.
    """
    from email_service import send_email, wrap_template, EmailError
    sc = kiosk_scope(_session)
    p = await db.payments.find_one({"id": payment_id, **sc}, {"_id": 0})
    if not p:
        # Niet bestaan = bewust 200/no-op om client side niet te blokkeren.
        return {"sent": False, "reason": "not_found"}
    cid = _session.get("company_id")
    if not cid:
        return {"sent": False, "reason": "no_company"}
    cfg = await get_company_section(cid, "smtp")
    if not cfg.get("enabled"):
        return {"sent": False, "reason": "smtp_disabled"}

    p_enriched = await _enrich_payment(p)
    tenant = await db.tenants.find_one({"id": p_enriched.get("tenant_id"), **sc}, {"_id": 0}) or {}
    to = (tenant.get("email") or "").strip()
    if not to:
        return {"sent": False, "reason": "no_tenant_email"}

    try:
        pdf_bytes = receipt_pdf(p_enriched)
        content = f"""
            <h1>Kwitantie {p_enriched['receipt_number']}</h1>
            <p>Beste {tenant.get('name', 'huurder')},<br />
            Hierbij ontvangt u een digitale kopie van uw kwitantie zoals
            zojuist afgegeven via de Kiosk.</p>
            <table class="kv">
              <tr><td>Datum</td><td>{p_enriched.get('paid_at', '')[:10]}</td></tr>
              <tr><td>Bedrag</td><td>{p_enriched['currency']} {p_enriched['amount']:.2f}</td></tr>
              <tr><td>Betaalmethode</td><td>{p_enriched.get('method', '')}</td></tr>
              <tr><td>Appartement</td><td>{p_enriched.get('apartment_number', '-')}</td></tr>
              <tr><td>Categorie</td><td>{p_enriched.get('category', '-')}</td></tr>
            </table>
            <p style="margin-top:20px;color:#64748b;font-size:13px">
              Bewaar deze e-mail als bewijs van betaling.
            </p>
        """
        await send_email(
            cfg, to,
            f"Kwitantie {p_enriched['receipt_number']}",
            wrap_template(content),
            attachments=[(f"kwitantie-{p_enriched['receipt_number']}.pdf", pdf_bytes, "application/pdf")],
        )
        return {"sent": True, "to": to}
    except EmailError as e:
        print(f"[kiosk-email] send_failed payment={payment_id} err={e}")
        return {"sent": False, "reason": "send_failed"}
    except Exception as e:  # pragma: no cover - defensive
        print(f"[kiosk-email] unexpected payment={payment_id} err={e}")
        return {"sent": False, "reason": "unexpected"}


@api.post("/kiosk/payments/{payment_id}/whatsapp")
async def kiosk_whatsapp_receipt(payment_id: str, _session=Depends(get_kiosk_session)):
    """Stuur WhatsApp/SMS-melding met PDF-link naar huurder (best-effort).

    Vergelijkbaar met /kiosk/payments/{id}/email maar via Twilio. Probeert
    eerst WhatsApp, valt terug op SMS als WhatsApp niet werkt / niet
    geconfigureerd. Faalt nooit hard — UX-vriendelijk vanuit de Kiosk.
    """
    from twilio_service import send_whatsapp, send_sms, TwilioError
    sc = kiosk_scope(_session)
    p = await db.payments.find_one({"id": payment_id, **sc}, {"_id": 0})
    if not p:
        return {"sent": False, "reason": "not_found"}
    cid = _session.get("company_id")
    if not cid:
        return {"sent": False, "reason": "no_company"}
    cfg = await get_company_section(cid, "twilio")
    if not cfg.get("enabled"):
        return {"sent": False, "reason": "twilio_disabled"}

    p_enriched = await _enrich_payment(p)
    tenant = await db.tenants.find_one({"id": p_enriched.get("tenant_id"), **sc}, {"_id": 0}) or {}
    to = (tenant.get("phone") or "").strip()
    if not to:
        return {"sent": False, "reason": "no_tenant_phone"}

    pdf_link = _public_url(f"/api/payments/{payment_id}/pdf")
    image_link = _public_url(f"/api/payments/{payment_id}/image")
    msg = (
        f"Hallo {tenant.get('name', 'huurder')},\n\n"
        f"Uw betaling is succesvol verwerkt.\n"
        f"Kwitantie: {p_enriched['receipt_number']}\n"
        f"Bedrag: {p_enriched['currency']} {p_enriched['amount']:.2f}\n"
        f"Methode: {p_enriched.get('method', '')}\n\n"
        f"📄 Kwitantie PDF: {pdf_link}"
    )

    # Probeer WhatsApp eerst (als geconfigureerd), val terug op SMS.
    has_wa = bool((cfg.get("whatsapp_from") or "").strip())
    has_sms = bool((cfg.get("sms_from") or "").strip())

    if has_wa:
        try:
            # JPG kwitantie als inline media-bijlage — toont preview in chat.
            await send_whatsapp(cfg, to, msg, media_url=image_link)
            return {"sent": True, "channel": "whatsapp", "to": to}
        except TwilioError as e:
            print(f"[kiosk-twilio] whatsapp failed payment={payment_id} err={e}")
            # blijf hieronder doorgaan met SMS fallback

    if has_sms:
        try:
            await send_sms(cfg, to, msg)
            return {"sent": True, "channel": "sms", "to": to}
        except TwilioError as e:
            print(f"[kiosk-twilio] sms failed payment={payment_id} err={e}")
            return {"sent": False, "reason": "send_failed"}

    return {"sent": False, "reason": "no_channel_configured"}


# =====================================================================
# Dashboard stats
# =====================================================================
@api.get("/admin/stats")
async def admin_stats(user=Depends(get_current_user)):
    sc = scope(user)
    total_apts = await db.apartments.count_documents({**sc})
    occupied = await db.apartments.count_documents({**sc, "status": "occupied"})
    total_tenants = await db.tenants.count_documents({**sc})
    # Sum payments this month (per currency)
    today = now_utc()
    start = datetime(today.year, today.month, 1, tzinfo=timezone.utc).isoformat()
    pipeline = [
        {"$match": {**sc, "paid_at": {"$gte": start}}},
        {"$group": {"_id": "$currency", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    by_currency = {}
    async for r in db.payments.aggregate(pipeline):
        by_currency[r["_id"]] = {"total": r["total"], "count": r["count"]}

    # Invoice status distribution (all open + overdue + paid totals for the dashboard).
    inv_paid = await db.invoices.count_documents({**sc, "status": "paid"})
    inv_open = await db.invoices.count_documents({**sc, "status": {"$in": ["open", "sent", "pending"]}})
    inv_overdue = await db.invoices.count_documents({**sc, "status": "overdue"})

    # Outstanding balance — sum of unpaid invoices per currency.
    outstanding_pipeline = [
        {"$match": {**sc, "status": {"$nin": ["paid", "cancelled"]}}},
        {"$group": {"_id": "$currency", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    outstanding = {}
    async for r in db.invoices.aggregate(outstanding_pipeline):
        outstanding[r["_id"]] = {"total": r["total"], "count": r["count"]}

    # Recent activity feed — last 8 events (payments received + invoices opened/overdue)
    recent: list = []
    async for p in db.payments.find({**sc}, {"_id": 0}).sort("paid_at", -1).limit(5):
        tenant = await db.tenants.find_one({"id": p.get("tenant_id"), **sc}, {"_id": 0, "name": 1})
        apt = await db.apartments.find_one({"id": p.get("apartment_id"), **sc}, {"_id": 0, "number": 1})
        recent.append({
            "type": "payment_received",
            "title": "Betaling ontvangen",
            "subtitle": f"{tenant.get('name') if tenant else '—'} · Appt. {apt.get('number') if apt else '—'}",
            "amount": p.get("amount"),
            "currency": p.get("currency", "SRD"),
            "at": p.get("paid_at"),
        })
    async for inv in db.invoices.find({**sc, "status": {"$nin": ["paid", "cancelled"]}}, {"_id": 0}).sort("created_at", -1).limit(5):
        tenant = await db.tenants.find_one({"id": inv.get("tenant_id"), **sc}, {"_id": 0, "name": 1})
        apt = await db.apartments.find_one({"id": inv.get("apartment_id"), **sc}, {"_id": 0, "number": 1})
        recent.append({
            "type": "invoice_open",
            "title": "Betaling openstaand",
            "subtitle": f"{tenant.get('name') if tenant else '—'} · Appt. {apt.get('number') if apt else '—'}",
            "amount": inv.get("amount"),
            "currency": inv.get("currency", "SRD"),
            "at": inv.get("created_at"),
            "period_month": inv.get("period_month"),
            "period_year": inv.get("period_year"),
        })
    recent.sort(key=lambda x: x.get("at") or "", reverse=True)
    recent = recent[:8]

    return {
        "apartments_total": total_apts,
        "apartments_occupied": occupied,
        "apartments_vacant": total_apts - occupied,
        "tenants_total": total_tenants,
        "month_payments_by_currency": by_currency,
        "outstanding_by_currency": outstanding,
        "invoice_status": {"paid": inv_paid, "open": inv_open, "overdue": inv_overdue},
        "recent_activity": recent,
    }


# =====================================================================
# Health
# =====================================================================
@api.get("/health")
async def health():
    return {"ok": True, "service": "vastgoed-kiosk-api"}


# =====================================================================
# Receipt PDF
# =====================================================================
def _pdf_response(pdf_bytes: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@api.get("/payments/{payment_id}/pdf")
async def payment_pdf(payment_id: str):
    """Public: download PDF receipt by payment id. No auth so we can email/share link."""
    p = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Kwitantie niet gevonden")
    p = await _enrich_payment(p)
    pdf = receipt_pdf(p)
    return _pdf_response(pdf, f"kwitantie-{p['receipt_number']}.pdf")


@api.get("/payments/{payment_id}/image")
async def payment_image(payment_id: str):
    """Render kwitantie als JPG foto — bedoeld om eenvoudig via WhatsApp
    als foto te delen (in plaats van als PDF-bijlage). Geen auth zodat de
    huurder de afbeelding ook direct kan ontvangen via een gedeelde link.
    """
    p = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Kwitantie niet gevonden")
    p = await _enrich_payment(p)
    pdf_bytes = receipt_pdf(p)
    # PDF eerste pagina → JPG via pymupdf (zoom 2.5× voor scherpe weergave
    # op iPhone retina-schermen)
    try:
        import pymupdf
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        page = doc[0]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(2.5, 2.5))
        jpg = pix.tobytes("jpeg", jpg_quality=85)
        doc.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image render fout: {e}")
    from fastapi.responses import Response as _Resp
    return _Resp(
        content=jpg,
        media_type="image/jpeg",
        headers={"Content-Disposition": f'inline; filename="kwitantie-{p["receipt_number"]}.jpg"'},
    )


# =====================================================================
# Contracts
# =====================================================================
class ContractIn(BaseModel):
    tenant_id: str
    apartment_id: str
    start_date: str
    end_date: Optional[str] = ""
    payment_day: int = 1
    deposit_amount: float = 0
    landlord: Optional[str] = "SuriRent N.V."
    terms: Optional[str] = ""


class ContractOut(BaseModel):
    id: str
    contract_number: str
    tenant_id: str
    tenant_name: Optional[str] = None
    apartment_id: str
    apartment_number: Optional[str] = None
    start_date: str
    end_date: Optional[str] = ""
    payment_day: int
    deposit_amount: float
    landlord: str
    terms: str
    status: str
    sign_token: Optional[str] = None
    signed_at: Optional[str] = None
    signed_by: Optional[str] = None
    signed_ip: Optional[str] = None
    created_at: str


async def _next_seq(key: str) -> int:
    from pymongo import ReturnDocument
    c = await db.counters.find_one_and_update(
        {"_id": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    return c.get("seq", 1)


async def _enrich_contract(c: dict) -> dict:
    tn = await db.tenants.find_one({"id": c["tenant_id"]}, {"_id": 0, "name": 1})
    apt = await db.apartments.find_one({"id": c["apartment_id"]}, {"_id": 0, "number": 1})
    return {
        **c,
        "tenant_name": tn["name"] if tn else None,
        "apartment_number": apt["number"] if apt else None,
    }


@api.get("/contracts", response_model=List[ContractOut])
async def list_contracts(user=Depends(get_current_user), tenant_id: Optional[str] = None):
    q = dict(scope(user))
    if tenant_id:
        q["tenant_id"] = tenant_id
    docs = await db.contracts.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _enrich_contract(d) for d in docs]


@api.post("/contracts", response_model=ContractOut)
async def create_contract(body: ContractIn, user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    tenant = await db.tenants.find_one({"id": body.tenant_id, **scope(user)}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    apt = await db.apartments.find_one({"id": body.apartment_id, **scope(user)}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    year = now_utc().year
    seq = await _next_seq(f"contract_{year}")
    doc = {
        "id": new_id(),
        "company_id": cid,
        "contract_number": f"HC{year}-{seq:04d}",
        "tenant_id": body.tenant_id,
        "apartment_id": body.apartment_id,
        "start_date": body.start_date,
        "end_date": body.end_date or "",
        "payment_day": body.payment_day,
        "deposit_amount": body.deposit_amount,
        "landlord": body.landlord or "SuriRent N.V.",
        "terms": body.terms or "",
        "status": "draft",
        "sign_token": secrets.token_urlsafe(24),
        "signed_at": None,
        "signed_by": None,
        "signed_ip": None,
        "created_at": iso(now_utc()),
    }
    await db.contracts.insert_one(doc)
    doc.pop("_id", None)
    return await _enrich_contract(doc)


@api.delete("/contracts/{contract_id}")
async def delete_contract(contract_id: str, user=Depends(get_current_user)):
    res = await db.contracts.delete_one({"id": contract_id, **scope(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contract niet gevonden")
    return {"ok": True}


@api.get("/contracts/{contract_id}/pdf")
async def contract_pdf_admin(contract_id: str):
    """Public via id (kept simple for share link)."""
    c = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contract niet gevonden")
    t = await db.tenants.find_one({"id": c["tenant_id"]}, {"_id": 0}) or {}
    a = await db.apartments.find_one({"id": c["apartment_id"]}, {"_id": 0}) or {}
    c = {**c, **(await _company_brand_info(c.get("company_id")))}
    pdf = contract_pdf(c, t, a)
    return _pdf_response(pdf, f"contract-{c['contract_number']}.pdf")


# Public signing flow
@api.get("/contracts/sign/{token}")
async def contract_sign_info(token: str):
    c = await db.contracts.find_one({"sign_token": token}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Ondertekenlink ongeldig")
    t = await db.tenants.find_one({"id": c["tenant_id"]}, {"_id": 0}) or {}
    a = await db.apartments.find_one({"id": c["apartment_id"]}, {"_id": 0}) or {}
    return {
        "contract": c,
        "tenant": {"name": t.get("name"), "phone": t.get("phone")},
        "apartment": {"number": a.get("number"), "address": a.get("address"),
                      "rent_amount": a.get("rent_amount"), "currency": a.get("currency")},
        "already_signed": bool(c.get("signed_at")),
    }


class SignIn(BaseModel):
    signed_by: str = Field(min_length=2)
    accept: bool = True


@api.post("/contracts/sign/{token}")
async def contract_do_sign(token: str, body: SignIn, request: Request):
    if not body.accept:
        raise HTTPException(status_code=400, detail="U moet akkoord gaan met de voorwaarden")
    c = await db.contracts.find_one({"sign_token": token}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Link ongeldig")
    if c.get("signed_at"):
        raise HTTPException(status_code=400, detail="Contract is al ondertekend")
    ip = request.client.host if request.client else "—"
    from pymongo import ReturnDocument
    updated = await db.contracts.find_one_and_update(
        {"sign_token": token},
        {"$set": {
            "signed_at": iso(now_utc()),
            "signed_by": body.signed_by,
            "signed_ip": ip,
            "status": "active",
        }},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    return await _enrich_contract(updated)


# =====================================================================
# Invoices
# =====================================================================
class InvoiceCreate(BaseModel):
    tenant_id: str
    period_month: int = Field(ge=1, le=12)
    period_year: int


class InvoicePlanRef(BaseModel):
    id: str
    status: str
    total_installments: int
    paid_installments: int


class InvoiceOut(BaseModel):
    id: str
    invoice_number: str
    tenant_id: str
    tenant_name: Optional[str] = None
    apartment_id: Optional[str] = None
    apartment_number: Optional[str] = None
    location_name: Optional[str] = None
    amount: float
    paid_amount: float = 0
    remaining_amount: float = 0
    currency: str
    period_month: int
    period_year: int
    status: str
    created_at: str
    paid_at: Optional[str] = None
    payment_id: Optional[str] = None
    receipt_number: Optional[str] = None
    paid_method: Optional[str] = None
    plans: List[InvoicePlanRef] = []


async def _enrich_invoice(i: dict) -> dict:
    t = await db.tenants.find_one({"id": i["tenant_id"]}, {"_id": 0, "name": 1})
    a = None
    location_name = None
    if i.get("apartment_id"):
        a = await db.apartments.find_one(
            {"id": i["apartment_id"]}, {"_id": 0, "number": 1, "location_id": 1}
        )
        if a and a.get("location_id"):
            loc = await db.locations.find_one(
                {"id": a["location_id"]}, {"_id": 0, "name": 1}
            )
            if loc:
                location_name = loc.get("name")
    # paid_amount / remaining_amount — fallback uit payments wanneer veld ontbreekt.
    paid_amount = i.get("paid_amount")
    if paid_amount is None:
        try:
            paid_amount = await _invoice_currently_paid(i["id"])
        except Exception:
            paid_amount = 0.0
    paid_amount = round(float(paid_amount or 0), 2)
    inv_amt = round(float(i.get("amount") or 0), 2)
    remaining = round(max(0.0, inv_amt - paid_amount), 2)
    # Gelinkte betalingsregelingen — toon active + voltooide plannen.
    plans = []
    async for plan in db.payment_plans.find(
        {"invoice_ids": i["id"], "status": {"$in": ["active", "completed"]}}, {"_id": 0}
    ):
        total_inst = await db.payment_plan_installments.count_documents(
            {"plan_id": plan["id"]}
        )
        paid_inst = await db.payment_plan_installments.count_documents(
            {"plan_id": plan["id"], "status": "paid"}
        )
        plans.append({
            "id": plan["id"],
            "status": plan.get("status", "active"),
            "total_installments": int(total_inst),
            "paid_installments": int(paid_inst),
        })
    return {**i, "tenant_name": t["name"] if t else None,
            "apartment_number": a["number"] if a else None,
            "location_name": location_name,
            "paid_amount": paid_amount,
            "remaining_amount": remaining,
            "plans": plans}


@api.get("/invoices", response_model=List[InvoiceOut])
async def list_invoices(user=Depends(get_current_user)):
    docs = await db.invoices.find(scope(user), {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _enrich_invoice(d) for d in docs]


@api.post("/invoices", response_model=InvoiceOut)
async def create_invoice(body: InvoiceCreate, user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    t = await db.tenants.find_one({"id": body.tenant_id, **scope(user)}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    apt_id = t.get("apartment_id")
    apt = await db.apartments.find_one({"id": apt_id, **scope(user)}, {"_id": 0}) if apt_id else None
    if not apt:
        raise HTTPException(status_code=400, detail="Huurder heeft geen appartement")
    # Prevent duplicate invoice for same tenant + period
    dup = await db.invoices.find_one({
        **scope(user),
        "tenant_id": body.tenant_id, "period_month": body.period_month,
        "period_year": body.period_year,
    })
    if dup:
        raise HTTPException(status_code=400, detail="Factuur voor deze periode bestaat al")
    year = body.period_year
    seq = await _next_seq(f"invoice_{year}")
    doc = {
        "id": new_id(),
        "company_id": cid,
        "invoice_number": f"F{year}-{seq:05d}",
        "tenant_id": body.tenant_id,
        "apartment_id": apt_id,
        "amount": apt["rent_amount"],
        "currency": apt.get("currency", "SRD"),
        "period_month": body.period_month,
        "period_year": body.period_year,
        "status": "open",
        "created_at": iso(now_utc()),
    }
    await db.invoices.insert_one(doc)
    doc.pop("_id", None)
    return await _enrich_invoice(doc)


class GenerateMonthIn(BaseModel):
    period_month: int = Field(ge=1, le=12)
    period_year: int


@api.post("/invoices/repair-overpaid")
async def repair_overpaid_invoices(
    apply: bool = Query(False, description="false=dry-run, true=apply fixes"),
    user=Depends(get_current_user),
):
    """Migratie-endpoint: vindt facturen waar paid_amount > amount (door de
    oude overflow-bug) en herverdeelt het overschot FIFO naar volgende
    openstaande facturen van dezelfde huurder. Default = dry-run.

    Veiligheidsregels:
      • Alleen admin/owner van de eigen company.
      • Dry-run is default — geen wijziging in DB tenzij apply=true.
      • Returns een lijst met alle correcties die uitgevoerd zijn/zouden worden.
    """
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    if user.get("role") not in ("admin", "owner", "superadmin"):
        raise HTTPException(status_code=403, detail="Alleen admin of owner mag repareren")

    repairs = []
    total_overflow = 0.0
    # Zoek facturen waar paid_amount > amount (overshoot)
    overpaid: list = []
    async for inv in db.invoices.find(
        {"company_id": cid, "$expr": {"$gt": ["$paid_amount", "$amount"]}},
        {"_id": 0},
    ):
        overpaid.append(inv)

    for inv in overpaid:
        amt = float(inv.get("amount") or 0)
        paid = float(inv.get("paid_amount") or 0)
        overflow = round(paid - amt, 2)
        if overflow <= 0:
            continue
        total_overflow += overflow
        tenant_id = inv["tenant_id"]
        cur = inv.get("currency") or "SRD"
        # Andere openstaande facturen van dezelfde huurder/currency, oudst eerst
        other_invs: list = []
        async for o in db.invoices.find(
            {"company_id": cid, "tenant_id": tenant_id, "currency": cur,
             "id": {"$ne": inv["id"]},
             "status": {"$nin": ["paid", "cancelled"]}},
            {"_id": 0, "id": 1, "amount": 1, "paid_amount": 1,
             "period_month": 1, "period_year": 1, "invoice_number": 1},
        ).sort([("period_year", 1), ("period_month", 1)]):
            other_invs.append(o)

        allocations = []
        remaining = overflow
        for o in other_invs:
            if remaining <= 0:
                break
            o_amt = float(o.get("amount") or 0)
            o_paid = float(o.get("paid_amount") or 0)
            o_open = max(0.0, round(o_amt - o_paid, 2))
            if o_open <= 0:
                continue
            chunk = round(min(remaining, o_open), 2)
            allocations.append({
                "invoice_id": o["id"],
                "invoice_number": o.get("invoice_number"),
                "period": f"{o.get('period_month')}/{o.get('period_year')}",
                "applied": chunk,
            })
            remaining = round(remaining - chunk, 2)
        leftover_credit = round(remaining, 2)

        repairs.append({
            "invoice_id": inv["id"],
            "invoice_number": inv.get("invoice_number"),
            "period": f"{inv.get('period_month')}/{inv.get('period_year')}",
            "tenant_id": tenant_id,
            "amount": amt,
            "was_paid_amount": paid,
            "overflow": overflow,
            "redistributed_to": allocations,
            "leftover_credit": leftover_credit,
        })

        if apply:
            # 1) Corrigeer de overshoot-factuur: paid_amount = amount
            await db.invoices.update_one(
                {"id": inv["id"]},
                {"$set": {"paid_amount": amt, "status": "paid"}},
            )
            # 2) Pas allocations toe op andere facturen
            for a in allocations:
                target_inv = await db.invoices.find_one({"id": a["invoice_id"]}, {"_id": 0})
                new_paid = round(float(target_inv.get("paid_amount") or 0) + a["applied"], 2)
                new_status = "paid" if new_paid >= float(target_inv.get("amount") or 0) else "open"
                await db.invoices.update_one(
                    {"id": a["invoice_id"]},
                    {"$set": {"paid_amount": new_paid, "status": new_status}},
                )
            # 3) Resterend overschot → bewaar als krediet op de origineel-betaling
            #    (zoek de meest recente approved payment van deze huurder op deze factuur)
            if leftover_credit > 0:
                pay = await db.payments.find_one(
                    {"tenant_id": tenant_id, "invoice_id": inv["id"], "status": "approved"},
                    {"_id": 0, "id": 1},
                    sort=[("paid_at", -1)],
                )
                if pay:
                    await db.payments.update_one(
                        {"id": pay["id"]},
                        {"$set": {"credit_remaining": leftover_credit,
                                  "credit_origin": "migration_repair"}},
                    )

    return {
        "dry_run": not apply,
        "invoices_inspected": len(overpaid),
        "invoices_repaired": len(repairs),
        "total_overflow_redistributed": round(total_overflow, 2),
        "repairs": repairs,
    }



async def generate_month_invoices(body: GenerateMonthIn, user=Depends(get_current_user)):
    """Generate invoice for every occupied apartment for the period."""
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    return await _generate_month_invoices_for_company(
        cid, body.period_month, body.period_year, scope_user=user,
    )


# =====================================================================
# Automatische factuur-generatie + krediet-verrekening
# =====================================================================

def _add_workdays(start_date, n_workdays: int):
    """Tel `n_workdays` werkdagen (ma-vr) op bij `start_date`. Houdt geen
    rekening met lokale feestdagen — voldoende precies voor huur-deadlines."""
    from datetime import timedelta
    d = start_date
    added = 0
    while added < n_workdays:
        d = d + timedelta(days=1)
        if d.weekday() < 5:  # ma=0 ... vr=4
            added += 1
    return d


def _last_day_of_month(year: int, month: int):
    """Laatste dag van de gegeven (jaar, maand) als date object."""
    from datetime import date
    import calendar
    return date(year, month, calendar.monthrange(year, month)[1])


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


async def _apply_tenant_credit_to_invoice(
    tenant_id: str, invoice_id: str, company_id: str
) -> float:
    """Verrekent eventueel positief saldo van een huurder met de nieuw
    aangemaakte factuur (FIFO op datum). Returns het toegepaste bedrag.

    Krediet wordt gevormd door betalingen waar `category == "vooruitbetaling"`
    of door betalingen die meer waren dan het openstaande bedrag op het
    moment van registratie (overflow → krediet ipv naar volgende factuur
    wanneer geen volgende factuur bestond).
    """
    inv = await db.invoices.find_one(
        {"id": invoice_id}, {"_id": 0, "amount": 1, "paid_amount": 1, "currency": 1}
    )
    if not inv:
        return 0.0
    open_amt = float(inv.get("amount") or 0) - float(inv.get("paid_amount") or 0)
    if open_amt <= 0:
        return 0.0
    cur = inv.get("currency") or "SRD"

    total_applied = 0.0
    # FIFO: oudste vooruitbetalingen eerst
    async for credit in db.payments.find(
        {"tenant_id": tenant_id, "currency": cur,
         "category": "vooruitbetaling",
         "credit_remaining": {"$gt": 0},
         "status": "approved"},
        {"_id": 0, "id": 1, "credit_remaining": 1, "method": 1, "receipt_number": 1},
    ).sort("paid_at", 1):
        if open_amt <= 0:
            break
        avail = float(credit.get("credit_remaining") or 0)
        chunk = min(avail, open_amt)
        if chunk <= 0:
            continue
        await _apply_payment_to_invoice(
            invoice_id, chunk,
            payment_id=credit["id"], paid_at=iso(now_utc()),
            method=credit.get("method"), receipt_number=credit.get("receipt_number"),
        )
        new_remaining = round(avail - chunk, 2)
        await db.payments.update_one(
            {"id": credit["id"]},
            {"$set": {"credit_remaining": new_remaining,
                      "credit_applied_at": iso(now_utc()) if new_remaining == 0 else credit.get("credit_applied_at")}},
        )
        total_applied += chunk
        open_amt -= chunk
    return round(total_applied, 2)


async def _generate_month_invoices_for_company(
    company_id: str, period_month: int, period_year: int, *, scope_user=None
) -> dict:
    """Gedeelde factuur-generatie. Maakt facturen voor elk bewoond appartement,
    skipt duplicates, en verrekent automatisch eventueel krediet."""
    q = {"company_id": company_id, "status": "occupied"}
    apts = await db.apartments.find(q, {"_id": 0}).to_list(1000)
    created = 0
    skipped = 0
    credit_applied_total = 0.0
    for a in apts:
        if not a.get("tenant_id"):
            skipped += 1
            continue
        t = await db.tenants.find_one(
            {"id": a["tenant_id"], "company_id": company_id}, {"_id": 0}
        )
        if not t:
            skipped += 1
            continue
        dup = await db.invoices.find_one({
            "company_id": company_id, "tenant_id": t["id"],
            "period_month": period_month, "period_year": period_year,
        })
        if dup:
            skipped += 1
            continue
        seq = await _next_seq(f"invoice_{period_year}")
        inv_id = new_id()
        await db.invoices.insert_one({
            "id": inv_id,
            "company_id": company_id,
            "invoice_number": f"F{period_year}-{seq:05d}",
            "tenant_id": t["id"], "apartment_id": a["id"],
            "amount": a["rent_amount"], "currency": a.get("currency", "SRD"),
            "paid_amount": 0.0,
            "period_month": period_month, "period_year": period_year,
            "status": "open", "created_at": iso(now_utc()),
        })
        # Verreken positief saldo van deze huurder met de nieuwe factuur
        applied = await _apply_tenant_credit_to_invoice(t["id"], inv_id, company_id)
        credit_applied_total += applied
        created += 1
    return {
        "created": created,
        "skipped": skipped,
        "credit_applied": round(credit_applied_total, 2),
    }


async def _auto_invoice_tick():
    """Eén keer per dag uitgevoerde achtergrond-taak.
    Voor elk bedrijf met `invoicing.auto_generate=true`:
      - bepaalt deadline = laatste dag VORIGE maand + grace_workdays
      - als vandaag >= deadline en huidige maand-factuur nog niet bestaat,
        genereer hem nu + verreken krediet
      - markeer last_auto_run = vandaag zodat we niet 2× per dag draaien
    """
    from datetime import date
    today = date.today()
    today_iso = today.isoformat()
    async for cs in db.company_settings.find({"invoicing.auto_generate": True}, {"_id": 0}):
        cfg = cs.get("invoicing") or {}
        if not cfg.get("auto_generate"):
            continue
        if cfg.get("last_auto_run") == today_iso:
            continue
        try:
            grace = int(cfg.get("grace_workdays") or 10)
        except (TypeError, ValueError):
            grace = 10
        company_id = cs["company_id"]
        # Deadline van vorige maand verloopt: einde vorige maand + grace werkdagen
        prev_year = today.year if today.month > 1 else today.year - 1
        prev_month = today.month - 1 if today.month > 1 else 12
        prev_last = _last_day_of_month(prev_year, prev_month)
        deadline = _add_workdays(prev_last, grace)
        if today < deadline:
            continue
        # Genereer huidige maand
        try:
            res = await _generate_month_invoices_for_company(
                company_id, today.month, today.year
            )
            await db.company_settings.update_one(
                {"company_id": company_id},
                {"$set": {"invoicing.last_auto_run": today_iso,
                          "invoicing.last_auto_result": res}},
            )
            print(f"[auto-invoice] {company_id} {today.month}/{today.year}: {res}")
            # Notify admins
            try:
                await _notify_company_admins(
                    company_id,
                    "Maandelijkse facturen gegenereerd",
                    f"{res['created']} nieuwe facturen voor {today.month}/{today.year}"
                    + (f" — {res['credit_applied']:.2f} aan krediet verrekend." if res.get("credit_applied") else "."),
                    {"kind": "auto_invoice", "result": res},
                )
            except Exception:  # noqa: BLE001
                pass
        except Exception as e:  # noqa: BLE001
            print(f"[auto-invoice] error company {company_id}: {e}")


async def _auto_invoice_loop():
    """Achtergrond-loop: roept _auto_invoice_tick elke 6 uur aan zodat we
    altijd binnen 6h reageren op een deadline-overschrijding."""
    while True:
        try:
            await _auto_invoice_tick()
        except Exception as e:  # noqa: BLE001
            print(f"[auto-invoice] tick failed: {e}")
        await asyncio.sleep(6 * 3600)  # 6 uur


@api.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, user=Depends(get_current_user)):
    res = await db.invoices.delete_one({"id": invoice_id, **scope(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden")
    return {"ok": True}


@api.get("/invoices/{invoice_id}/pdf")
async def invoice_pdf_endpoint(invoice_id: str):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden")
    t = await db.tenants.find_one({"id": inv["tenant_id"]}, {"_id": 0}) or {}
    a = await db.apartments.find_one({"id": inv.get("apartment_id")}, {"_id": 0}) or {}
    # Find related huur payments
    payments = await db.payments.find({
        "tenant_id": inv["tenant_id"],
        "category": "huur",
        "period_month": inv["period_month"],
        "period_year": inv["period_year"],
    }, {"_id": 0}).to_list(50)
    inv = {**inv, **(await _company_brand_info(inv.get("company_id")))}
    pdf = invoice_pdf(inv, t, a, payments)
    return _pdf_response(pdf, f"factuur-{inv['invoice_number']}.pdf")


# =====================================================================
# Employees & Salaries
# =====================================================================
class EmployeeIn(BaseModel):
    name: str
    role: Optional[str] = ""  # legacy free-text role
    # Nieuwe gestructureerde rol bepaalt wat de medewerker mag in de app:
    #  - admin       : beheerder, kan goedkeuren en alles
    #  - boekhouder  : zelfde betalings-rechten als admin (geen approval nodig)
    #  - kiosk       : kiosk-medewerker — betalingen gaan in pending_approval
    app_role: Optional[Literal["admin", "boekhouder", "kiosk"]] = None
    phone: Optional[str] = ""
    email: Optional[str] = ""
    monthly_salary: float = 0
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    active: bool = True


class EmployeeOut(EmployeeIn):
    id: str
    created_at: str
    has_kiosk_pin: bool = False


class EmployeeKioskPinIn(BaseModel):
    pin: str  # 4-6 cijfers


@api.get("/employees", response_model=List[EmployeeOut])
async def list_employees(user=Depends(get_current_user)):
    docs = await db.employees.find(scope(user), {"_id": 0}).sort("name", 1).to_list(500)
    # Strip pin_hash uit response; voeg has_kiosk_pin boolean toe.
    for d in docs:
        d["has_kiosk_pin"] = bool(d.pop("kiosk_pin_hash", None))
    return docs


@api.post("/employees", response_model=EmployeeOut)
async def create_employee(body: EmployeeIn, user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    doc = {"id": new_id(), "company_id": cid, **body.model_dump(), "created_at": iso(now_utc())}
    await db.employees.insert_one(doc)
    doc.pop("_id", None)
    doc["has_kiosk_pin"] = False
    return doc


@api.put("/employees/{eid}", response_model=EmployeeOut)
async def update_employee(eid: str, body: EmployeeIn, user=Depends(get_current_user)):
    from pymongo import ReturnDocument
    res = await db.employees.find_one_and_update(
        {"id": eid, **scope(user)}, {"$set": body.model_dump()},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Werknemer niet gevonden")
    res["has_kiosk_pin"] = bool(res.pop("kiosk_pin_hash", None))
    return res


@api.post("/employees/{eid}/kiosk-pin")
async def set_employee_kiosk_pin(eid: str, body: EmployeeKioskPinIn, user=Depends(require_role("admin"))):
    """Beheerder zet/wijzigt een 4-6 cijferige PIN voor een kiosk-medewerker.
    Met deze PIN kan de medewerker zich op de Receptie Kiosk identificeren
    voordat hij een betaling registreert (die dan in pending_approval gaat).

    PIN-uniqueness is sinds 2026-02-26 alleen BINNEN het eigen bedrijf —
    PIN-login is company-scoped via `/<slug>/login`, dus twee bedrijven
    mogen dezelfde PINs gebruiken.
    """
    pin = (body.pin or "").strip()
    if not pin.isdigit() or not (4 <= len(pin) <= 6):
        raise HTTPException(status_code=400, detail="PIN moet 4-6 cijfers zijn")
    e = await db.employees.find_one({"id": eid, **scope(user)}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Werknemer niet gevonden")
    cid = e.get("company_id")
    # Uniqueness: company-shared PIN binnen ditzelfde bedrijf
    company_pin = await db.kiosk_pins.find_one({"company_id": cid}, {"_id": 0, "pin_hash": 1})
    if company_pin and verify_password(pin, company_pin.get("pin_hash", "")):
        raise HTTPException(status_code=409, detail="Deze PIN is al in gebruik als bedrijfs-PIN, kies een andere")
    # Uniqueness: andere medewerkers binnen ditzelfde bedrijf
    others = await db.employees.find(
        {"id": {"$ne": eid}, "company_id": cid, "active": True, "kiosk_pin_hash": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "name": 1, "kiosk_pin_hash": 1},
    ).to_list(2000)
    for o in others:
        if verify_password(pin, o.get("kiosk_pin_hash", "")):
            raise HTTPException(status_code=409, detail=f"Deze PIN is al in gebruik door {o.get('name', 'een andere medewerker')}, kies een andere")
    pin_hash = hash_password(pin)
    await db.employees.update_one({"id": eid}, {"$set": {"kiosk_pin_hash": pin_hash, "app_role": "kiosk"}})
    return {"ok": True, "has_kiosk_pin": True}


class KioskEmployeePinIn(BaseModel):
    pin: str


@api.post("/kiosk/employee-verify")
async def kiosk_employee_verify(body: KioskEmployeePinIn, kiosk=Depends(get_kiosk_session)):
    """Verifieert kiosk-medewerker PIN voor het gekoppelde bedrijf. Wordt
    aangeroepen op de Receptie Kiosk vlak voor het registreren van een
    pending betaling. Geeft de medewerker-info terug zodat de frontend
    direct kan submitten met `kiosk_employee_id`."""
    cid = kiosk.get("company_id")
    if not cid:
        raise HTTPException(status_code=401, detail="Kiosk niet gekoppeld aan een bedrijf")
    pin = (body.pin or "").strip()
    if not pin:
        raise HTTPException(status_code=400, detail="PIN ontbreekt")
    candidates = await db.employees.find(
        {"company_id": cid, "active": True, "app_role": "kiosk"}, {"_id": 0}
    ).to_list(500)
    for emp in candidates:
        h = emp.get("kiosk_pin_hash")
        if h and verify_password(pin, h):
            return {"employee_id": emp["id"], "employee_name": emp.get("name", "")}
    raise HTTPException(status_code=401, detail="Ongeldige PIN")


@api.delete("/employees/{eid}")
async def delete_employee(eid: str, user=Depends(get_current_user)):
    await db.employees.delete_one({"id": eid, **scope(user)})
    return {"ok": True}


class SalaryIn(BaseModel):
    employee_id: str
    gross: float
    advance: float = 0
    deductions: float = 0
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    period_month: int = Field(ge=1, le=12)
    period_year: int
    note: Optional[str] = ""


class SalaryOut(BaseModel):
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    gross: float
    advance: float
    deductions: float
    net: float
    currency: str
    period_month: int
    period_year: int
    note: str
    paid_at: str


async def _enrich_salary(s: dict) -> dict:
    e = await db.employees.find_one({"id": s["employee_id"]}, {"_id": 0, "name": 1})
    return {**s, "employee_name": e["name"] if e else None}


@api.get("/salaries", response_model=List[SalaryOut])
async def list_salaries(user=Depends(get_current_user), employee_id: Optional[str] = None):
    q = dict(scope(user))
    if employee_id:
        q["employee_id"] = employee_id
    docs = await db.salaries.find(q, {"_id": 0}).sort("paid_at", -1).to_list(500)
    return [await _enrich_salary(d) for d in docs]


@api.post("/salaries", response_model=SalaryOut)
async def create_salary(body: SalaryIn, user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    e = await db.employees.find_one({"id": body.employee_id, **scope(user)}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Werknemer niet gevonden")
    net = body.gross - body.advance - body.deductions
    doc = {
        "id": new_id(),
        "company_id": cid,
        "employee_id": body.employee_id,
        "gross": body.gross, "advance": body.advance, "deductions": body.deductions,
        "net": net, "currency": body.currency,
        "period_month": body.period_month, "period_year": body.period_year,
        "note": body.note or "", "paid_at": iso(now_utc()),
    }
    await db.salaries.insert_one(doc)
    doc.pop("_id", None)
    return await _enrich_salary(doc)


@api.delete("/salaries/{sid}")
async def delete_salary(sid: str, user=Depends(get_current_user)):
    await db.salaries.delete_one({"id": sid, **scope(user)})
    return {"ok": True}


@api.get("/salaries/{sid}/pdf")
async def salary_pdf_endpoint(sid: str):
    s = await db.salaries.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Loonstrook niet gevonden")
    e = await db.employees.find_one({"id": s["employee_id"]}, {"_id": 0}) or {}
    s = {**s, **(await _company_brand_info(s.get("company_id")))}
    pdf = payslip_pdf(s, e)
    return _pdf_response(pdf, f"loonstrook-{e.get('name','employee')}-{s['period_year']}-{s['period_month']:02d}.pdf")


# =====================================================================
# Deposits (Borg)
# =====================================================================
class DepositIn(BaseModel):
    tenant_id: str
    amount: float
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    note: Optional[str] = ""


class DepositOut(BaseModel):
    id: str
    tenant_id: str
    tenant_name: Optional[str] = None
    apartment_id: Optional[str] = None
    apartment_number: Optional[str] = None
    amount: float
    currency: str
    status: str  # held | refunded
    deduction: float
    refund_amount: float
    refund_note: Optional[str] = ""
    note: Optional[str] = ""
    created_at: str
    refunded_at: Optional[str] = None


async def _enrich_deposit(d: dict) -> dict:
    t = await db.tenants.find_one({"id": d["tenant_id"]}, {"_id": 0, "name": 1, "apartment_id": 1})
    apt_number = None
    if t and t.get("apartment_id"):
        a = await db.apartments.find_one({"id": t["apartment_id"]}, {"_id": 0, "number": 1})
        apt_number = a["number"] if a else None
    return {**d, "tenant_name": t["name"] if t else None,
            "apartment_id": t.get("apartment_id") if t else None,
            "apartment_number": apt_number}


@api.get("/deposits", response_model=List[DepositOut])
async def list_deposits(user=Depends(get_current_user)):
    docs = await db.deposits.find(scope(user), {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _enrich_deposit(d) for d in docs]


@api.post("/deposits", response_model=DepositOut)
async def create_deposit(body: DepositIn, user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    t = await db.tenants.find_one({"id": body.tenant_id, **scope(user)}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    doc = {
        "id": new_id(),
        "company_id": cid,
        "tenant_id": body.tenant_id,
        "amount": body.amount, "currency": body.currency,
        "status": "held", "deduction": 0, "refund_amount": 0,
        "refund_note": "", "note": body.note or "",
        "created_at": iso(now_utc()), "refunded_at": None,
    }
    await db.deposits.insert_one(doc)
    doc.pop("_id", None)
    return await _enrich_deposit(doc)


class DepositRefundIn(BaseModel):
    deduction: float = 0
    refund_note: Optional[str] = ""


@api.post("/deposits/{did}/refund", response_model=DepositOut)
async def refund_deposit(did: str, body: DepositRefundIn, user=Depends(get_current_user)):
    d = await db.deposits.find_one({"id": did, **scope(user)}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Borg niet gevonden")
    if d["status"] != "held":
        raise HTTPException(status_code=400, detail="Borg is al gerestitueerd")
    refund_amount = max(d["amount"] - body.deduction, 0)
    from pymongo import ReturnDocument
    updated = await db.deposits.find_one_and_update(
        {"id": did, **scope(user)},
        {"$set": {
            "status": "refunded", "deduction": body.deduction,
            "refund_amount": refund_amount,
            "refund_note": body.refund_note or "",
            "refunded_at": iso(now_utc()),
        }},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    return await _enrich_deposit(updated)


@api.delete("/deposits/{did}")
async def delete_deposit(did: str, user=Depends(get_current_user)):
    await db.deposits.delete_one({"id": did, **scope(user)})
    return {"ok": True}


@api.get("/deposits/{did}/refund-pdf")
async def deposit_refund_pdf_endpoint(did: str):
    d = await db.deposits.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Borg niet gevonden")
    t = await db.tenants.find_one({"id": d["tenant_id"]}, {"_id": 0}) or {}
    apt_id = t.get("apartment_id")
    a = await db.apartments.find_one({"id": apt_id}, {"_id": 0}) if apt_id else {}
    d = {**d, **(await _company_brand_info(d.get("company_id")))}
    pdf = deposit_refund_pdf(d, t, a or {})
    return _pdf_response(pdf, f"borg-restitutie-{d['id'][:8]}.pdf")


# =====================================================================
# Maintenance
# =====================================================================
class MaintenanceIn(BaseModel):
    apartment_id: str
    title: str
    description: Optional[str] = ""
    priority: Literal["low", "medium", "high"] = "medium"
    cost: float = 0
    currency: Literal["SRD", "USD", "EUR"] = "SRD"


class MaintenanceOut(MaintenanceIn):
    id: str
    apartment_number: Optional[str] = None
    status: str
    created_at: str
    resolved_at: Optional[str] = None


async def _enrich_maint(m: dict) -> dict:
    a = await db.apartments.find_one({"id": m["apartment_id"]}, {"_id": 0, "number": 1})
    return {**m, "apartment_number": a["number"] if a else None}


@api.get("/maintenance", response_model=List[MaintenanceOut])
async def list_maintenance(user=Depends(get_current_user), apartment_id: Optional[str] = None):
    q = dict(scope(user))
    if apartment_id:
        q["apartment_id"] = apartment_id
    docs = await db.maintenance.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _enrich_maint(d) for d in docs]


@api.post("/maintenance", response_model=MaintenanceOut)
async def create_maintenance(body: MaintenanceIn, user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    a = await db.apartments.find_one({"id": body.apartment_id, **scope(user)}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    doc = {"id": new_id(), "company_id": cid, **body.model_dump(),
           "status": "open", "created_at": iso(now_utc()), "resolved_at": None}
    await db.maintenance.insert_one(doc)
    doc.pop("_id", None)
    return await _enrich_maint(doc)


class MaintenanceUpdateStatus(BaseModel):
    status: Literal["open", "in_progress", "done"]


@api.post("/maintenance/{mid}/status", response_model=MaintenanceOut)
async def update_maintenance_status(mid: str, body: MaintenanceUpdateStatus, user=Depends(get_current_user)):
    from pymongo import ReturnDocument
    update = {"status": body.status}
    if body.status == "done":
        update["resolved_at"] = iso(now_utc())
    else:
        update["resolved_at"] = None
    res = await db.maintenance.find_one_and_update(
        {"id": mid, **scope(user)}, {"$set": update},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Ticket niet gevonden")
    return await _enrich_maint(res)


@api.delete("/maintenance/{mid}")
async def delete_maintenance(mid: str, user=Depends(get_current_user)):
    await db.maintenance.delete_one({"id": mid, **scope(user)})
    return {"ok": True}


# =====================================================================
# Kasgeld (cash)
# =====================================================================
class CashEntryIn(BaseModel):
    type: Literal["in", "out"]
    amount: float
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    description: str
    category: Optional[str] = "overig"


class CashEntryOut(CashEntryIn):
    id: str
    created_at: str


@api.get("/kasgeld", response_model=List[CashEntryOut])
async def list_cash(user=Depends(get_current_user)):
    docs = await db.kasgeld.find(scope(user), {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api.post("/kasgeld", response_model=CashEntryOut)
async def create_cash(body: CashEntryIn, user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    doc = {"id": new_id(), "company_id": cid, **body.model_dump(), "created_at": iso(now_utc())}
    await db.kasgeld.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/kasgeld/{cid}")
async def delete_cash(cid: str, user=Depends(get_current_user)):
    await db.kasgeld.delete_one({"id": cid, **scope(user)})
    return {"ok": True}


@api.get("/kasgeld/balance")
async def cash_balance(user=Depends(get_current_user)):
    """Compute per-currency cash balance."""
    pipeline = [
        {"$match": scope(user)},
        {"$group": {
            "_id": {"currency": "$currency", "type": "$type"},
            "total": {"$sum": "$amount"},
        }},
    ]
    balances = {"SRD": 0.0, "USD": 0.0, "EUR": 0.0}
    async for r in db.kasgeld.aggregate(pipeline):
        cur = r["_id"]["currency"]
        t = r["_id"]["type"]
        sign = 1 if t == "in" else -1
        balances[cur] = balances.get(cur, 0) + sign * r["total"]
    return balances


# =====================================================================
# AES-256 secure receipt + QR verification
# =====================================================================
from pdf_security import secure_pdf, make_verify_token, verify_token  # noqa: E402


@api.get("/payments/{payment_id}/secure-pdf")
async def payment_secure_pdf(payment_id: str, encrypted: bool = False):
    p = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Kwitantie niet gevonden")
    p = await _enrich_payment(p)
    base = receipt_pdf(p)
    token = make_verify_token({
        "kind": "payment", "id": payment_id, "rn": p["receipt_number"],
        "amt": p["amount"], "cur": p["currency"], "ts": int(now_utc().timestamp()),
    })
    public_base = os.environ.get("PUBLIC_BASE_URL", "")
    verify_url = f"{public_base}/api/verify/{token}" if public_base else f"/api/verify/{token}"
    out = secure_pdf(base, verify_url, encrypted=encrypted)
    return _pdf_response(out, f"kwitantie-{p['receipt_number']}{'-encrypted' if encrypted else ''}.pdf")


@api.get("/verify/{token}")
async def verify_pdf_token(token: str):
    payload = verify_token(token)
    if not payload:
        return {"valid": False, "reason": "Ongeldige of geknoeide handtekening"}
    kind = payload.get("kind")
    if kind == "payment":
        p = await db.payments.find_one({"id": payload.get("id")}, {"_id": 0})
        if not p:
            return {"valid": False, "reason": "Kwitantie niet gevonden in database"}
        if p["receipt_number"] != payload.get("rn") or float(p["amount"]) != float(payload.get("amt", 0)):
            return {"valid": False, "reason": "Gegevens komen niet overeen met origineel"}
        return {
            "valid": True,
            "type": "Kwitantie",
            "receipt_number": p["receipt_number"],
            "amount": p["amount"],
            "currency": p["currency"],
            "paid_at": p["paid_at"],
            "issued_at": datetime.fromtimestamp(payload.get("ts", 0)).isoformat(),
        }
    return {"valid": False, "reason": "Onbekend type"}


# =====================================================================
# PWA Push Notifications
# =====================================================================
from push_service import send_push  # noqa: E402

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")


async def _notify_company_admins(company_id: str, title: str, body: str, data: dict | None = None) -> int:
    """Stuur een push naar ALLE admins/owners/boekhouders van een bepaalde
    company. Push-dispatch gebeurt PARALLEL via asyncio.to_thread zodat het
    backend-antwoord nooit blokkeert op trage WebPush-endpoints.

    Wordt gebruikt voor automatische meldingen zoals:
      • nieuwe kiosk-betaling
      • achterstand-alert
      • nieuwe factuur
      • goedkeuring nodig

    Verlopen subs worden direct opgeschoond. Faalt nooit hard — return
    aantal succesvol verzonden.
    """
    if not company_id:
        return 0
    # Vind alle admin/owner/boekhouder users van deze company. Boekhouders
    # hebben dezelfde betalingsverwerkings-rechten als admins (geen approval
    # nodig) dus krijgen ook real-time meldingen.
    admin_ids = []
    async for u in db.users.find(
        {"company_id": company_id, "role": {"$in": ["admin", "owner", "boekhouder"]}},
        {"_id": 0, "id": 1},
    ):
        admin_ids.append(u["id"])
    if not admin_ids:
        return 0
    # Verzamel alle subscriptions eerst (1 DB-call), dispatch dan parallel
    subs = []
    async for sub in db.push_subs.find({"user_id": {"$in": admin_ids}}, {"_id": 0}):
        subs.append(sub)
    if not subs:
        return 0

    async def _send_one(sub):
        info = {"endpoint": sub["endpoint"], "keys": sub["keys"]}
        # pywebpush is blocking sync — run in threadpool zodat we niet
        # andere subs blokkeren tijdens 1 trage push.
        ok = await asyncio.to_thread(send_push, info, title, body, data or {})
        if not ok:
            await db.push_subs.delete_one({"endpoint": sub["endpoint"]})
        return ok

    results = await asyncio.gather(*[_send_one(s) for s in subs], return_exceptions=True)
    # Naast de OS-level push, broadcast OOK direct naar elke open SSE
    # connectie van deze company. Dit geeft <50ms latency naar open admin
    # tabs (waar FCM/APNS 200-1000ms doet). Open tabs negeren de duplicate
    # via een client-side timestamp dedupe.
    try:
        await _sse_broadcast(company_id, {
            "type": "notification",
            "title": title,
            "body": body,
            "data": data or {},
        })
    except Exception as e:  # noqa: BLE001
        print(f"[sse] broadcast failed: {e}")
    return sum(1 for r in results if r is True)


# =====================================================================
# Server-Sent Events (SSE) — real-time push naar open admin tabs
# Veel sneller dan WebPush voor open tabs (geen FCM/APNS roundtrip).
# Verwacht: <100ms latency van event tot UI render.
# =====================================================================
_sse_queues: dict[str, list] = {}  # company_id -> list[asyncio.Queue]


async def _sse_broadcast(company_id: str, event: dict):
    """Push een event naar alle open SSE connecties van een company."""
    if not company_id:
        return
    queues = _sse_queues.get(company_id, [])
    if not queues:
        return
    msg = json.dumps(event)
    # Snapshot om mid-iteration mutatie veilig te houden
    for q in list(queues):
        try:
            q.put_nowait(msg)
        except Exception:  # noqa: BLE001
            pass


@api.get("/admin/events")
async def admin_events_sse(request: Request, user=Depends(get_current_user)):
    """Server-Sent Events stream voor real-time admin notificaties.
    Gebruikt door /admin/payments e.a. om instant UI updates te krijgen
    zonder polling. Hartslag elke 25s om proxies door te laten."""
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(status_code=400, detail="Geen bedrijf")
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _sse_queues.setdefault(cid, []).append(queue)

    async def event_stream():
        try:
            # Initial handshake zodat de client direct weet dat hij verbonden is
            yield f"event: ready\ndata: {{\"ts\":\"{iso(now_utc())}\"}}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=25.0)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    # Heartbeat — houdt connectie levend door proxies/load balancers
                    yield ": heartbeat\n\n"
        finally:
            try:
                _sse_queues.get(cid, []).remove(queue)
            except ValueError:
                pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # disable nginx buffering
            "Connection": "keep-alive",
        },
    )


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: dict
    user_label: Optional[str] = ""  # admin label for filtering
    user_agent: Optional[str] = ""  # browser UA — getoond in /admin/notifications


@api.get("/push/vapid-public-key")
async def push_vapid_key():
    return {"public_key": VAPID_PUBLIC_KEY}


@api.post("/push/subscribe")
async def push_subscribe(body: PushSubscriptionIn, request: Request, user=Depends(get_current_user)):
    # User-agent komt uit body (frontend stuurt navigator.userAgent) of als
    # fallback uit de HTTP header. Wordt later vertaald naar een leesbaar
    # device-label ("iPhone Safari", "Chrome Desktop") in de UI.
    ua = (body.user_agent or "").strip() or (request.headers.get("user-agent") or "")
    now_iso = iso(now_utc())
    set_doc = {
        "user_id": user["id"],
        "endpoint": body.endpoint,
        "keys": body.keys,
        "user_label": body.user_label or user.get("email", ""),
        "user_agent": ua,
        "last_seen_at": now_iso,
    }
    set_on_insert = {
        "id": new_id(),
        "created_at": now_iso,
    }
    # Upsert by endpoint — bij update behouden we created_at + id.
    await db.push_subs.update_one(
        {"endpoint": body.endpoint},
        {"$set": set_doc, "$setOnInsert": set_on_insert},
        upsert=True,
    )
    return {"ok": True}


@api.get("/push/status")
async def push_status(user=Depends(get_current_user)):
    """Hoeveel apparaten heeft deze user geregistreerd?"""
    n = await db.push_subs.count_documents({"user_id": user["id"]})
    return {"devices": n}


@api.get("/push/devices")
async def push_devices(user=Depends(get_current_user)):
    """Lijst alle gekoppelde apparaten van de huidige gebruiker — getoond
    in /admin/notifications zodat de admin kan zien welke devices push
    krijgen en eventueel een oud / verloren apparaat kan loskoppelen."""
    items = []
    async for sub in db.push_subs.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1):
        # id-fallback voor oude documents zonder id-veld.
        sid = sub.get("id") or sub.get("endpoint", "")[-32:]
        items.append({
            "id": sid,
            "endpoint": sub.get("endpoint", ""),
            "user_agent": sub.get("user_agent", ""),
            "created_at": sub.get("created_at"),
            "last_seen_at": sub.get("last_seen_at") or sub.get("created_at"),
            "label": _device_label_from_ua(sub.get("user_agent", "")),
        })
    return items


def _device_label_from_ua(ua: str) -> str:
    """Vertaal user-agent naar een leesbaar device-label.

    We doen het zelf (geen extra dependency) zodat de UI direct ziet:
      "iPhone · Safari" / "Android · Chrome" / "Windows · Chrome" / "Mac · Safari"
    Bij onbekende UA fall-back naar "Apparaat" zodat de admin alsnog
    iets ziet om te tikken.
    """
    if not ua:
        return "Apparaat"
    ua_l = ua.lower()
    # OS
    if "iphone" in ua_l:
        os_name = "iPhone"
    elif "ipad" in ua_l:
        os_name = "iPad"
    elif "android" in ua_l:
        os_name = "Android"
    elif "windows" in ua_l:
        os_name = "Windows"
    elif "mac os x" in ua_l or "macintosh" in ua_l:
        os_name = "Mac"
    elif "linux" in ua_l:
        os_name = "Linux"
    else:
        os_name = "Apparaat"
    # Browser (volgorde belangrijk — Edge/Chrome bevatten "safari" in hun UA)
    if "edg/" in ua_l or "edge/" in ua_l:
        br = "Edge"
    elif "chrome/" in ua_l and "chromium" not in ua_l:
        br = "Chrome"
    elif "firefox/" in ua_l:
        br = "Firefox"
    elif "safari/" in ua_l:
        br = "Safari"
    elif "samsungbrowser" in ua_l:
        br = "Samsung Internet"
    else:
        br = ""
    return f"{os_name} · {br}".rstrip(" ·") if br else os_name


@api.delete("/push/devices/{device_id}")
async def push_remove_device(device_id: str, user=Depends(get_current_user)):
    """Verwijder een specifiek device uit de gekoppelde push-apparaten van
    de huidige user. We accepteren zowel het id-veld als de laatste 32
    chars van het endpoint (voor oude records zonder id-veld)."""
    res = await db.push_subs.delete_one({
        "user_id": user["id"],
        "$or": [
            {"id": device_id},
            {"endpoint": {"$regex": f"{re.escape(device_id)}$"}},
        ],
    })
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Apparaat niet gevonden")
    return {"ok": True}


@api.post("/push/unsubscribe")
async def push_unsubscribe(body: dict, user=Depends(get_current_user)):
    endpoint = body.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=400, detail="endpoint vereist")
    await db.push_subs.delete_one({"endpoint": endpoint})
    return {"ok": True}


class PushTestIn(BaseModel):
    title: str = "SuriRent test"
    body: str = "Push notificatie werkt!"


@api.post("/push/test")
async def push_test(body: PushTestIn, user=Depends(get_current_user)):
    """Send a test push to all subscriptions of current admin."""
    sent = 0
    failed = 0
    cursor = db.push_subs.find({"user_id": user["id"]}, {"_id": 0})
    async for sub in cursor:
        sub_info = {"endpoint": sub["endpoint"], "keys": sub["keys"]}
        ok = send_push(sub_info, body.title, body.body, {"kind": "test", "url": "/admin/notifications"})
        if ok:
            sent += 1
        else:
            failed += 1
            await db.push_subs.delete_one({"endpoint": sub["endpoint"]})
    total = await db.push_subs.count_documents({"user_id": user["id"]})
    return {"sent": sent, "failed": failed, "remaining_devices": total}


@api.post("/push/notify-overdue")
async def push_notify_overdue(user=Depends(get_current_user)):
    """Send admin a summary push of overdue tenants."""
    overdue = []
    async for t in db.tenants.find({**scope(user), "apartment_id": {"$ne": None}}, {"_id": 0}):
        bal = await _calc_balance(t)
        if bal["balance"] > 0:
            overdue.append((t["name"], bal["balance"], bal["currency"]))
    if not overdue:
        msg = "Geen openstaande betalingen — alles is voldaan!"
    else:
        top = overdue[:3]
        names = ", ".join(n for n, _, _ in top)
        extra = f" +{len(overdue) - 3} anderen" if len(overdue) > 3 else ""
        msg = f"{len(overdue)} huurders openstaand: {names}{extra}"
    sent = 0
    async for sub in db.push_subs.find({"user_id": user["id"]}, {"_id": 0}):
        if send_push(
            {"endpoint": sub["endpoint"], "keys": sub["keys"]},
            "Openstaande huur",
            msg,
            {"kind": "overdue", "count": len(overdue), "url": "/admin/invoices"},
        ):
            sent += 1
    return {"sent": sent, "overdue_count": len(overdue), "message": msg}


# =====================================================================
# Company settings (SMTP, Twilio, Mope, Uni5Pay, Shelly, custom domain)
# =====================================================================
from settings_service import (
    empty_section as _empty_section,
    mask_section as _mask_section,
    merge_section as _merge_section,
    reveal_section as _reveal_section,
    SECTION_SECRETS as _SECTION_SECRETS,
)

VALID_SETTINGS_SECTIONS = ["smtp", "twilio", "mope", "uni5pay", "shelly", "domain", "invoicing"]


async def _get_company_settings_doc(company_id: str) -> dict:
    """Fetch full raw settings doc (encrypted secrets intact). Creates empty if missing."""
    doc = await db.company_settings.find_one({"company_id": company_id}, {"_id": 0})
    if not doc:
        doc = {"company_id": company_id}
        for s in VALID_SETTINGS_SECTIONS:
            doc[s] = _empty_section(s)
    else:
        # Backfill any new section keys that didn't exist before.
        for s in VALID_SETTINGS_SECTIONS:
            if s not in doc or not doc[s]:
                doc[s] = _empty_section(s)
    return doc


async def get_company_section(company_id: str, section: str) -> dict:
    """Internal helper for other services (e.g. mail/twilio sender). Returns DECRYPTED."""
    if section not in VALID_SETTINGS_SECTIONS:
        return {}
    doc = await _get_company_settings_doc(company_id)
    return _reveal_section(section, doc.get(section) or {})


@api.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    """Return all settings sections with secrets MASKED."""
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    doc = await _get_company_settings_doc(cid)
    out = {"company_id": cid}
    for s in VALID_SETTINGS_SECTIONS:
        out[s] = _mask_section(s, doc.get(s) or {})
    return out


@api.put("/settings/{section}")
async def update_settings_section(section: str, body: dict, user=Depends(get_current_user)):
    """Update a single section. Sends secrets back masked."""
    if section not in VALID_SETTINGS_SECTIONS:
        raise HTTPException(status_code=404, detail="Onbekende instellingen sectie")
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    doc = await _get_company_settings_doc(cid)
    existing_section = doc.get(section) or {}
    merged = _merge_section(section, existing_section, body or {})

    update = {
        f"{section}": merged,
        "updated_at": iso(now_utc()),
        "updated_by": user.get("email"),
    }
    await db.company_settings.update_one(
        {"company_id": cid},
        {"$set": update, "$setOnInsert": {"company_id": cid, "created_at": iso(now_utc())}},
        upsert=True,
    )
    return {"section": section, "data": _mask_section(section, merged)}


# Placeholder test endpoints — actual implementations come in Fases B-F.
@api.post("/settings/{section}/test")
async def test_settings_section(section: str, user=Depends(get_current_user)):
    if section not in VALID_SETTINGS_SECTIONS:
        raise HTTPException(status_code=404, detail="Onbekende sectie")
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    cfg = await get_company_section(cid, section)
    if not cfg.get("enabled"):
        raise HTTPException(status_code=400, detail="Sectie is uitgeschakeld — vink 'Ingeschakeld' aan en bewaar eerst.")

    if section == "smtp":
        from email_service import send_email, wrap_template, EmailError
        to = user.get("email") or cfg.get("from_email")
        if not to:
            raise HTTPException(status_code=400, detail="Geen ontvanger gevonden (vul afzender e-mail in)")
        html = wrap_template(
            "<h1>SMTP test geslaagd</h1>"
            "<p>Als je deze e-mail ontvangt, is de SMTP configuratie voor je bedrijf correct.</p>"
            "<p>Je kunt nu kwitanties, facturen en herinneringen verzenden naar je huurders.</p>"
        )
        try:
            await send_email(cfg, to, "SuriRent SMTP test", html)
        except EmailError as e:
            return {"section": section, "ok": False, "detail": str(e)}
        return {"section": section, "ok": True, "detail": f"Test e-mail verzonden naar {to}"}

    if section == "twilio":
        from twilio_service import send_whatsapp, send_sms, TwilioError
        # Try WhatsApp first if from is set, else SMS.
        test_msg = "SuriRent test bericht — als je dit ontvangt is je Twilio configuratie correct."
        # Find a destination: prefer admin's own phone from user record (not stored normally),
        # so we test by sending to the configured `from` itself (will fail with sandbox not paired,
        # but at minimum validates credentials).
        target = cfg.get("whatsapp_from") or cfg.get("sms_from")
        if not target:
            raise HTTPException(status_code=400, detail="Vul minimaal WhatsApp- of SMS-afzender in")
        try:
            if cfg.get("whatsapp_from"):
                await send_whatsapp(cfg, target, test_msg)
                return {"section": section, "ok": True, "detail": f"WhatsApp testbericht verzonden naar {target}"}
            await send_sms(cfg, target, test_msg)
            return {"section": section, "ok": True, "detail": f"SMS testbericht verzonden naar {target}"}
        except TwilioError as e:
            return {"section": section, "ok": False, "detail": str(e)}

    if section in ("mope", "uni5pay"):
        from payments_service import (
            mope_create_payment_request, uni5pay_create_payment_request, GatewayError, is_mope_test_mode,
        )
        # Test by creating a TINY (1 cent) payment request — Mope test tokens return mock data.
        # Production tokens will actually create a real request, so warn the user.
        try:
            if section == "mope":
                if not is_mope_test_mode(cfg):
                    return {"section": section, "ok": False,
                            "detail": "Productie token gedetecteerd — test verbinding is alleen veilig met een test_ token. "
                                      "Gebruik een sandbox-key om te testen."}
                result = await mope_create_payment_request(
                    cfg, description="SuriRent test", amount=1.00, currency="SRD",
                    order_id=f"test-{new_id()[:8]}",
                    redirect_url=cfg.get("callback_url") or "https://example.com/return",
                )
                return {"section": section, "ok": True,
                        "detail": f"Mope test betaalverzoek aangemaakt: {result.get('url')}"}
            await uni5pay_create_payment_request(cfg)
            return {"section": section, "ok": True, "detail": "Uni5Pay test geslaagd"}
        except GatewayError as e:
            return {"section": section, "ok": False, "detail": str(e)}

    if section == "shelly":
        from shelly_service import list_devices, ShellyError
        try:
            devs = await list_devices(cfg)
            return {"section": section, "ok": True,
                    "detail": f"Verbonden met Shelly Cloud — {len(devs)} apparaat(en) gevonden."}
        except ShellyError as e:
            return {"section": section, "ok": False, "detail": str(e)}

    if section == "domain":
        import socket
        custom = (cfg.get("custom_domain") or "").strip().lower()
        if not custom:
            return {"section": section, "ok": False, "detail": "Vul eerst een custom domein in."}
        # Target = the server hostname users normally use to reach this app.
        app_target = (os.environ.get("APP_PUBLIC_HOST")
                      or os.environ.get("APP_PUBLIC_URL", "")
                      .replace("https://", "").replace("http://", "").rstrip("/"))
        if not app_target:
            return {"section": section, "ok": False,
                    "detail": "Server is niet geconfigureerd voor custom domeinen: zet APP_PUBLIC_HOST in backend/.env (bv. app.surirent.sr)."}
        try:
            host_ip = socket.gethostbyname(custom)
        except socket.gaierror as e:
            return {"section": section, "ok": False,
                    "detail": f"DNS lookup mislukt voor {custom}: {e}. "
                              f"Stel CNAME of A record naar {app_target} in en wacht op DNS propagatie."}
        try:
            target_ip = socket.gethostbyname(app_target)
        except socket.gaierror:
            return {"section": section, "ok": False,
                    "detail": f"Kan target {app_target} niet resolven — controleer APP_PUBLIC_HOST."}
        if host_ip == target_ip:
            await db.company_settings.update_one(
                {"company_id": company_id_of(user)},
                {"$set": {"domain.dns_verified": True, "updated_at": iso(now_utc())}},
            )
            return {"section": section, "ok": True,
                    "detail": f"{custom} wijst correct naar {app_target} (IP {target_ip}). "
                              "Voeg dit domein nu toe als alias-vhost in CloudPanel met Let's Encrypt SSL."}
        return {"section": section, "ok": False,
                "detail": f"{custom} resolveert naar {host_ip}, maar verwacht het IP van {app_target} ({target_ip}). "
                          f"Controleer je DNS record."}

    # Other sections come in later Fases.
    return {
        "section": section,
        "ok": False,
        "detail": "Test endpoint nog niet geïmplementeerd voor deze sectie. Wordt in een volgende fase toegevoegd.",
    }


# ============== Email send endpoints (Fase B) ==============
class EmailSendIn(BaseModel):
    to: Optional[str] = None  # override; otherwise we use tenant.email
    message: Optional[str] = ""  # optional extra note shown above the receipt block


async def _smtp_or_400(user) -> dict:
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    cfg = await get_company_section(cid, "smtp")
    if not cfg.get("enabled"):
        raise HTTPException(status_code=400, detail="SMTP is niet ingeschakeld — configureer eerst onder Instellingen → E-mail.")
    return cfg


@api.post("/email/payment/{payment_id}")
async def email_payment_receipt(payment_id: str, body: EmailSendIn, user=Depends(get_current_user)):
    from email_service import send_email, wrap_template, EmailError
    cfg = await _smtp_or_400(user)
    p = await db.payments.find_one({"id": payment_id, **scope(user)}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Kwitantie niet gevonden")
    p = await _enrich_payment(p)
    tenant = await db.tenants.find_one({"id": p.get("tenant_id"), **scope(user)}, {"_id": 0}) or {}
    to = (body.to or tenant.get("email") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Geen ontvanger — vul een e-mailadres in of zet er een bij de huurder")
    pdf_bytes = receipt_pdf(p)
    extra_note = f"<p>{body.message}</p>" if body.message else ""
    content = f"""
        {extra_note}
        <h1>Kwitantie {p['receipt_number']}</h1>
        <p>Beste {tenant.get('name', 'huurder')},<br />Hierbij ontvang je de kwitantie van je betaling.</p>
        <table class="kv">
          <tr><td>Datum</td><td>{p.get('paid_at', '')[:10]}</td></tr>
          <tr><td>Bedrag</td><td>{p['currency']} {p['amount']:.2f}</td></tr>
          <tr><td>Betaalmethode</td><td>{p.get('method', '')}</td></tr>
          <tr><td>Appartement</td><td>{p.get('apartment_number', '-')}</td></tr>
        </table>
    """
    try:
        await send_email(cfg, to, f"Kwitantie {p['receipt_number']} - SuriRent", wrap_template(content),
                         attachments=[(f"kwitantie-{p['receipt_number']}.pdf", pdf_bytes, "application/pdf")])
    except EmailError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"ok": True, "sent_to": to}


@api.post("/email/invoice/{invoice_id}")
async def email_invoice(invoice_id: str, body: EmailSendIn, user=Depends(get_current_user)):
    from email_service import send_email, wrap_template, EmailError
    cfg = await _smtp_or_400(user)
    inv = await db.invoices.find_one({"id": invoice_id, **scope(user)}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden")
    inv = await _enrich_invoice(inv)
    tenant = await db.tenants.find_one({"id": inv["tenant_id"], **scope(user)}, {"_id": 0}) or {}
    apt = await db.apartments.find_one({"id": inv.get("apartment_id"), **scope(user)}, {"_id": 0}) or {}
    to = (body.to or tenant.get("email") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Geen ontvanger — vul een e-mailadres in of zet er een bij de huurder")
    payments = await db.payments.find({
        **scope(user),
        "tenant_id": inv["tenant_id"], "category": "huur",
        "period_month": inv["period_month"], "period_year": inv["period_year"],
    }, {"_id": 0}).to_list(50)
    inv = {**inv, **(await _company_brand_info(inv.get("company_id")))}
    pdf_bytes = invoice_pdf(inv, tenant, apt, payments)
    extra_note = f"<p>{body.message}</p>" if body.message else ""
    months_nl = ["januari", "februari", "maart", "april", "mei", "juni",
                 "juli", "augustus", "september", "oktober", "november", "december"]
    period_label = f"{months_nl[inv['period_month'] - 1]} {inv['period_year']}"
    content = f"""
        {extra_note}
        <h1>Factuur {inv['invoice_number']}</h1>
        <p>Beste {tenant.get('name', 'huurder')},<br />Hierbij ontvang je je factuur voor {period_label}.</p>
        <table class="kv">
          <tr><td>Periode</td><td>{period_label}</td></tr>
          <tr><td>Bedrag</td><td>{inv['currency']} {inv['amount']:.2f}</td></tr>
          <tr><td>Status</td><td>{inv['status']}</td></tr>
          <tr><td>Appartement</td><td>{apt.get('number', '-')}</td></tr>
        </table>
    """
    try:
        await send_email(cfg, to, f"Factuur {inv['invoice_number']} - SuriRent", wrap_template(content),
                         attachments=[(f"factuur-{inv['invoice_number']}.pdf", pdf_bytes, "application/pdf")])
    except EmailError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"ok": True, "sent_to": to}


@api.post("/email/contract/{contract_id}")
async def email_contract(contract_id: str, body: EmailSendIn, user=Depends(get_current_user)):
    from email_service import send_email, wrap_template, EmailError
    cfg = await _smtp_or_400(user)
    c = await db.contracts.find_one({"id": contract_id, **scope(user)}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contract niet gevonden")
    c = await _enrich_contract(c)
    tenant = await db.tenants.find_one({"id": c["tenant_id"], **scope(user)}, {"_id": 0}) or {}
    apt = await db.apartments.find_one({"id": c["apartment_id"], **scope(user)}, {"_id": 0}) or {}
    to = (body.to or tenant.get("email") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Geen ontvanger — vul een e-mailadres in of zet er een bij de huurder")
    c = {**c, **(await _company_brand_info(c.get("company_id")))}
    pdf_bytes = contract_pdf(c, tenant, apt)
    extra_note = f"<p>{body.message}</p>" if body.message else ""
    # If contract is unsigned, include a signing link.
    sign_block = ""
    if c.get("sign_token") and not c.get("signed_at"):
        backend_url = (os.environ.get("APP_PUBLIC_URL")
                       or os.environ.get("PUBLIC_APP_URL", "")).rstrip("/")
        if backend_url:
            sign_block = (f"<p style=\"margin-top:14px\"><a href=\"{backend_url}/onderteken/{c['sign_token']}\""
                          f" style=\"background:#FF5C00;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700;display:inline-block\">"
                          f"Onderteken contract</a></p>")
    content = f"""
        {extra_note}
        <h1>Contract {c['contract_number']}</h1>
        <p>Beste {tenant.get('name', 'huurder')},<br />Hierbij ontvang je je huurcontract.</p>
        <table class="kv">
          <tr><td>Contract</td><td>{c['contract_number']}</td></tr>
          <tr><td>Appartement</td><td>{apt.get('number', '-')}</td></tr>
          <tr><td>Startdatum</td><td>{c.get('start_date', '')}</td></tr>
          <tr><td>Einddatum</td><td>{c.get('end_date') or '—'}</td></tr>
        </table>
        {sign_block}
    """
    try:
        await send_email(cfg, to, f"Huurcontract {c['contract_number']} - SuriRent", wrap_template(content),
                         attachments=[(f"contract-{c['contract_number']}.pdf", pdf_bytes, "application/pdf")])
    except EmailError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"ok": True, "sent_to": to}


# ============== WhatsApp / SMS send endpoints (Fase C) ==============
class MessageSendIn(BaseModel):
    to: Optional[str] = None
    channel: Literal["whatsapp", "sms"] = "whatsapp"
    message: Optional[str] = ""  # extra text prepended to template


async def _twilio_or_400(user) -> dict:
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    cfg = await get_company_section(cid, "twilio")
    if not cfg.get("enabled"):
        raise HTTPException(status_code=400, detail="Twilio is niet ingeschakeld — configureer eerst onder Instellingen → WhatsApp & SMS.")
    return cfg


def _public_url(path: str) -> str:
    """Return absolute URL using APP_PUBLIC_URL (frontend hostname), fallback to backend URL."""
    base = (os.environ.get("APP_PUBLIC_URL")
            or os.environ.get("PUBLIC_APP_URL")
            or os.environ.get("REACT_APP_BACKEND_URL", ""))
    return f"{base.rstrip('/')}{path}"


async def _twilio_send(cfg: dict, channel: str, to: str, body: str):
    from twilio_service import send_whatsapp, send_sms, TwilioError
    try:
        if channel == "whatsapp":
            await send_whatsapp(cfg, to, body)
        else:
            await send_sms(cfg, to, body)
    except TwilioError as e:
        raise HTTPException(status_code=502, detail=str(e))


@api.post("/message/payment/{payment_id}")
async def message_payment_receipt(payment_id: str, body: MessageSendIn, user=Depends(get_current_user)):
    cfg = await _twilio_or_400(user)
    p = await db.payments.find_one({"id": payment_id, **scope(user)}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Kwitantie niet gevonden")
    p = await _enrich_payment(p)
    tenant = await db.tenants.find_one({"id": p.get("tenant_id"), **scope(user)}, {"_id": 0}) or {}
    to = (body.to or tenant.get("phone") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Geen telefoonnummer — vul een nummer in of voeg toe aan de huurder")
    extra = f"{body.message.strip()}\n\n" if body.message else ""
    msg = (
        f"{extra}"
        f"Hallo {tenant.get('name', 'huurder')},\n\n"
        f"Bij dezen je kwitantie {p['receipt_number']}:\n"
        f"• Bedrag: {p['currency']} {p['amount']:.2f}\n"
        f"• Datum: {p.get('paid_at', '')[:10]}\n"
        f"• Methode: {p.get('method', '')}\n\n"
        f"📄 Kwitantie PDF: {_public_url(f'/api/payments/{payment_id}/pdf')}\n\n"
        f"— SuriRent"
    )
    # Voor WhatsApp: stuur JPG kwitantie als media-bijlage (inline preview).
    if body.channel == "whatsapp":
        try:
            from twilio_service import send_whatsapp as _swa
            await _swa(cfg, to, msg, media_url=_public_url(f"/api/payments/{payment_id}/image"))
        except Exception as e:  # noqa: BLE001
            print(f"[message-payment] whatsapp media fail, fallback text: {e}")
            await _twilio_send(cfg, body.channel, to, msg)
    else:
        await _twilio_send(cfg, body.channel, to, msg)
    return {"ok": True, "sent_to": to, "channel": body.channel}


@api.post("/message/invoice/{invoice_id}")
async def message_invoice(invoice_id: str, body: MessageSendIn, user=Depends(get_current_user)):
    cfg = await _twilio_or_400(user)
    inv = await db.invoices.find_one({"id": invoice_id, **scope(user)}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden")
    inv = await _enrich_invoice(inv)
    tenant = await db.tenants.find_one({"id": inv["tenant_id"], **scope(user)}, {"_id": 0}) or {}
    to = (body.to or tenant.get("phone") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Geen telefoonnummer — vul een nummer in of voeg toe aan de huurder")
    months_nl = ["januari", "februari", "maart", "april", "mei", "juni",
                 "juli", "augustus", "september", "oktober", "november", "december"]
    period = f"{months_nl[inv['period_month'] - 1]} {inv['period_year']}"
    extra = f"{body.message.strip()}\n\n" if body.message else ""
    msg = (
        f"{extra}"
        f"Hallo {tenant.get('name', 'huurder')},\n\n"
        f"Je factuur {inv['invoice_number']} voor {period}:\n"
        f"• Bedrag: {inv['currency']} {inv['amount']:.2f}\n"
        f"• Status: {inv['status']}\n\n"
        f"PDF: {_public_url(f'/api/invoices/{invoice_id}/pdf')}\n\n"
        f"— SuriRent"
    )
    await _twilio_send(cfg, body.channel, to, msg)
    return {"ok": True, "sent_to": to, "channel": body.channel}


@api.post("/tenants/{tenant_id}/reminder")
async def tenant_payment_reminder(
    tenant_id: str,
    body: dict = Body(default={}),
    user=Depends(get_current_user),
):
    """Stuur een herinnering naar een huurder met een overzicht van ALLE
    openstaande facturen (één bericht met opsomming van maanden + totaal).

    body = {channel: 'whatsapp' | 'sms' | 'email', message?: str}
    """
    channel = (body.get("channel") or "whatsapp").lower()
    custom_msg = (body.get("message") or "").strip()
    if channel not in ("whatsapp", "sms", "email"):
        raise HTTPException(status_code=400, detail="Onbekend kanaal")

    sc = scope(user)
    tenant = await db.tenants.find_one({"id": tenant_id, **sc}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")

    invs = await db.invoices.find(
        {**sc, "tenant_id": tenant_id, "status": {"$in": ["open", "sent", "pending", "overdue"]}},
        {"_id": 0},
    ).sort([("period_year", 1), ("period_month", 1)]).to_list(60)
    if not invs:
        raise HTTPException(status_code=400, detail="Deze huurder heeft geen openstaande facturen")

    months_nl = ["januari", "februari", "maart", "april", "mei", "juni",
                 "juli", "augustus", "september", "oktober", "november", "december"]
    cur = invs[0].get("currency", "SRD")
    total = sum(float(i.get("amount", 0)) for i in invs)
    lines = [f"• {months_nl[i['period_month']-1].capitalize()} {i['period_year']}: {cur} {float(i['amount']):.2f}" for i in invs]
    period_label = ", ".join(f"{months_nl[i['period_month']-1].capitalize()} {i['period_year']}" for i in invs[:3])
    if len(invs) > 3:
        period_label += f" (+{len(invs) - 3} meer)"

    if channel == "email":
        from email_service import send_email, wrap_template, EmailError
        cfg = await _smtp_or_400(user)
        to = (tenant.get("email") or "").strip()
        if not to:
            raise HTTPException(status_code=400, detail="Geen e-mailadres bij huurder")
        extra_note = f"<p>{custom_msg}</p>" if custom_msg else ""
        rows = "".join(
            f"<tr><td>{months_nl[i['period_month']-1].capitalize()} {i['period_year']}</td>"
            f"<td style='text-align:right'><b>{cur} {float(i['amount']):.2f}</b></td></tr>"
            for i in invs
        )
        content = f"""
            {extra_note}
            <h1>Betalingsherinnering</h1>
            <p>Beste {tenant.get('name', 'huurder')},<br />
            U heeft op dit moment <b>{len(invs)}</b> openstaande factu{'ren' if len(invs) > 1 else 'ur'}.
            Graag verzoeken wij u deze zo spoedig mogelijk te voldoen.</p>
            <table class="kv" style="width:100%;border-collapse:collapse">
              {rows}
              <tr style="border-top:2px solid #e2e8f0">
                <td><b>Totaal openstaand</b></td>
                <td style='text-align:right;color:#dc2626'><b>{cur} {total:.2f}</b></td>
              </tr>
            </table>
            <p style="margin-top:20px">Heeft u vragen? Neem gerust contact met ons op.</p>
        """
        try:
            await send_email(cfg, to, "Betalingsherinnering openstaande facturen",
                             wrap_template(content))
        except EmailError as e:
            raise HTTPException(status_code=502, detail=str(e))
        return {"sent": True, "channel": "email", "to": to, "count": len(invs)}

    # WhatsApp / SMS
    cfg = await _twilio_or_400(user)
    to = (tenant.get("phone") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Geen telefoonnummer bij huurder")
    extra = f"{custom_msg}\n\n" if custom_msg else ""
    msg = (
        f"{extra}"
        f"Hallo {tenant.get('name', 'huurder')},\n\n"
        f"Vriendelijke herinnering — u heeft {len(invs)} openstaande "
        f"factu{'ren' if len(invs) > 1 else 'ur'}:\n\n"
        + "\n".join(lines)
        + f"\n\nTotaal openstaand: *{cur} {total:.2f}*\n\n"
        f"Periodes: {period_label}\n\n"
        f"Gelieve zo spoedig mogelijk te betalen.\n\n— SuriRent"
    )
    await _twilio_send(cfg, channel, to, msg)
    return {"sent": True, "channel": channel, "to": to, "count": len(invs)}


@api.post("/message/contract/{contract_id}")
async def message_contract(contract_id: str, body: MessageSendIn, user=Depends(get_current_user)):
    cfg = await _twilio_or_400(user)
    c = await db.contracts.find_one({"id": contract_id, **scope(user)}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contract niet gevonden")
    c = await _enrich_contract(c)
    tenant = await db.tenants.find_one({"id": c["tenant_id"], **scope(user)}, {"_id": 0}) or {}
    to = (body.to or tenant.get("phone") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Geen telefoonnummer — vul een nummer in of voeg toe aan de huurder")
    extra = f"{body.message.strip()}\n\n" if body.message else ""
    pdf_link = _public_url(f"/api/contracts/{contract_id}/pdf")
    sign_line = ""
    if c.get("sign_token") and not c.get("signed_at"):
        sign_url = _public_url(f"/onderteken/{c['sign_token']}")
        sign_line = f"\nOnderteken hier: {sign_url}"
    msg = (
        f"{extra}"
        f"Hallo {tenant.get('name', 'huurder')},\n\n"
        f"Je huurcontract {c['contract_number']}:\n"
        f"• Startdatum: {c.get('start_date', '')}\n"
        f"• Einddatum: {c.get('end_date') or '—'}\n\n"
        f"PDF: {pdf_link}"
        f"{sign_line}\n\n"
        f"— SuriRent"
    )
    await _twilio_send(cfg, body.channel, to, msg)
    return {"ok": True, "sent_to": to, "channel": body.channel}


@api.post("/message/overdue-reminder/{tenant_id}")
async def message_overdue_reminder(tenant_id: str, body: MessageSendIn, user=Depends(get_current_user)):
    """Send a friendly overdue-payment reminder to a tenant."""
    cfg = await _twilio_or_400(user)
    t = await db.tenants.find_one({"id": tenant_id, **scope(user)}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    to = (body.to or t.get("phone") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Geen telefoonnummer — vul in of voeg toe aan de huurder")
    bal = await _calc_balance(t)
    if bal.get("balance", 0) <= 0:
        raise HTTPException(status_code=400, detail="Deze huurder heeft geen achterstand")
    extra = f"{body.message.strip()}\n\n" if body.message else ""
    msg = (
        f"{extra}"
        f"Hallo {t.get('name', 'huurder')},\n\n"
        f"Vriendelijke herinnering: er staat nog {bal['currency']} {bal['balance']:.2f} open.\n\n"
        f"Je kunt langskomen bij ons kantoor of via de Kiosk betalen.\n\n"
        f"— SuriRent"
    )
    await _twilio_send(cfg, body.channel, to, msg)
    return {"ok": True, "sent_to": to, "channel": body.channel}


# =====================================================================
# Shelly — elektriciteit per appartement (admin only)
# =====================================================================
async def _shelly_or_400(user) -> dict:
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    cfg = await get_company_section(cid, "shelly")
    if not cfg.get("enabled"):
        raise HTTPException(status_code=400, detail="Shelly is niet ingeschakeld — configureer eerst onder Instellingen → Shelly.")
    if not (cfg.get("cloud_token") or "").strip():
        raise HTTPException(status_code=400, detail="Shelly Cloud token ontbreekt — vul in onder Instellingen → Shelly.")
    return cfg


@api.get("/shelly/devices")
async def shelly_list_devices(user=Depends(get_current_user)):
    """List all Shelly devices on the company's Shelly Cloud account."""
    from shelly_service import list_devices, ShellyError
    cfg = await _shelly_or_400(user)
    try:
        devs = await list_devices(cfg)
    except ShellyError as e:
        raise HTTPException(status_code=502, detail=str(e))
    # Normalize to a small payload for the dropdown.
    out = []
    for d in devs:
        out.append({
            "device_id": str(d.get("id") or d.get("deviceId") or ""),
            "name": d.get("name") or d.get("alias") or "",
            "type": d.get("type") or d.get("gen") or "",
            "online": bool(d.get("online")) if "online" in d else None,
        })
    return out


@api.put("/apartments/{apt_id}/shelly")
async def bind_apartment_shelly(apt_id: str, body: ShellyBindIn, user=Depends(get_current_user)):
    """Bind or unbind a Shelly device to an apartment."""
    apt = await db.apartments.find_one({"id": apt_id, **scope(user)}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    if not (body.device_id or "").strip():
        await db.apartments.update_one({"id": apt_id}, {"$unset": {"shelly": ""}})
        return {"ok": True, "shelly": None}
    binding = {
        "device_id": body.device_id.strip(),
        "channel": int(body.channel or 0),
        "label": (body.label or "").strip(),
    }
    await db.apartments.update_one({"id": apt_id}, {"$set": {"shelly": binding}})
    return {"ok": True, "shelly": binding}


@api.get("/shelly/apartment/{apt_id}/status")
async def shelly_apartment_status(apt_id: str, user=Depends(get_current_user)):
    from shelly_service import device_status, ShellyError
    apt = await db.apartments.find_one({"id": apt_id, **scope(user)}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    binding = apt.get("shelly") or {}
    device_id = (binding.get("device_id") or "").strip()
    if not device_id:
        raise HTTPException(status_code=400, detail="Geen Shelly apparaat gekoppeld aan dit appartement")
    cfg = await _shelly_or_400(user)
    try:
        st = await device_status(cfg, device_id)
    except ShellyError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {
        "apartment_id": apt_id,
        "device_id": device_id,
        "channel": binding.get("channel", 0),
        "label": binding.get("label", ""),
        "online": st.get("online"),
        "ison": st.get("ison"),
        "power_w": st.get("power_w"),
        "energy_wh": st.get("energy_wh"),
    }


@api.post("/shelly/apartment/{apt_id}/control")
async def shelly_apartment_control(apt_id: str, body: ShellyControlIn, user=Depends(get_current_user)):
    from shelly_service import control_relay, ShellyError
    apt = await db.apartments.find_one({"id": apt_id, **scope(user)}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    binding = apt.get("shelly") or {}
    device_id = (binding.get("device_id") or "").strip()
    if not device_id:
        raise HTTPException(status_code=400, detail="Geen Shelly apparaat gekoppeld aan dit appartement")
    cfg = await _shelly_or_400(user)
    try:
        await control_relay(cfg, device_id, body.turn, int(binding.get("channel") or 0))
    except ShellyError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"ok": True, "apartment_id": apt_id, "turn": body.turn}


@api.post("/superadmin/run-trial-reminders")
async def manual_run_trial_reminders(user=Depends(require_role("superadmin"))):
    """Manually trigger the reminder sweep (useful for testing)."""
    await _send_trial_reminders()
    return {"ok": True}


@api.get("/admin/morning-briefing")
async def morning_briefing(user=Depends(require_role("admin"))):
    """Lichte dagbriefing voor /admin: aantal overdue invoices (>7 dgn),
    bedrag-totaal per valuta, nieuwe pendings vandaag, nieuwe betalingen
    vandaag. Frontend toont éénmalig per dag een banner (08:00-12:00).
    """
    cid = company_id_of(user)
    today = now_utc().date()
    week_ago = (now_utc() - timedelta(days=7)).date()
    midnight = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)

    # Overdue invoices > 7 days behind (status=open, created_at < 7 dagen geleden)
    overdue_q = {"company_id": cid, "status": {"$in": ["open", "overdue"]}}
    overdue_invoices = await db.invoices.find(overdue_q, {"_id": 0}).to_list(2000)
    overdue_filtered = []
    overdue_total_by_currency: dict = {}
    for inv in overdue_invoices:
        try:
            cat = inv.get("created_at") or ""
            cat_d = datetime.fromisoformat(cat.replace("Z", "+00:00")).date() if cat else None
        except Exception:
            cat_d = None
        if cat_d and cat_d <= week_ago:
            overdue_filtered.append(inv)
            cur = (inv.get("currency") or "SRD").upper()
            overdue_total_by_currency[cur] = overdue_total_by_currency.get(cur, 0.0) + float(inv.get("amount", 0))

    # Overdue payment-plan termijnen
    overdue_installments = 0
    today_iso = today.isoformat()
    async for inst in db.payment_plan_installments.find(
        {"company_id": cid, "status": "pending", "due_date": {"$lt": today_iso}},
        {"_id": 0, "id": 1},
    ):
        overdue_installments += 1

    # Pending approvals + payments since midnight
    new_pending = await db.payments.count_documents(
        {"company_id": cid, "status": "pending_approval", "paid_at": {"$gte": iso(midnight)}}
    )
    new_payments = await db.payments.count_documents(
        {"company_id": cid, "status": "approved", "paid_at": {"$gte": iso(midnight)}}
    )

    # Unieke huurders met achterstand
    unique_tenants = len({inv.get("tenant_id") for inv in overdue_filtered if inv.get("tenant_id")})

    return {
        "date": today_iso,
        "overdue_invoice_count": len(overdue_filtered),
        "overdue_tenant_count": unique_tenants,
        "overdue_total_by_currency": {k: round(v, 2) for k, v in overdue_total_by_currency.items()},
        "overdue_installment_count": overdue_installments,
        "new_pending_today": new_pending,
        "new_payments_today": new_payments,
    }


app.include_router(api)

async def _notify_tenant_installment_paid(plan_id: str, seq: int) -> None:
    """Stuur een korte WhatsApp/SMS bevestiging naar de huurder na een
    succesvolle termijn-betaling. Faalt stilzwijgend wanneer Twilio niet
    is ingeschakeld of er geen telefoonnummer is."""
    try:
        plan = await db.payment_plans.find_one({"id": plan_id}, {"_id": 0})
        if not plan:
            return
        tenant = await db.tenants.find_one(
            {"id": plan["tenant_id"]}, {"_id": 0, "name": 1, "phone": 1, "email": 1}
        ) or {}
        phone = (tenant.get("phone") or "").strip()
        cid = plan.get("company_id")
        cfg = await get_company_section(cid, "twilio") if cid else {}
        cur = plan.get("currency", "SRD")
        inst = await db.payment_plan_installments.find_one(
            {"plan_id": plan_id, "sequence": seq}, {"_id": 0}
        )
        if not inst:
            return
        total_inst = await db.payment_plan_installments.count_documents(
            {"plan_id": plan_id, "status": {"$ne": "cancelled"}}
        )
        paid_inst = await db.payment_plan_installments.count_documents(
            {"plan_id": plan_id, "status": "paid"}
        )
        next_inst = await db.payment_plan_installments.find_one(
            {"plan_id": plan_id, "status": "pending"}, {"_id": 0},
            sort=[("sequence", 1)],
        )
        remaining = total_inst - paid_inst
        amount = float(inst.get("amount") or 0)
        # Bouw publieke kwitantie-links — Twilio WhatsApp toont een JPG inline
        # als media bijlage; PDF-link komt in de tekst voor download/print.
        payment_id = inst.get("payment_id")
        receipt_image_url = _public_url(f"/api/payments/{payment_id}/image") if payment_id else None
        receipt_pdf_url = _public_url(f"/api/payments/{payment_id}/pdf") if payment_id else None
        if paid_inst >= total_inst:
            body = (
                f"Bedankt {tenant.get('name', 'huurder')}!\n\n"
                f"Termijn {seq}/{total_inst} betaald ({cur} {amount:.2f}).\n\n"
                f"*Uw betalingsregeling is volledig voldaan.* "
                f"Hartelijk dank voor de tijdige betaling!\n\n"
            )
        else:
            nl = ""
            if next_inst and next_inst.get("due_date"):
                try:
                    y, m, d = next_inst["due_date"].split("-")
                    nl = f"\nVolgende vervaldatum: {d}-{m}-{y}"
                except Exception:
                    nl = f"\nVolgende vervaldatum: {next_inst['due_date']}"
            body = (
                f"Bedankt {tenant.get('name', 'huurder')}!\n\n"
                f"Termijn {seq}/{total_inst} betaald ({cur} {amount:.2f}).\n"
                f"Nog *{remaining}* termijn{'en' if remaining != 1 else ''} te gaan.{nl}\n\n"
            )
        if receipt_pdf_url:
            body += f"📄 Kwitantie PDF: {receipt_pdf_url}\n\n"
        body += "— SuriRent"
        if cfg.get("enabled") and phone:
            try:
                from twilio_service import send_whatsapp
                await send_whatsapp(cfg, phone, body, media_url=receipt_image_url)
            except Exception as e:  # noqa: BLE001
                print(f"[plan-notify] twilio fail: {e}")
        # Optionele email — met PDF kwitantie als bijlage indien beschikbaar.
        email = (tenant.get("email") or "").strip()
        smtp = await get_company_section(cid, "smtp") if cid else {}
        if smtp.get("enabled") and email:
            try:
                from email_service import send_email, wrap_template
                next_line = ""
                if paid_inst < total_inst and next_inst:
                    next_line = f"<p>Nog <b>{remaining}</b> termijn(en) te gaan, volgende vervaldatum {next_inst.get('due_date','')}.</p>"
                elif paid_inst >= total_inst:
                    next_line = "<p><b>Uw betalingsregeling is volledig voldaan.</b></p>"
                link_block = (
                    f'<p style="margin:18px 0;"><a href="{receipt_pdf_url}" '
                    f'style="background:#FF5C00;color:#fff;padding:10px 16px;border-radius:8px;'
                    f'text-decoration:none;font-weight:bold;display:inline-block;">'
                    f'📄 Download kwitantie</a></p>'
                ) if receipt_pdf_url else ""
                content = f"""
                    <h1>Termijn {seq}/{total_inst} ontvangen</h1>
                    <p>Beste {tenant.get('name', 'huurder')},<br />
                    Bedankt voor uw betaling van <b>{cur} {amount:.2f}</b>.</p>
                    {next_line}
                    {link_block}
                """
                # Genereer PDF bijlage van de kwitantie zelf (compact, ~10 KB).
                # ReportLab is synchroon en kan 1-3s duren bij branding/logo —
                # draai het in een threadpool om het event loop niet te blokkeren.
                attachments = None
                if payment_id:
                    try:
                        payment_doc = await db.payments.find_one({"id": payment_id}, {"_id": 0})
                        if payment_doc:
                            enriched = await _enrich_payment(payment_doc)
                            pdf_bytes = await asyncio.to_thread(receipt_pdf, enriched)
                            attachments = [(f"kwitantie-{enriched.get('receipt_number','')}.pdf", pdf_bytes, "application/pdf")]
                    except Exception as e:  # noqa: BLE001
                        print(f"[plan-notify] pdf-attach fail: {e}")
                await send_email(
                    smtp, email,
                    f"Termijn {seq}/{total_inst} ontvangen — Betalingsregeling",
                    wrap_template(content),
                    attachments=attachments,
                )
            except Exception as e:  # noqa: BLE001
                print(f"[plan-notify] smtp fail: {e}")
    except Exception as e:  # noqa: BLE001
        print(f"[plan-notify] outer fail: {e}")



# --- Payment Plans (Betalingsregeling) router ---
# Apart bestand zodat server.py niet nog verder uitdijt. We injecteren de
# helpers expliciet zodat er geen circular import nodig is.
from payment_plans import make_router as _make_payment_plans_router, _build_pay_core as _build_plan_pay_core  # noqa: E402

_pp_helpers = {
    "new_id": new_id,
    "iso": iso,
    "now_utc": now_utc,
    "scope": scope,
    "company_id_of": company_id_of,
    "get_current_user": get_current_user,
    "require_role": require_role,
    "next_receipt_number": _next_receipt_number,
    "allocate_to_invoices": _allocate_payment_to_invoices,
    "notify_tenant_paid": _notify_tenant_installment_paid,
}
_payment_plans_router = _make_payment_plans_router(db, _pp_helpers)
# We voegen de router toe aan de hoofd `app` via /api prefix omdat
# `api.include_router(_payment_plans_router)` na `app.include_router(api)`
# niet meer alle endpoints registreert (sub-router al gemount).
app.include_router(_payment_plans_router, prefix="/api")

# Shared core voor tenant + kiosk installment-betaling
_plan_core = _build_plan_pay_core(db, _pp_helpers)


# ---------- Tenant Kiosk — Betalingsregelingen ----------
@app.get("/api/tenant-portal/payment-plans")
async def tenant_portal_payment_plans(tenant=Depends(get_tenant_session)):
    """Lijst van actieve betalingsregelingen voor de ingelogde huurder."""
    return await _plan_core["list_plans_for_tenant"](
        tenant["id"], tenant.get("company_id"), status="active",
    )


class _TenantPayInstallmentIn(BaseModel):
    method: Literal["contant", "mope", "uni5pay"] = "contant"
    note: Optional[str] = ""
    amount: Optional[float] = None


@app.post("/api/tenant-portal/payment-plans/{plan_id}/installments/{seq}/pay")
async def tenant_portal_pay_installment(
    plan_id: str, seq: int, body: _TenantPayInstallmentIn,
    tenant=Depends(get_tenant_session),
):
    """Huurder betaalt zelf een termijn vanuit zijn Tenant Kiosk."""
    plan = await db.payment_plans.find_one(
        {"id": plan_id, "tenant_id": tenant["id"], "company_id": tenant.get("company_id")},
        {"_id": 0},
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Regeling niet gevonden")
    out = await _plan_core["pay_installment_for"](
        plan, seq,
        method=body.method, amount=body.amount, note=body.note or "",
        received_by=tenant.get("name") or "Huurder Kiosk",
        approved_by_label=tenant.get("name") or "Huurder Kiosk",
        status="approved",
    )
    # Notify admins (zelfde flow als bij /tenant-portal/payments)
    try:
        await _notify_company_admins(
            tenant.get("company_id"),
            f"Termijnbetaling regeling — {plan.get('currency', '')} {float(body.amount or 0):,.2f}",
            f"{tenant.get('name')} betaalde termijn {seq} via Huurder Kiosk",
            {"kind": "payment", "url": "/admin/payment_plans", "badge_inc": 1},
        )
    except Exception as e:  # noqa: BLE001
        print(f"[push] tenant pay-installment notify failed: {e}")
    return out


# ---------- Operator Kiosk — Betalingsregelingen ----------
@app.get("/api/kiosk/tenants/{tenant_id}/payment-plans")
async def kiosk_tenant_payment_plans(tenant_id: str, _session=Depends(get_kiosk_session)):
    """Operator Kiosk haalt actieve regelingen op voor de huurder die nu
    aan de balie staat. Filter op company_id van de kiosk-sessie."""
    cid = _session.get("company_id")
    return await _plan_core["list_plans_for_tenant"](tenant_id, cid, status="active")


class _KioskPayInstallmentIn(BaseModel):
    method: Literal["contant", "mope", "uni5pay"] = "contant"
    note: Optional[str] = ""
    amount: Optional[float] = None
    employee_id: Optional[str] = None
    employee_pin: Optional[str] = None


@app.post("/api/kiosk/payment-plans/{plan_id}/installments/{seq}/pay")
async def kiosk_pay_installment(
    plan_id: str, seq: int, body: _KioskPayInstallmentIn,
    _session=Depends(get_kiosk_session),
):
    """Operator Kiosk medewerker int een termijn voor een huurder.
    Indien een `employee_id` + `employee_pin` is meegegeven → pending_approval
    zodat de admin later moet goedkeuren (zelfde patroon als kiosk_create_payment)."""
    cid = _session.get("company_id")
    plan = await db.payment_plans.find_one(
        {"id": plan_id, "company_id": cid}, {"_id": 0}
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Regeling niet gevonden")

    kiosk_emp_id, kiosk_emp_name, status = None, None, "approved"
    if body.employee_id:
        emp = await db.employees.find_one(
            {"id": body.employee_id, "company_id": cid, "active": True, "app_role": "kiosk"},
            {"_id": 0},
        )
        if not emp:
            raise HTTPException(status_code=404, detail="Kiosk-medewerker niet gevonden")
        if not emp.get("kiosk_pin_hash") or not verify_password(
            (body.employee_pin or "").strip(), emp["kiosk_pin_hash"],
        ):
            raise HTTPException(status_code=401, detail="Ongeldige PIN")
        kiosk_emp_id, kiosk_emp_name = emp["id"], emp.get("name", "")
        status = "pending_approval"

    out = await _plan_core["pay_installment_for"](
        plan, seq,
        method=body.method, amount=body.amount, note=body.note or "",
        received_by=kiosk_emp_name or "Operator Kiosk",
        approved_by_label=kiosk_emp_name or "Operator Kiosk",
        status=status,
        kiosk_employee_id=kiosk_emp_id,
        kiosk_employee_name=kiosk_emp_name,
    )
    # Notify admins (alleen bij pending_approval, anders is het al approved
    # en zien admins het wel in de feed).
    try:
        if status == "pending_approval":
            await _notify_company_admins(
                cid,
                "Termijnbetaling wacht op goedkeuring",
                f"{kiosk_emp_name or 'Kiosk'} ontving termijn {seq} voor {plan.get('tenant_name', 'huurder')}",
                {"kind": "approval", "url": "/admin/payments", "badge_inc": 1},
            )
    except Exception as e:  # noqa: BLE001
        print(f"[push] kiosk pay-installment notify failed: {e}")
    return out


# ---------- Background — Achterstallige termijnen WhatsApp/Email ----------
async def _send_overdue_installment_reminders():
    """1x per dag per huurder: stuur een herinnering voor achterstallige
    termijnen van betalingsregelingen. Tracking via plan.last_inst_reminder
    zodat we niet spammen.
    """
    today_key = now_utc().strftime("%Y-%m-%d")
    today_iso = now_utc().date().isoformat()
    # Eerste: groeperen per tenant_id
    pipeline = [
        {"$match": {"status": "pending", "due_date": {"$lt": today_iso}}},
        {"$lookup": {
            "from": "payment_plans", "localField": "plan_id",
            "foreignField": "id", "as": "plan",
        }},
        {"$unwind": "$plan"},
        {"$match": {"plan.status": "active"}},
        {"$group": {
            "_id": {"tenant_id": "$plan.tenant_id", "company_id": "$plan.company_id"},
            "currency": {"$first": "$plan.currency"},
            "plan_ids": {"$addToSet": "$plan.id"},
            "overdue_count": {"$sum": 1},
            "overdue_total": {"$sum": "$amount"},
            "earliest_due": {"$min": "$due_date"},
        }},
    ]
    async for grp in db.payment_plan_installments.aggregate(pipeline):
        tenant_id = grp["_id"]["tenant_id"]
        cid = grp["_id"]["company_id"]
        if not tenant_id or not cid:
            continue
        # Check we have not reminded today voor deze tenant
        ldoc = await db.payment_plan_reminders.find_one(
            {"tenant_id": tenant_id, "company_id": cid}, {"_id": 0}
        ) or {}
        if ldoc.get("last_sent") == today_key:
            continue
        tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0}) or {}
        if not tenant:
            continue

        cur = grp.get("currency") or "SRD"
        total = float(grp.get("overdue_total") or 0)
        n = int(grp.get("overdue_count") or 0)
        earliest = grp.get("earliest_due") or ""

        # WhatsApp / SMS via twilio
        twilio_cfg = await get_company_section(cid, "twilio")
        if twilio_cfg.get("enabled") and (tenant.get("phone") or "").strip():
            msg = (
                f"Hallo {tenant.get('name', 'huurder')},\n\n"
                f"Vriendelijke herinnering — u heeft {n} achterstallige "
                f"termijn{'en' if n > 1 else ''} in uw betalingsregeling.\n\n"
                f"Totaal achterstallig: *{cur} {total:.2f}*\n"
                f"Eerst-vervallen: {earliest}\n\n"
                f"Gelieve zo spoedig mogelijk te voldoen via onze kiosk of betaalapp.\n\n— SuriRent"
            )
            try:
                await _twilio_send(twilio_cfg, "whatsapp", tenant["phone"], msg)
            except Exception as e:  # noqa: BLE001
                print(f"[reminder] twilio installment fail: {e}")

        # Email via smtp
        smtp_cfg = await get_company_section(cid, "smtp")
        if smtp_cfg.get("enabled") and (tenant.get("email") or "").strip():
            try:
                from email_service import send_email, wrap_template
                content = f"""
                    <h1>Achterstallige termijn(en)</h1>
                    <p>Beste {tenant.get('name', 'huurder')},<br />
                    U heeft <b>{n}</b> achterstallige termijn{'en' if n > 1 else ''}
                    in uw lopende betalingsregeling.</p>
                    <p><b>Totaal achterstallig:</b> {cur} {total:.2f}<br />
                    <b>Eerst-vervallen:</b> {earliest}</p>
                    <p>Gelieve zo spoedig mogelijk te voldoen via onze kiosk of betaalapp.</p>
                """
                await send_email(smtp_cfg, tenant["email"],
                                 "Achterstallige termijn(en) — betalingsregeling",
                                 wrap_template(content))
            except Exception as e:  # noqa: BLE001
                print(f"[reminder] smtp installment fail: {e}")

        await db.payment_plan_reminders.update_one(
            {"tenant_id": tenant_id, "company_id": cid},
            {"$set": {
                "tenant_id": tenant_id,
                "company_id": cid,
                "last_sent": today_key,
                "last_sent_at": iso(now_utc()),
                "overdue_count": n,
            }},
            upsert=True,
        )


async def _installment_reminder_loop():
    """Achtergrond-loop: probeert elke 30 min, maar stuurt alleen tussen 09:00
    en 10:00 lokale tijd (UTC-3 Suriname) — max 1× per huurder per dag.
    """
    import asyncio as _aio
    while True:
        try:
            hour_local = (now_utc().hour - 3) % 24
            if 9 <= hour_local < 10:
                await _send_overdue_installment_reminders()
        except Exception as e:  # noqa: BLE001
            print(f"[reminder] installment loop fail: {e}")
        await _aio.sleep(30 * 60)


@api.post("/superadmin/run-installment-reminders")
async def manual_run_installment_reminders(user=Depends(require_role("superadmin"))):
    """Manueel triggeren — handig om de cron-flow te testen."""
    await _send_overdue_installment_reminders()
    return {"ok": True}


# Start de loop ná app-init zodat de event-loop al draait.
import asyncio as _aio_outer  # noqa: E402

@app.on_event("startup")
async def _start_installment_reminder_loop():
    if os.environ.get("DISABLE_INSTALLMENT_REMINDERS") == "1":
        return
    _aio_outer.create_task(_installment_reminder_loop())
