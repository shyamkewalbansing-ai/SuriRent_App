# PRD — Vastgoed Multi-Company SaaS

## Origineel probleem
Extract ONLY de Vastgoed + Kiosk-functionaliteit uit een legacy ERP en bouw hem opnieuw als een moderne Multi-Company SaaS met dual-domain, multi-tenant isolatie, SaaS-billing, PWA en hardware-integraties (Shelly).

## Personas
- **Superadmin (SaaS-eigenaar)** — beheert bedrijven, abonnementen, facturen, kasgeld.
- **Admin (Bedrijf)** — beheert appartementen, huurders, contracten, kasgeld.
- **Huurder** — betaalt via Kiosk, ziet portal.

## Kern-vereisten
- Multi-tenant data isolatie per `company_id`.
- Superadmin panel (SaaS) + Admin panel (Vastgoed) + Kiosk PWA.
- Custom domains met live DNS/SSL status.
- Dynamische Contract PDF (num2words NL, ID/DOB auto-fill).
- OCR-goedkeuring van SaaS-betalingen (Gemini 2.5).
- Automatische SaaS facturen, betaal-herinneringen, PDF factuur + e-mail.
- Superadmin Kasregister-kiosk met bedrijfs-detail drawer.
- Handmatige kasmutaties (correcties/refunds) door superadmin.

## Wat is af (recente sessies)
- **2026-02-15**: SaaS Facturen krijgt PDF + Mail knop per rij. Endpoint `GET /api/superadmin/subscription-invoices/{id}/pdf` (StreamingResponse) + `POST /.../email` (met PDF-attachment via `_saas_email(attachments=)`). Nieuwe `saas_invoice_pdf()` in `pdf_gen.py`.
- **2026-02-15**: Kasregister krijgt detail-drawer — klik op bedrijfskaart opent slide-in met alle facturen (T1/T2/T3 badges) + betaalhistorie + regelingen + PDF/Mail per factuur. Endpoint `GET /api/superadmin/kasregister/{company_id}`.
- **2026-02-15**: Betaling Prefill — Kasregister "Betaling" knop navigeert naar `/admin/saas_payments?prefill_company=xxx`, Subscriptions.jsx auto-opent modal met bedrijf voorgevuld.
- **2026-02-15**: Betaal-herinneringen — `check_invoice_reminders()` draait dagelijks, mailt bedrijven met facturen >=3 dagen vervallen (met PDF-bijlage). Idempotent via `sent_invoice_reminders` collectie. Zet factuur ook op `overdue`. Handmatige trigger `POST /api/superadmin/invoice-reminders/run`.
- **2026-02-15**: Superadmin Kiosk repurposed → SaaS Kasregister (dark kiosk-stijl).
- **2026-02-15**: SaaS Facturen auto-maandgeneratie + handmatige "Nieuwe factuur" knop.
- **2026-02-15**: SaaS Betalingsregelingen volledig herbouwd.
- **2026-02-15**: Handmatige SaaS Kasgeld mutaties.
- **2026-02-15**: Trial-verloop e-mailwaarschuwing 3 dagen voor einde.
- **2026-02-15**: Superadmin routes eerste batch verplaatst naar routes/superadmin.py.
- **2026-02-15**: SaaS Overzicht 1:1 gespiegeld aan Admin Overview.
- 2026-02: Custom domain resolver + DNS/SSL widget.
- 2026-02: Contract PDF generator herbouwd.
- 2026-02: UI redesign Kasgeld/Huurders/Contracten.
- 2026-02: Superadmin sidebar gespiegeld.

## Backlog (P0 → P2)
- **P1** Server.py refactor batch 2: OCR-approve/reject + companies-CRUD naar routes/superadmin.py.
- **P1** JWT-migratie van `localStorage` naar `httpOnly` cookies.
- **P2** React Hook exhaustive-deps warnings fixen.
- **P2** Superadmin Settings card-based redesign.
- **P2** Shelly Smart Breakers integratie.
- **P2** Herhaal-herinneringen (3d, 7d, 14d vervallen).
- **P2** Superadmin dashboard-tegel voor "verstuurde herinneringen" historie.

## Tech stack
React · FastAPI · Motor (async MongoDB) · SSE · ReportLab · num2words · Web NFC · Gemini 2.5 Flash · Emergent LLM key · SMTP.

## Key files
- `/app/frontend/src/pages/vastgoed/AdminDashboard.jsx` — Admin + SaaS sidebar + routing
- `/app/frontend/src/pages/vastgoed/admin/SaasOverview.jsx` — Superadmin Overzicht
- `/app/frontend/src/pages/vastgoed/admin/SaasKasregister.jsx` — SaaS Kasregister + Detail drawer
- `/app/frontend/src/pages/vastgoed/admin/Subscriptions.jsx` — SaaS Facturen/Betalingen/Kasgeld/Regelingen + alle modals + PDF/Mail helpers + prefill
- `/app/backend/routes/superadmin.py` — Alle SaaS-eigenaar routes + PDF endpoints + reminder loop
- `/app/backend/routes/saas_ops.py` — Kas-mutaties + Trial-warnings
- `/app/backend/routes/_deps.py` — Shared deps
- `/app/backend/pdf_gen.py` — Contract + SaaS invoice PDF
- `/app/backend/server.py` — Core FastAPI

## API endpoints (nieuw deze sessie)
- `GET /api/superadmin/kasregister` — bedrijven-lijst met betaalstatus
- `GET /api/superadmin/kasregister/{company_id}` — detail (invoices + payments + plans)
- `POST /api/superadmin/subscription-invoices` — handmatige factuur maken
- `GET /api/superadmin/subscription-invoices/{id}/pdf` — download PDF
- `POST /api/superadmin/subscription-invoices/{id}/email` — mail PDF naar owner
- `POST /api/superadmin/invoice-reminders/run` — trigger herinneringen
- `POST /api/superadmin/saas-payment-plans` — regeling met N termijnen
- `GET /api/superadmin/saas-payment-plans` — plans + termijn-progress
- `POST /api/superadmin/saas-auto-invoice/run` — trigger auto-generatie
- `POST /api/superadmin/kas-mutations` — handmatige +/- boeking
- `POST /api/superadmin/trial-warnings/run` — trial-warning cyclus

## MongoDB collecties (nieuw deze sessie)
- `sent_trial_warnings` — dedup marker trial-mails
- `sent_invoice_reminders` — dedup marker factuur-reminders
- `saas_payment_plans` — SaaS-betalingsregelingen
- `subscription_invoices.saas_plan_id / kind:'installment'` — termijn-facturen
- `subscription_invoices.email_log` — historie verstuurde facturen
- `subscription_invoices.manual: true / auto_generated: true` — herkomst-marker

## Test credentials
Zie `/app/memory/test_credentials.md`.
