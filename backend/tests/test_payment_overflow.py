"""Test: betaling met overflow → tweede factuur krijgt overschot.

Scenario uit gebruikersrapport:
- Huurder met 2 openstaande facturen van SRD 10.000 (mrt + apr).
- Huurder betaalt SRD 15.000.
- Verwacht: factuur mrt → paid (10.000), factuur apr → paid_amount=5.000, open=5.000.
- Bug voorheen: factuur mrt → paid met paid_amount=15.000, factuur apr → ongewijzigd 0/10.000.
"""
import os
import asyncio
from datetime import datetime, timezone

import pytest
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.mark.asyncio
async def test_payment_overflow_allocates_to_next_invoice():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Cleanup vorige test-runs
    test_tag = "test_overflow_" + datetime.now(timezone.utc).strftime("%H%M%S")
    await db.tenants.delete_many({"name": test_tag})
    await db.invoices.delete_many({"tenant_id": test_tag})
    await db.payments.delete_many({"tenant_id": test_tag})

    # Setup: tenant + 2 facturen van 10.000 SRD (mrt + apr 2026)
    await db.tenants.insert_one({
        "id": test_tag, "name": test_tag, "company_id": "test-co",
    })
    await db.invoices.insert_many([
        {"id": f"{test_tag}-inv-mar", "tenant_id": test_tag, "company_id": "test-co",
         "amount": 10000.0, "paid_amount": 0.0, "currency": "SRD",
         "period_month": 3, "period_year": 2026, "status": "open",
         "created_at": "2026-03-01T00:00:00+00:00"},
        {"id": f"{test_tag}-inv-apr", "tenant_id": test_tag, "company_id": "test-co",
         "amount": 10000.0, "paid_amount": 0.0, "currency": "SRD",
         "period_month": 4, "period_year": 2026, "status": "open",
         "created_at": "2026-04-01T00:00:00+00:00"},
    ])

    # Simuleer betaling van 15.000 — gebruik de helpers uit server.py direct
    import sys
    sys.path.insert(0, "/app/backend")
    # Override DB voor deze test
    import server as srv
    srv.db = db

    # Roep _apply_payment_to_invoice + overflow logic na zoals in _create_payment_doc
    matched = await db.invoices.find_one({"id": f"{test_tag}-inv-mar"}, {"_id": 0})
    pay_amt = 15000.0
    inv_amt = float(matched["amount"])
    already = float(matched.get("paid_amount") or 0)
    open_on = max(0.0, round(inv_amt - already, 2))
    primary = min(pay_amt, open_on)
    overflow = round(pay_amt - primary, 2)

    await srv._apply_payment_to_invoice(
        matched["id"], primary, payment_id="test-pay-1",
        paid_at="2026-05-01T00:00:00+00:00", method="cash",
    )
    if overflow > 0:
        other_ids = []
        async for inv in db.invoices.find(
            {"tenant_id": test_tag, "currency": "SRD",
             "status": {"$nin": ["paid", "cancelled"]},
             "id": {"$ne": matched["id"]}, "company_id": "test-co"},
            {"_id": 0, "id": 1},
        ).sort([("period_year", 1), ("period_month", 1)]):
            other_ids.append(inv["id"])
        await srv._allocate_payment_to_invoices(
            other_ids, overflow, payment_id="test-pay-1",
            paid_at="2026-05-01T00:00:00+00:00", method="cash",
        )

    # Verifieer resultaat
    mar = await db.invoices.find_one({"id": f"{test_tag}-inv-mar"}, {"_id": 0})
    apr = await db.invoices.find_one({"id": f"{test_tag}-inv-apr"}, {"_id": 0})

    assert mar["paid_amount"] == 10000.0, f"Mrt paid_amount expected 10000, got {mar['paid_amount']}"
    assert mar["status"] == "paid", f"Mrt status expected 'paid', got {mar['status']}"
    assert apr["paid_amount"] == 5000.0, f"Apr paid_amount expected 5000, got {apr['paid_amount']}"
    assert apr["status"] != "paid", f"Apr should still be open, got {apr['status']}"

    # Cleanup
    await db.tenants.delete_one({"id": test_tag})
    await db.invoices.delete_many({"tenant_id": test_tag})
    await db.payments.delete_many({"tenant_id": test_tag})
    client.close()

    print(f"PASS: Mrt paid={mar['paid_amount']}, Apr paid={apr['paid_amount']}, Apr remaining=5000")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    asyncio.run(test_payment_overflow_allocates_to_next_invoice())
