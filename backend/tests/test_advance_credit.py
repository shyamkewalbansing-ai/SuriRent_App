"""Test: vooruitbetaling wordt automatisch verrekend met nieuwe factuur."""
import os
import asyncio
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Cleanup
    tag = "test_advance_" + datetime.now(timezone.utc).strftime("%H%M%S")
    await db.tenants.delete_many({"name": tag})
    await db.invoices.delete_many({"tenant_id": tag})
    await db.payments.delete_many({"tenant_id": tag})
    await db.apartments.delete_many({"id": tag + "-apt"})

    # Setup
    await db.tenants.insert_one({"id": tag, "name": tag, "company_id": "test-co", "apartment_id": tag + "-apt"})
    await db.apartments.insert_one({"id": tag + "-apt", "company_id": "test-co",
        "number": "T1", "rent_amount": 10000.0, "currency": "SRD",
        "status": "occupied", "tenant_id": tag})

    # Vooruitbetaling van 8000 (geen openstaande facturen)
    await db.payments.insert_one({
        "id": "pay-1", "tenant_id": tag, "company_id": "test-co",
        "amount": 8000.0, "currency": "SRD", "category": "vooruitbetaling",
        "status": "approved", "credit_remaining": 8000.0,
        "credit_applied_at": None,
        "paid_at": "2026-03-01T00:00:00+00:00",
        "method": "contant", "receipt_number": "TEST-001",
    })

    # Importeer en draai generate_month_invoices_for_company
    import sys
    sys.path.insert(0, "/app/backend")
    import server as srv
    srv.db = db

    res = await srv._generate_month_invoices_for_company("test-co", 4, 2026)
    print(f"Generate result: {res}")

    inv = await db.invoices.find_one({"tenant_id": tag, "period_month": 4}, {"_id": 0})
    pay = await db.payments.find_one({"id": "pay-1"}, {"_id": 0})

    print(f"April invoice: amount={inv['amount']}, paid_amount={inv.get('paid_amount')}, status={inv['status']}")
    print(f"Credit payment remaining: {pay.get('credit_remaining')}")

    assert inv["amount"] == 10000.0
    assert inv.get("paid_amount") == 8000.0, f"Expected 8000 toegepast, got {inv.get('paid_amount')}"
    assert pay["credit_remaining"] == 0.0, f"Expected credit 0 remaining, got {pay['credit_remaining']}"
    assert res["credit_applied"] == 8000.0

    # Cleanup
    await db.tenants.delete_one({"id": tag})
    await db.invoices.delete_many({"tenant_id": tag})
    await db.payments.delete_many({"tenant_id": tag})
    await db.apartments.delete_many({"id": tag + "-apt"})
    client.close()

    print("PASS: vooruitbetaling correct verrekend met nieuwe april factuur")


asyncio.run(main())
