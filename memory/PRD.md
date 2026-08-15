# PRD — Vastgoed Multi-Company SaaS

## Origineel probleem
Extract ONLY de Vastgoed + Kiosk-functionaliteit uit een legacy ERP en bouw hem opnieuw als een moderne Multi-Company SaaS met dual-domain, multi-tenant isolatie, SaaS-billing, PWA en hardware-integraties (Shelly).

## Personas
- **Superadmin (SaaS-eigenaar)** — beheert bedrijven, abonnementen, facturen, OCR-keuringen.
- **Admin (Bedrijf)** — beheert appartementen, huurders, contracten, kasgeld.
- **Huurder** — betaalt via Kiosk, ziet portal.

## Kern-vereisten
- Multi-tenant data isolatie per `company_id`.
- Superadmin panel (SaaS) + Admin panel (Vastgoed) + Kiosk PWA.
- Custom domains met live DNS/SSL status.
- Dynamische Contract PDF (num2words NL, ID/DOB auto-fill).
- OCR-goedkeuring van SaaS-betalingen (Gemini 2.5).

## Wat is af (recente sessies)
- **2026-02-15**: SaaS Overzicht 1:1 gespiegeld aan Admin Overview (luxe hero + 4 KPI + Snelle acties). Backend `/superadmin/overview` uitgebreid met `total_received_by_currency`, `current_month_open_by_currency`, `overdue_invoices`.
- 2026-02: Custom domain resolver + DNS/SSL widget.
- 2026-02: Contract PDF generator herbouwd, ID/DOB auto-fill, num2words NL, live preview.
- 2026-02: Kasgeld, Huurders, Contracten UI redesign naar "Betalingsregelingen" card-stijl.
- 2026-02: Superadmin sidebar + routing 1:1 gespiegeld aan Admin.
- 2026-02: Password strength meter bij registratie.
- 2026-02: Auto-create concept contract bij nieuwe huurder.

## Backlog (P0 → P2)
- **P1** `server.py` (>13k regels) modularisatie naar `/app/backend/routes/`.
- **P1** JWT-migratie van `localStorage` naar `httpOnly` cookies.
- **P2** React Hook exhaustive-deps warnings fixen (KioskLayout, EmailLogin).
- **P2** Handmatige mutatie SaaS Kasgeld (superadmin correcties/refunds).
- **P2** E-mail waarschuwing 3 dagen voor trial-verloop.
- **P2** Superadmin Settings card-based redesign.
- **P2** Shelly Smart Breakers integratie.

## Tech stack
React · FastAPI · Motor (async MongoDB) · SSE · ReportLab · num2words · Web NFC · Gemini 2.5 Flash (OCR) · Emergent LLM key.

## Key files
- `/app/frontend/src/pages/vastgoed/AdminDashboard.jsx` — Admin + SaaS sidebar + Overview
- `/app/frontend/src/pages/vastgoed/admin/SaasOverview.jsx` — Superadmin Overzicht
- `/app/backend/server.py` — Core FastAPI (>13k regels, refactor pending)
- `/app/backend/pdf_gen.py` — Contract PDF

## Test credentials
Zie `/app/memory/test_credentials.md`.
