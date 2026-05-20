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
    return user


async def get_kiosk_session(request: Request) -> dict:
    token = extract_token(request, "kiosk_token")
    if not token:
        raise HTTPException(status_code=401, detail="Kiosk niet ontgrendeld")
    try:
        payload = decode_token(token)
        if payload.get("type") != "kiosk":
            raise HTTPException(status_code=401, detail="Ongeldig kiosk token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Kiosk sessie verlopen")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Ongeldig kiosk token")
    return payload


# =====================================================================
# Models
# =====================================================================
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)


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


class ApartmentOut(ApartmentIn):
    id: str
    status: Literal["vacant", "occupied"]
    tenant_id: Optional[str] = None
    tenant_name: Optional[str] = None
    created_at: str


class TenantIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    apartment_id: Optional[str] = None


class TenantOut(TenantIn):
    id: str
    apartment_number: Optional[str] = None
    rent_amount: Optional[float] = None
    currency: Optional[str] = None
    created_at: str


class PaymentIn(BaseModel):
    tenant_id: str
    apartment_id: Optional[str] = None
    amount: float
    currency: Literal["SRD", "USD", "EUR"] = "SRD"
    method: Literal["contant", "bank", "mope", "sumup"] = "contant"
    category: Literal["huur", "servicekosten", "borg", "boete", "overig"] = "huur"
    period_month: Optional[int] = None
    period_year: Optional[int] = None
    note: Optional[str] = ""


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


# =====================================================================
# Lifespan & seed
# =====================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.users.create_index("email", unique=True)
    await db.apartments.create_index("number")
    await db.tenants.create_index("name")
    await db.payments.create_index("paid_at")
    await db.payments.create_index("receipt_number", unique=True)

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@vastgoed.sr")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "name": "Admin",
            "role": "admin",
            "password_hash": hash_password(admin_password),
            "created_at": iso(now_utc()),
        })
    else:
        if not verify_password(admin_password, existing.get("password_hash", "")):
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"password_hash": hash_password(admin_password)}},
            )

    # Seed kiosk PIN
    s = await db.settings.find_one({"_id": "kiosk"})
    if s is None:
        default_pin = os.environ.get("DEFAULT_KIOSK_PIN", "1234")
        await db.settings.insert_one({
            "_id": "kiosk",
            "pin_hash": hash_password(default_pin),
            "updated_at": iso(now_utc()),
        })

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


@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="E-mailadres is al in gebruik")
    user_doc = {
        "id": new_id(),
        "email": email,
        "name": body.name.strip(),
        "role": "admin",
        "password_hash": hash_password(body.password),
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(user_doc)
    token = create_token({"sub": user_doc["id"], "email": email, "type": "access"}, ACCESS_MIN)
    _set_access_cookie(response, token)
    return {
        "token": token,
        "user": {k: user_doc[k] for k in ("id", "email", "name", "role", "created_at")},
    }


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Onjuiste inloggegevens")
    token = create_token({"sub": user["id"], "email": email, "type": "access"}, ACCESS_MIN)
    _set_access_cookie(response, token)
    return {
        "token": token,
        "user": {k: user[k] for k in ("id", "email", "name", "role", "created_at")},
    }


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("kiosk_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


# Kiosk PIN
@api.post("/auth/kiosk-pin")
async def kiosk_pin(body: PinIn, response: Response):
    s = await db.settings.find_one({"_id": "kiosk"})
    if not s or not verify_password(body.pin, s.get("pin_hash", "")):
        raise HTTPException(status_code=401, detail="Ongeldige PIN code")
    token = create_token({"sub": "kiosk", "type": "kiosk"}, KIOSK_TOKEN_MIN)
    _set_access_cookie(response, token, name="kiosk_token", minutes=KIOSK_TOKEN_MIN)
    return {"token": token}


@api.post("/auth/kiosk-set-pin")
async def set_kiosk_pin(body: SetPinIn, user=Depends(get_current_user)):
    if not body.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN moet 4 cijfers zijn")
    await db.settings.update_one(
        {"_id": "kiosk"},
        {"$set": {"pin_hash": hash_password(body.pin), "updated_at": iso(now_utc())}},
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
async def tenant_portal_login(body: TenantLoginIn, response: Response):
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
        raise HTTPException(status_code=401, detail="Onjuiste gegevens of PIN niet ingesteld")
    if not verify_password(body.pin, tenant.get("pin_hash", "")):
        raise HTTPException(status_code=401, detail="Onjuiste PIN")
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
    t = await db.tenants.find_one({"id": body.tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    await db.tenants.update_one(
        {"id": body.tenant_id},
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
    docs = await db.apartments.find({}, {"_id": 0}).sort("number", 1).to_list(1000)
    return [await _enrich_apartment(d) for d in docs]


@api.post("/apartments", response_model=ApartmentOut)
async def create_apartment(body: ApartmentIn, user=Depends(get_current_user)):
    doc = {
        "id": new_id(),
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
        {"id": apt_id}, {"$set": body.model_dump()},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    return await _enrich_apartment(res)


@api.delete("/apartments/{apt_id}")
async def delete_apartment(apt_id: str, user=Depends(get_current_user)):
    # Unassign tenant
    apt = await db.apartments.find_one({"id": apt_id}, {"_id": 0})
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
    apt = await db.apartments.find_one({"id": apt_id}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    # Free previous tenant of this apartment
    if apt.get("tenant_id"):
        await db.tenants.update_one({"id": apt["tenant_id"]}, {"$set": {"apartment_id": None}})
    # Free previous apartment of this tenant
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
    apt = await db.apartments.find_one({"id": apt_id}, {"_id": 0})
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
    docs = await db.tenants.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return [await _enrich_tenant(d) for d in docs]


@api.post("/tenants", response_model=TenantOut)
async def create_tenant(body: TenantIn, user=Depends(get_current_user)):
    doc = {"id": new_id(), **body.model_dump(), "created_at": iso(now_utc())}
    await db.tenants.insert_one(doc)
    doc.pop("_id", None)
    if doc.get("apartment_id"):
        await db.apartments.update_one(
            {"id": doc["apartment_id"]},
            {"$set": {"tenant_id": doc["id"], "status": "occupied"}},
        )
    return await _enrich_tenant(doc)


@api.put("/tenants/{tenant_id}", response_model=TenantOut)
async def update_tenant(tenant_id: str, body: TenantIn, user=Depends(get_current_user)):
    from pymongo import ReturnDocument
    res = await db.tenants.find_one_and_update(
        {"id": tenant_id}, {"$set": body.model_dump()},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    return await _enrich_tenant(res)


@api.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, user=Depends(get_current_user)):
    t = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
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


async def _create_payment_doc(body: PaymentIn) -> dict:
    tenant = await db.tenants.find_one({"id": body.tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    apt_id = body.apartment_id or tenant.get("apartment_id")
    receipt_no = await _next_receipt_number()
    doc = {
        "id": new_id(),
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
    q = {}
    if tenant_id:
        q["tenant_id"] = tenant_id
    docs = await db.payments.find(q, {"_id": 0}).sort("paid_at", -1).to_list(limit)
    return [await _enrich_payment(d) for d in docs]


@api.post("/payments", response_model=PaymentOut)
async def create_payment(body: PaymentIn, user=Depends(get_current_user)):
    doc = await _create_payment_doc(body)
    return await _enrich_payment(doc)


@api.get("/tenants/{tenant_id}/balance")
async def tenant_balance(tenant_id: str, user=Depends(get_current_user)):
    t = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
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
# Kiosk public endpoints (no auth, but expects kiosk session for payments)
# =====================================================================
@api.get("/kiosk/apartments")
async def kiosk_list_apartments():
    """Public: list of apartments with current tenant for selection."""
    docs = await db.apartments.find({}, {"_id": 0}).sort("number", 1).to_list(1000)
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
        })
    return out


@api.get("/kiosk/tenants/{tenant_id}/overview")
async def kiosk_tenant_overview(tenant_id: str):
    t = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
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
    doc = await _create_payment_doc(body)
    return await _enrich_payment(doc)


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
    total_apts = await db.apartments.count_documents({})
    occupied = await db.apartments.count_documents({"status": "occupied"})
    total_tenants = await db.tenants.count_documents({})
    # Sum payments this month
    today = now_utc()
    start = datetime(today.year, today.month, 1, tzinfo=timezone.utc).isoformat()
    pipeline = [
        {"$match": {"paid_at": {"$gte": start}}},
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
    q = {}
    if tenant_id:
        q["tenant_id"] = tenant_id
    docs = await db.contracts.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _enrich_contract(d) for d in docs]


@api.post("/contracts", response_model=ContractOut)
async def create_contract(body: ContractIn, user=Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": body.tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    apt = await db.apartments.find_one({"id": body.apartment_id}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    year = now_utc().year
    seq = await _next_seq(f"contract_{year}")
    doc = {
        "id": new_id(),
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
    res = await db.contracts.delete_one({"id": contract_id})
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
    docs = await db.invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _enrich_invoice(d) for d in docs]


@api.post("/invoices", response_model=InvoiceOut)
async def create_invoice(body: InvoiceCreate, user=Depends(get_current_user)):
    t = await db.tenants.find_one({"id": body.tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    apt_id = t.get("apartment_id")
    apt = await db.apartments.find_one({"id": apt_id}, {"_id": 0}) if apt_id else None
    if not apt:
        raise HTTPException(status_code=400, detail="Huurder heeft geen appartement")
    # Prevent duplicate invoice for same tenant + period
    dup = await db.invoices.find_one({
        "tenant_id": body.tenant_id, "period_month": body.period_month,
        "period_year": body.period_year,
    })
    if dup:
        raise HTTPException(status_code=400, detail="Factuur voor deze periode bestaat al")
    year = body.period_year
    seq = await _next_seq(f"invoice_{year}")
    doc = {
        "id": new_id(),
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
    apts = await db.apartments.find({"status": "occupied"}, {"_id": 0}).to_list(1000)
    created = 0
    skipped = 0
    for a in apts:
        t = await db.tenants.find_one({"id": a.get("tenant_id")}, {"_id": 0}) if a.get("tenant_id") else None
        if not t:
            skipped += 1
            continue
        dup = await db.invoices.find_one({
            "tenant_id": t["id"], "period_month": body.period_month, "period_year": body.period_year
        })
        if dup:
            skipped += 1
            continue
        seq = await _next_seq(f"invoice_{body.period_year}")
        await db.invoices.insert_one({
            "id": new_id(),
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
    res = await db.invoices.delete_one({"id": invoice_id})
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
    docs = await db.employees.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return docs


@api.post("/employees", response_model=EmployeeOut)
async def create_employee(body: EmployeeIn, user=Depends(get_current_user)):
    doc = {"id": new_id(), **body.model_dump(), "created_at": iso(now_utc())}
    await db.employees.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/employees/{eid}", response_model=EmployeeOut)
async def update_employee(eid: str, body: EmployeeIn, user=Depends(get_current_user)):
    from pymongo import ReturnDocument
    res = await db.employees.find_one_and_update(
        {"id": eid}, {"$set": body.model_dump()},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Werknemer niet gevonden")
    return res


@api.delete("/employees/{eid}")
async def delete_employee(eid: str, user=Depends(get_current_user)):
    await db.employees.delete_one({"id": eid})
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
    q = {}
    if employee_id:
        q["employee_id"] = employee_id
    docs = await db.salaries.find(q, {"_id": 0}).sort("paid_at", -1).to_list(500)
    return [await _enrich_salary(d) for d in docs]


@api.post("/salaries", response_model=SalaryOut)
async def create_salary(body: SalaryIn, user=Depends(get_current_user)):
    e = await db.employees.find_one({"id": body.employee_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Werknemer niet gevonden")
    net = body.gross - body.advance - body.deductions
    doc = {
        "id": new_id(),
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
    await db.salaries.delete_one({"id": sid})
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
    docs = await db.deposits.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _enrich_deposit(d) for d in docs]


@api.post("/deposits", response_model=DepositOut)
async def create_deposit(body: DepositIn, user=Depends(get_current_user)):
    t = await db.tenants.find_one({"id": body.tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Huurder niet gevonden")
    doc = {
        "id": new_id(),
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
    d = await db.deposits.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Borg niet gevonden")
    if d["status"] != "held":
        raise HTTPException(status_code=400, detail="Borg is al gerestitueerd")
    refund_amount = max(d["amount"] - body.deduction, 0)
    from pymongo import ReturnDocument
    updated = await db.deposits.find_one_and_update(
        {"id": did},
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
    await db.deposits.delete_one({"id": did})
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
    q = {}
    if apartment_id:
        q["apartment_id"] = apartment_id
    docs = await db.maintenance.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _enrich_maint(d) for d in docs]


@api.post("/maintenance", response_model=MaintenanceOut)
async def create_maintenance(body: MaintenanceIn, user=Depends(get_current_user)):
    a = await db.apartments.find_one({"id": body.apartment_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Appartement niet gevonden")
    doc = {"id": new_id(), **body.model_dump(),
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
    res = await db.maintenance.find_one_and_update(
        {"id": mid}, {"$set": update},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Ticket niet gevonden")
    return await _enrich_maint(res)


@api.delete("/maintenance/{mid}")
async def delete_maintenance(mid: str, user=Depends(get_current_user)):
    await db.maintenance.delete_one({"id": mid})
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
    docs = await db.kasgeld.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api.post("/kasgeld", response_model=CashEntryOut)
async def create_cash(body: CashEntryIn, user=Depends(get_current_user)):
    doc = {"id": new_id(), **body.model_dump(), "created_at": iso(now_utc())}
    await db.kasgeld.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/kasgeld/{cid}")
async def delete_cash(cid: str, user=Depends(get_current_user)):
    await db.kasgeld.delete_one({"id": cid})
    return {"ok": True}


@api.get("/kasgeld/balance")
async def cash_balance(user=Depends(get_current_user)):
    """Compute per-currency cash balance."""
    pipeline = [
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


async def _collect_context() -> dict:
    """Aggregate live data for the AI assistant."""
    total_apts = await db.apartments.count_documents({})
    occupied = await db.apartments.count_documents({"status": "occupied"})
    total_tenants = await db.tenants.count_documents({})
    today = now_utc()
    start = datetime(today.year, today.month, 1, tzinfo=timezone.utc).isoformat()
    by_currency = {}
    async for r in db.payments.aggregate([
        {"$match": {"paid_at": {"$gte": start}}},
        {"$group": {"_id": "$currency", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]):
        by_currency[r["_id"]] = {"total": r["total"], "count": r["count"]}

    apts_list = await db.apartments.find({}, {"_id": 0}).sort("number", 1).to_list(40)
    apts_enriched = [await _enrich_apartment(a) for a in apts_list]

    tenants_with_balance = []
    async for t in db.tenants.find({"apartment_id": {"$ne": None}}, {"_id": 0}).limit(40):
        bal = await _calc_balance(t)
        if bal["balance"] > 0:
            apt = await db.apartments.find_one({"id": t.get("apartment_id")}, {"_id": 0, "number": 1})
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
    context = await _collect_context() if body.include_context else None
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
    async for t in db.tenants.find({"apartment_id": {"$ne": None}}, {"_id": 0}):
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


app.include_router(api)

