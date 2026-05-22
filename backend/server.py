"""SuriRent Vastgoed Kiosk - Minimal Backend
- JWT email/password auth for admin (httpOnly cookies + Bearer fallback)
- 4-digit kiosk PIN flow
- CRUD: apartments, tenants, payments
"""
from dotenv import load_dotenv
load_dotenv()

import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
import io
import secrets

from pdf_gen import (
    receipt_pdf, contract_pdf, invoice_pdf, deposit_refund_pdf, payslip_pdf,
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


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PinIn(BaseModel):
    pin: str = Field(min_length=4, max_length=4)


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
    category: Literal["huur", "servicekosten", "borg", "boete", "internet", "overig"] = "huur"
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
    amount: float
    currency: str
    method: str
    category: str
    period_month: Optional[int] = None
    period_year: Optional[int] = None
    receipt_number: str
    paid_at: str
    note: Optional[str] = ""
    received_by: Optional[str] = ""
    approved_by: Optional[str] = ""


# =====================================================================
# Lifespan & seed
# =====================================================================
DEFAULT_COMPANY_SLUG = "surirent"
DEFAULT_COMPANY_NAME = "SuriRent N.V."

# Collections that hold per-company business data
TENANT_SCOPED_COLLECTIONS = [
    "apartments", "tenants", "payments", "contracts", "invoices",
    "employees", "salaries", "deposits", "maintenance", "kasgeld",
    "ai_sessions", "push_subs", "locations",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.users.create_index("email", unique=True)
    await db.apartments.create_index("number")
    await db.tenants.create_index("name")
    await db.payments.create_index("paid_at")
    await db.payments.create_index("receipt_number", unique=True)
    await db.companies.create_index("slug", unique=True)

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

    yield
    client.close()


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
        slug = base_slug
        i = 2
        while await db.companies.find_one({"slug": slug}, {"_id": 1}):
            slug = f"{base_slug}-{i}"
            i += 1
        now = now_utc()
        trial_end = now + timedelta(days=14)
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
            plan_info = PLAN_PRICES.get(c.get("plan", "starter"), PLAN_PRICES["starter"])
            pin_row = ""
            if (body.kiosk_pin or "").isdigit() and len(body.kiosk_pin) == 4:
                pin_row = f"<tr><td>Kiosk PIN</td><td>{body.kiosk_pin}</td></tr>"
            content = f"""
                <h1>Welkom bij SuriRent!</h1>
                <p>Uw eigen Vastgoed omgeving is aangemaakt voor
                  <strong>{company_payload['name']}</strong>. U kunt direct inloggen op:</p>
                <p><a href="{app_url}/login" style="display:inline-block;background:#FF5C00;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:700;">{app_url}/login</a></p>

                <h1 style="font-size:16px;margin-top:18px;">Uw inloggegevens</h1>
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

                <p style="margin-top:14px;">Bewaar deze e-mail goed. Heeft u vragen? Antwoord gerust op deze mail.</p>
            """.replace(",", ".")
            subject = f"Welkom bij SuriRent — uw {plan_info['name']} omgeving is klaar"
            body_html = wrap_template(content, footer=f"SuriRent · {app_url}")
            # Prefer SaaS DB settings, fall back to env-based platform SMTP
            saas = await db.saas_settings.find_one({"id": SAAS_SETTINGS_ID}, {"_id": 0}) or {}
            smtp = saas.get("smtp") or {}
            if smtp.get("enabled") and smtp.get("host"):
                try:
                    await _send_smtp(smtp, to=email, subject=subject, body_html=body_html)
                except Exception:
                    await send_platform_email(to=email, subject=subject, body_html=body_html)
            else:
                await send_platform_email(to=email, subject=subject, body_html=body_html)
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
async def list_plans():
    """Public plan catalog — used by landing + registration flow."""
    return [{"id": k, **v} for k, v in PLAN_PRICES.items()]


@api.get("/billing/me")
async def billing_me(user=Depends(get_current_user)):
    """Trial / subscription status for the current admin's company."""
    cid = company_id_of(user)
    if not cid:
        return {"status": "none"}
    c = await db.companies.find_one({"id": cid}, {"_id": 0}) or {}
    plan_id = c.get("plan", "starter")
    plan = PLAN_PRICES.get(plan_id, PLAN_PRICES["starter"])
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
    return {
        "status": status,
        "plan_id": plan_id,
        "plan": plan,
        "trial_started_at": c.get("trial_started_at"),
        "trial_ends_at": trial_ends,
        "days_left": days_left,
        "monthly_amount": plan["amount"],
        "currency": plan["currency"],
    }


class ChangePlanIn(BaseModel):
    plan: Literal["starter", "professional"]


@api.put("/billing/me/plan")
async def change_plan(body: ChangePlanIn, user=Depends(get_current_user)):
    """Customer-driven plan upgrade/downgrade. Effective on next renewal."""
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf")
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    old = c.get("plan", "starter")
    new_plan = body.plan
    update = {"plan": new_plan, "plan_changed_at": iso(now_utc())}
    # During trial → just swap; the price banner already updates.
    if c.get("billing_status") in ("trial", "expired"):
        await db.companies.update_one({"id": cid}, {"$set": update})
        return {"ok": True, "plan": new_plan, "effective": "immediately"}
    # Active subscription → schedule on next renewal
    update["pending_plan"] = new_plan
    await db.companies.update_one({"id": cid}, {"$set": update})
    await db.audit_log.insert_one({
        "id": new_id(), "type": "plan_change",
        "actor": user.get("email"), "company_id": cid,
        "from_plan": old, "to_plan": new_plan, "at": iso(now_utc()),
    })
    return {
        "ok": True, "plan": new_plan, "effective": "next_renewal",
        "renews_at": c.get("subscription_renews_at"),
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
    docs = await db.companies.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    out = []
    for c in docs:
        apt_count = await db.apartments.count_documents({"company_id": c["id"]})
        tenant_count = await db.tenants.count_documents({"company_id": c["id"]})
        admin_count = await db.users.count_documents({"company_id": c["id"]})
        out.append({
            **c,
            **_billing_summary(c),
            "stats": {"apartments": apt_count, "tenants": tenant_count, "admins": admin_count},
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

    await db.companies.update_one({"id": body.company_id}, {"$set": {
        "billing_status": "active",
        "subscription_started_at": iso(now),
        "subscription_renews_at": iso(period_end),
    }})
    inv.pop("_id", None)
    pay.pop("_id", None)
    return {"ok": True, "invoice": inv, "payment": pay}


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
SAAS_SETTINGS_ID = "_saas_settings"


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
    slug = body.slug.lower().strip()
    if not slug.isidentifier() and not all(c.isalnum() or c == '-' for c in slug):
        raise HTTPException(status_code=400, detail="Slug mag alleen letters, cijfers en streepjes bevatten")
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
    payload["slug"] = payload["slug"].lower().strip()
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
    """Try the PIN against every company. Each company has unique pin."""
    throttle_key = f"kiosk:{_client_ip(request)}"
    _pin_throttle_check(throttle_key)
    pin_docs = await db.kiosk_pins.find({}, {"_id": 0}).to_list(1000)
    matched_company_id = None
    for d in pin_docs:
        if verify_password(body.pin, d.get("pin_hash", "")):
            matched_company_id = d["company_id"]
            break
    if not matched_company_id:
        _pin_throttle_fail(throttle_key)
        raise HTTPException(status_code=401, detail="Ongeldige PIN code")
    _pin_throttle_clear(throttle_key)
    c = await db.companies.find_one({"id": matched_company_id}, {"_id": 0})
    token = create_token({
        "sub": "kiosk", "type": "kiosk", "company_id": matched_company_id,
    }, KIOSK_TOKEN_MIN)
    _set_access_cookie(response, token, name="kiosk_token", minutes=KIOSK_TOKEN_MIN)
    return {"token": token, "company": c and {k: c[k] for k in ("id", "slug", "name")}}


@api.post("/auth/kiosk-set-pin")
async def set_kiosk_pin(body: SetPinIn, user=Depends(get_current_user)):
    if not body.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN moet 4 cijfers zijn")
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    # Check uniqueness against other companies
    others = await db.kiosk_pins.find({"company_id": {"$ne": cid}}, {"_id": 0, "pin_hash": 1}).to_list(1000)
    for o in others:
        if verify_password(body.pin, o.get("pin_hash", "")):
            raise HTTPException(status_code=400, detail="Deze PIN is al in gebruik door een ander bedrijf, kies een andere")
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
    return [await _enrich_payment(d) for d in docs]


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


class TenantMaintenanceIn(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: Literal["low", "medium", "high"] = "medium"


@api.post("/tenant-portal/maintenance")
async def tenant_portal_maintenance_create(body: TenantMaintenanceIn, tenant=Depends(get_tenant_session)):
    if not tenant.get("apartment_id"):
        raise HTTPException(status_code=400, detail="U bent niet gekoppeld aan een appartement")
    doc = {
        "id": new_id(),
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
    return await _enrich_maint(doc)


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


async def _enrich_payment(p: dict) -> dict:
    tenant_name = None
    apt_number = None
    if p.get("tenant_id"):
        t = await db.tenants.find_one({"id": p["tenant_id"]}, {"_id": 0, "name": 1})
        tenant_name = t["name"] if t else None
    if p.get("apartment_id"):
        a = await db.apartments.find_one({"id": p["apartment_id"]}, {"_id": 0, "number": 1})
        apt_number = a["number"] if a else None
    return {**p, "tenant_name": tenant_name, "apartment_number": apt_number}


async def _create_payment_doc(body: PaymentIn, company_id: Optional[str] = None, approved_by: Optional[str] = None) -> dict:
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
    doc = {
        "id": new_id(),
        "company_id": company_id or tenant.get("company_id"),
        "tenant_id": body.tenant_id,
        "apartment_id": apt_id,
        "amount": body.amount,
        "currency": body.currency,
        "method": body.method,
        "category": body.category,
        "period_month": body.period_month,
        "period_year": body.period_year,
        "receipt_number": receipt_no,
        "paid_at": iso(now_utc()),
        "note": body.note or "",
        "received_by": (body.received_by or "").strip(),
        "approved_by": approved_by or company_name,
    }
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/payments", response_model=List[PaymentOut])
async def list_payments(
    user=Depends(get_current_user),
    tenant_id: Optional[str] = Query(None),
    limit: int = Query(200),
):
    q = dict(scope(user))
    if tenant_id:
        q["tenant_id"] = tenant_id
    docs = await db.payments.find(q, {"_id": 0}).sort("paid_at", -1).to_list(limit)
    return [await _enrich_payment(d) for d in docs]


@api.post("/payments", response_model=PaymentOut)
async def create_payment(body: PaymentIn, user=Depends(get_current_user)):
    doc = await _create_payment_doc(body, company_id_of(user), approved_by=user.get("name") or user.get("email"))
    return await _enrich_payment(doc)


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
    }


@api.post("/kiosk/payments", response_model=PaymentOut)
async def kiosk_create_payment(body: PaymentIn, _session=Depends(get_kiosk_session)):
    doc = await _create_payment_doc(body, _session.get("company_id"))
    return await _enrich_payment(doc)


@api.get("/kiosk/tenants/{tenant_id}/payments")
async def kiosk_tenant_payments(tenant_id: str, _session=Depends(get_kiosk_session)):
    """List recent payments for a tenant (used in kiosk 'Betalingsgeschiedenis' modal)."""
    t = await db.tenants.find_one({"id": tenant_id, **kiosk_scope(_session)}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    docs = await db.payments.find(
        {"tenant_id": tenant_id, **kiosk_scope(_session)}, {"_id": 0}
    ).sort("paid_at", -1).to_list(50)
    return [await _enrich_payment(d) for d in docs]


@api.get("/kiosk/receipts/{payment_id}")
async def kiosk_receipt(payment_id: str):
    p = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Kwitantie niet gevonden")
    return await _enrich_payment(p)


# =====================================================================
# Dashboard stats
# =====================================================================
@api.get("/admin/stats")
async def admin_stats(user=Depends(get_current_user)):
    sc = scope(user)
    total_apts = await db.apartments.count_documents({**sc})
    occupied = await db.apartments.count_documents({**sc, "status": "occupied"})
    total_tenants = await db.tenants.count_documents({**sc})
    # Sum payments this month
    today = now_utc()
    start = datetime(today.year, today.month, 1, tzinfo=timezone.utc).isoformat()
    pipeline = [
        {"$match": {**sc, "paid_at": {"$gte": start}}},
        {"$group": {"_id": "$currency", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    by_currency = {}
    async for r in db.payments.aggregate(pipeline):
        by_currency[r["_id"]] = {"total": r["total"], "count": r["count"]}
    return {
        "apartments_total": total_apts,
        "apartments_occupied": occupied,
        "apartments_vacant": total_apts - occupied,
        "tenants_total": total_tenants,
        "month_payments_by_currency": by_currency,
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


class InvoiceOut(BaseModel):
    id: str
    invoice_number: str
    tenant_id: str
    tenant_name: Optional[str] = None
    apartment_id: Optional[str] = None
    apartment_number: Optional[str] = None
    amount: float
    currency: str
    period_month: int
    period_year: int
    status: str
    created_at: str


async def _enrich_invoice(i: dict) -> dict:
    t = await db.tenants.find_one({"id": i["tenant_id"]}, {"_id": 0, "name": 1})
    a = None
    if i.get("apartment_id"):
        a = await db.apartments.find_one({"id": i["apartment_id"]}, {"_id": 0, "number": 1})
    return {**i, "tenant_name": t["name"] if t else None,
            "apartment_number": a["number"] if a else None}


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


@api.post("/invoices/generate-month")
async def generate_month_invoices(body: GenerateMonthIn, user=Depends(get_current_user)):
    """Generate invoice for every occupied apartment for the period."""
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    apts = await db.apartments.find({**scope(user), "status": "occupied"}, {"_id": 0}).to_list(1000)
    created = 0
    skipped = 0
    for a in apts:
        t = await db.tenants.find_one({"id": a.get("tenant_id"), **scope(user)}, {"_id": 0}) if a.get("tenant_id") else None
        if not t:
            skipped += 1
            continue
        dup = await db.invoices.find_one({
            **scope(user),
            "tenant_id": t["id"], "period_month": body.period_month, "period_year": body.period_year
        })
        if dup:
            skipped += 1
            continue
        seq = await _next_seq(f"invoice_{body.period_year}")
        await db.invoices.insert_one({
            "id": new_id(),
            "company_id": cid,
            "invoice_number": f"F{body.period_year}-{seq:05d}",
            "tenant_id": t["id"], "apartment_id": a["id"],
            "amount": a["rent_amount"], "currency": a.get("currency", "SRD"),
            "period_month": body.period_month, "period_year": body.period_year,
            "status": "open", "created_at": iso(now_utc()),
        })
        created += 1
    return {"created": created, "skipped": skipped}


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
    pdf = invoice_pdf(inv, t, a, payments)
    return _pdf_response(pdf, f"factuur-{inv['invoice_number']}.pdf")


# =====================================================================
# Employees & Salaries
# =====================================================================
class EmployeeIn(BaseModel):
    name: str
    role: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    monthly_salary: float = 0
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    active: bool = True


class EmployeeOut(EmployeeIn):
    id: str
    created_at: str


@api.get("/employees", response_model=List[EmployeeOut])
async def list_employees(user=Depends(get_current_user)):
    docs = await db.employees.find(scope(user), {"_id": 0}).sort("name", 1).to_list(500)
    return docs


@api.post("/employees", response_model=EmployeeOut)
async def create_employee(body: EmployeeIn, user=Depends(get_current_user)):
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    doc = {"id": new_id(), "company_id": cid, **body.model_dump(), "created_at": iso(now_utc())}
    await db.employees.insert_one(doc)
    doc.pop("_id", None)
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
    return res


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
# AI Chat assistant (Emergent LLM key)
# =====================================================================
from ai_service import chat_send as ai_chat_send  # noqa: E402


class AIChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None
    include_context: bool = True


async def _collect_context(user: dict) -> dict:
    """Aggregate live data for the AI assistant (scoped to user's company)."""
    sc = scope(user)
    total_apts = await db.apartments.count_documents({**sc})
    occupied = await db.apartments.count_documents({**sc, "status": "occupied"})
    total_tenants = await db.tenants.count_documents({**sc})
    today = now_utc()
    start = datetime(today.year, today.month, 1, tzinfo=timezone.utc).isoformat()
    by_currency = {}
    async for r in db.payments.aggregate([
        {"$match": {**sc, "paid_at": {"$gte": start}}},
        {"$group": {"_id": "$currency", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]):
        by_currency[r["_id"]] = {"total": r["total"], "count": r["count"]}

    apts_list = await db.apartments.find({**sc}, {"_id": 0}).sort("number", 1).to_list(40)
    apts_enriched = [await _enrich_apartment(a) for a in apts_list]

    tenants_with_balance = []
    async for t in db.tenants.find({**sc, "apartment_id": {"$ne": None}}, {"_id": 0}).limit(40):
        bal = await _calc_balance(t)
        if bal["balance"] > 0:
            apt = await db.apartments.find_one({"id": t.get("apartment_id"), **sc}, {"_id": 0, "number": 1})
            tenants_with_balance.append({
                "name": t["name"],
                "apartment_number": apt["number"] if apt else None,
                "balance": bal["balance"],
                "currency": bal["currency"],
            })
    return {
        "stats": {
            "apartments_total": total_apts,
            "apartments_occupied": occupied,
            "apartments_vacant": total_apts - occupied,
            "tenants_total": total_tenants,
            "month_payments_by_currency": by_currency,
        },
        "apartments": apts_enriched,
        "tenants_with_balance": tenants_with_balance,
    }


@api.post("/ai/chat")
async def ai_chat(body: AIChatIn, user=Depends(get_current_user)):
    session_id = body.session_id or f"{user['id']}-default"
    # Load history from DB
    history_doc = await db.ai_sessions.find_one({"session_id": session_id}, {"_id": 0})
    history = history_doc.get("messages", []) if history_doc else []
    context = await _collect_context(user) if body.include_context else None
    reply = ""
    try:
        reply = await ai_chat_send(session_id, body.message, history, context)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service fout: {e}")
    new_history = history + [
        {"role": "user", "text": body.message, "at": iso(now_utc())},
        {"role": "assistant", "text": reply, "at": iso(now_utc())},
    ]
    await db.ai_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"user_id": user["id"], "messages": new_history[-40:], "updated_at": iso(now_utc())}},
        upsert=True,
    )
    return {"session_id": session_id, "reply": reply, "history": new_history[-40:]}


@api.get("/ai/sessions/{session_id}")
async def ai_session_history(session_id: str, user=Depends(get_current_user)):
    doc = await db.ai_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not doc:
        return {"session_id": session_id, "messages": []}
    return doc


@api.delete("/ai/sessions/{session_id}")
async def ai_session_clear(session_id: str, user=Depends(get_current_user)):
    await db.ai_sessions.delete_one({"session_id": session_id})
    return {"ok": True}


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


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: dict
    user_label: Optional[str] = ""  # admin label for filtering


@api.get("/push/vapid-public-key")
async def push_vapid_key():
    return {"public_key": VAPID_PUBLIC_KEY}


@api.post("/push/subscribe")
async def push_subscribe(body: PushSubscriptionIn, user=Depends(get_current_user)):
    doc = {
        "id": new_id(),
        "user_id": user["id"],
        "endpoint": body.endpoint,
        "keys": body.keys,
        "user_label": body.user_label or user.get("email", ""),
        "created_at": iso(now_utc()),
    }
    # Upsert by endpoint
    await db.push_subs.update_one(
        {"endpoint": body.endpoint},
        {"$set": doc},
        upsert=True,
    )
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
        ok = send_push(sub_info, body.title, body.body, {"kind": "test"})
        if ok:
            sent += 1
        else:
            failed += 1
            await db.push_subs.delete_one({"endpoint": sub["endpoint"]})
    return {"sent": sent, "failed": failed}


@api.post("/push/notify-overdue")
async def push_notify_overdue(user=Depends(get_current_user)):
    """Send admin a summary push of overdue tenants."""
    overdue = []
    async for t in db.tenants.find({**scope(user), "apartment_id": {"$ne": None}}, {"_id": 0}):
        bal = await _calc_balance(t)
        if bal["balance"] > 0:
            overdue.append((t["name"], bal["balance"], bal["currency"]))
    if not overdue:
        msg = "Geen openstaande betalingen — alles is voldaan! 🎉"
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
            {"kind": "overdue", "count": len(overdue)},
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

VALID_SETTINGS_SECTIONS = ["smtp", "twilio", "mope", "uni5pay", "shelly", "domain"]


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
        f"PDF kwitantie: {_public_url(f'/api/payments/{payment_id}/pdf')}\n\n"
        f"— SuriRent"
    )
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


# ============== Online betalingen / Payment Requests (Fase D) ==============
class PaymentRequestCreateIn(BaseModel):
    provider: Literal["mope", "uni5pay"] = "mope"
    redirect_url: Optional[str] = None


async def _gateway_or_400(user, provider: str) -> dict:
    cid = company_id_of(user)
    if not cid:
        raise HTTPException(status_code=400, detail="Geen actief bedrijf geselecteerd")
    cfg = await get_company_section(cid, provider)
    if not cfg.get("enabled"):
        raise HTTPException(
            status_code=400,
            detail=f"{provider.title()} is niet ingeschakeld — configureer eerst onder Instellingen."
        )
    return cfg


@api.post("/payment-requests/invoice/{invoice_id}")
async def create_payment_request_for_invoice(invoice_id: str, body: PaymentRequestCreateIn,
                                             user=Depends(get_current_user)):
    from payments_service import mope_create_payment_request, uni5pay_create_payment_request, GatewayError
    cfg = await _gateway_or_400(user, body.provider)
    inv = await db.invoices.find_one({"id": invoice_id, **scope(user)}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden")
    if inv.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Factuur is al betaald")
    cid = company_id_of(user)
    company = await db.companies.find_one({"id": cid}, {"_id": 0}) or {}
    redirect_url = body.redirect_url or cfg.get("callback_url") or _public_url(f"/factuur/{invoice_id}")
    order_id = f"INV-{inv['invoice_number']}"
    description = f"{company.get('name', 'SuriRent')} - Huur {inv.get('period_month')}-{inv.get('period_year')}"
    try:
        if body.provider == "mope":
            res = await mope_create_payment_request(
                cfg, description=description, amount=inv["amount"],
                currency=inv.get("currency", "SRD"),
                order_id=order_id, redirect_url=redirect_url,
            )
        else:
            res = await uni5pay_create_payment_request(cfg, description=description, amount=inv["amount"])
    except GatewayError as e:
        raise HTTPException(status_code=502, detail=str(e))

    doc = {
        "id": new_id(),
        "company_id": cid,
        "provider": body.provider,
        "provider_id": res["id"],
        "invoice_id": invoice_id,
        "tenant_id": inv["tenant_id"],
        "amount": inv["amount"],
        "currency": inv.get("currency", "SRD"),
        "description": description,
        "order_id": order_id,
        "status": "open",
        "payment_url": res["url"],
        "redirect_url": redirect_url,
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
        "paid_at": None,
    }
    await db.payment_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/payment-requests")
async def list_payment_requests(user=Depends(get_current_user)):
    docs = await db.payment_requests.find(scope(user), {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich with tenant_name + invoice_number
    for d in docs:
        if d.get("tenant_id"):
            t = await db.tenants.find_one({"id": d["tenant_id"]}, {"_id": 0, "name": 1})
            d["tenant_name"] = t.get("name") if t else None
        if d.get("invoice_id"):
            inv = await db.invoices.find_one({"id": d["invoice_id"]}, {"_id": 0, "invoice_number": 1})
            d["invoice_number"] = inv.get("invoice_number") if inv else None
    return docs


@api.post("/payment-requests/{pr_id}/refresh")
async def refresh_payment_request(pr_id: str, user=Depends(get_current_user)):
    """Pull the latest status from the gateway."""
    from payments_service import mope_get_payment_request, GatewayError
    pr = await db.payment_requests.find_one({"id": pr_id, **scope(user)}, {"_id": 0})
    if not pr:
        raise HTTPException(status_code=404, detail="Betaalverzoek niet gevonden")
    cfg = await get_company_section(company_id_of(user), pr["provider"])
    try:
        remote = await (mope_get_payment_request(cfg, pr["provider_id"]) if pr["provider"] == "mope" else _raise_uni5pay())
    except GatewayError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return await _apply_remote_status(pr, remote, user_email=user.get("email"))


async def _raise_uni5pay():
    from payments_service import GatewayError
    raise GatewayError("Uni5Pay nog niet geconfigureerd")


async def _apply_remote_status(pr: dict, remote: dict, user_email: str | None = None) -> dict:
    """Update local payment_request doc + auto-create payment + mark invoice paid."""
    new_status = remote.get("status") or pr.get("status")
    updates = {"status": new_status, "updated_at": iso(now_utc())}
    pr_updated = {**pr, **updates}

    # When transitioning to paid, create a Payment + mark invoice paid (idempotent).
    if new_status == "paid" and pr.get("status") != "paid":
        already = await db.payments.find_one({
            "company_id": pr["company_id"],
            "category": "huur",
            "tenant_id": pr["tenant_id"],
            "notes": f"Online betaling — {pr['provider']} {pr['provider_id']}",
        })
        if not already:
            year = now_utc().year
            seq = await _next_seq(f"receipt_{year}")
            inv = await db.invoices.find_one({"id": pr["invoice_id"]}, {"_id": 0}) or {}
            payment_doc = {
                "id": new_id(),
                "company_id": pr["company_id"],
                "receipt_number": f"KW{year}-{seq:05d}",
                "tenant_id": pr["tenant_id"],
                "apartment_id": inv.get("apartment_id"),
                "amount": pr["amount"],
                "currency": pr.get("currency", "SRD"),
                "method": pr["provider"],  # mope / uni5pay
                "category": "huur",
                "period_month": inv.get("period_month"),
                "period_year": inv.get("period_year"),
                "paid_at": iso(now_utc()),
                "notes": f"Online betaling — {pr['provider']} {pr['provider_id']}",
                "created_at": iso(now_utc()),
                "created_by": user_email or "webhook",
            }
            await db.payments.insert_one(payment_doc)
        await db.invoices.update_one({"id": pr["invoice_id"], "company_id": pr["company_id"]},
                                     {"$set": {"status": "paid", "paid_at": iso(now_utc())}})
        updates["paid_at"] = iso(now_utc())
        pr_updated["paid_at"] = updates["paid_at"]

    await db.payment_requests.update_one({"id": pr["id"]}, {"$set": updates})
    return pr_updated


# ============== Public webhook (no auth dep — Mope sends Bearer) ==============
@api.post("/webhooks/mope")
async def mope_webhook(request: Request):
    """Mope sends {id} with Authorization: Bearer <our token>.
    We look up the payment_request, verify token matches that company's mope.api_key,
    then refresh status from Mope.
    """
    from payments_service import mope_get_payment_request, GatewayError
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    pr_provider_id = (body or {}).get("id")
    if not pr_provider_id:
        raise HTTPException(status_code=400, detail="Missing id in webhook body")
    pr = await db.payment_requests.find_one({"provider_id": pr_provider_id, "provider": "mope"}, {"_id": 0})
    if not pr:
        # Unknown id — return 204 so Mope doesn't retry forever, but log.
        return {"ok": True, "ignored": True}
    cfg = await get_company_section(pr["company_id"], "mope")
    expected_token = (cfg.get("api_key") or "").strip()
    auth_header = request.headers.get("authorization", "")
    sent_token = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else ""
    if expected_token and sent_token and sent_token != expected_token:
        raise HTTPException(status_code=401, detail="Invalid webhook token")
    try:
        remote = await mope_get_payment_request(cfg, pr_provider_id)
    except GatewayError:
        # Don't fail webhook — return 204 to avoid Mope retries; status update will happen on next manual refresh.
        return {"ok": True, "queued": True}
    await _apply_remote_status(pr, remote, user_email="webhook")
    return {"ok": True, "status": remote.get("status")}


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


app.include_router(api)

