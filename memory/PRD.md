# PRD — Vastgoed Multi-Company SaaS

## Origineel probleem
Extract ONLY de Vastgoed + Kiosk-functionaliteit uit een legacy ERP en bouw hem opnieuw als een moderne Multi-Company SaaS met dual-domain, multi-tenant isolatie, SaaS-billing, PWA en hardware-integraties (Shelly).

## Personas
- **Superadmin (SaaS-eigenaar)** — beheert bedrijven, abonnementen, facturen, kasgeld, OCR-keuringen.
- **Admin (Bedrijf)** — beheert appartementen, huurders, contracten, kasgeld.
- **Huurder** — betaalt via Kiosk, ziet portal.

## Kern-vereisten
- Multi-tenant data isolatie per `company_id`.
- Superadmin panel (SaaS) + Admin panel (Vastgoed) + Kiosk PWA.
- Custom domains met live DNS/SSL status.
- Dynamische Contract PDF (num2words NL, ID/DOB auto-fill).
- OCR-goedkeuring van SaaS-betalingen (Gemini 2.5).
- Handmatige kasmutaties (correcties/refunds) door superadmin.
- Automatische e-mail waarschuwing 3 dagen voor einde proefperiode.
- Automatische maandelijkse SaaS-facturen + handmatige factuur aanmaken.
- Superadmin Kasregister-kiosk met betaalstatus per bedrijf.

## Wat is af (recente sessies)
- **2026-02-15**: Superadmin Kiosk repurposed → SaaS Kasregister. Nieuwe `SaasKasregister.jsx` page (dark kiosk-stijl) toont per bedrijf status/openstaand/aantal open+vervallen+betaald + snelle acties. Endpoint `GET /api/superadmin/kasregister`.
- **2026-02-15**: SaaS Facturen krijgt automatische maandgeneratie via `saas_auto_invoice_tick()` (daily-billing loop) + handmatige "Nieuwe factuur" knop (`POST /api/superadmin/subscription-invoices`).
- **2026-02-15**: SaaS Betalingsregelingen volledig herbouwd — echte plans via `POST /api/superadmin/saas-payment-plans` (splitst factuur/bedrag in N termijnen). Toont actieve regelingen met T1/T2 tijdlijn + kandidaten-lijst voor bedrijven met open facturen. Nieuwe collectie `saas_payment_plans`.
- **2026-02-15**: Handmatige SaaS Kasgeld mutaties (correctie/refund/herboeking, +/−).
- **2026-02-15**: Trial-verloop e-mailwaarschuwing 3 dagen voor einde, idempotent via `sent_trial_warnings` collectie.
- **2026-02-15**: Superadmin routes eerste batch verplaatst naar `/app/backend/routes/superadmin.py`.
- **2026-02-15**: SaaS Overzicht 1:1 gespiegeld aan Admin Overview.
- 2026-02: Custom domain resolver + DNS/SSL widget.
- 2026-02: Contract PDF generator herbouwd.
- 2026-02: Kasgeld, Huurders, Contracten UI redesign.
- 2026-02: Superadmin sidebar + routing gespiegeld aan Admin.

## Backlog (P0 → P2)
- **P1** Betaling-registratie flow uit SaaS Kasregister: bij klik op "Betaling" pre-fill company + factuur.
- **P1** Server.py refactor batch 2: OCR-approve/reject naar routes/superadmin.py.
- **P1** JWT-migratie van `localStorage` naar `httpOnly` cookies.
- **P2** React Hook exhaustive-deps warnings fixen (KioskLayout, EmailLogin).
- **P2** Superadmin Settings card-based redesign.
- **P2** Shelly Smart Breakers integratie.
- **P2** Toon `sent_trial_warnings` historie in superadmin dashboard.
- **P2** Kasregister details drawer: klik op bedrijf → alle facturen + payment history in slide-in.

## Tech stack
React · FastAPI · Motor (async MongoDB) · SSE · ReportLab · num2words · Web NFC · Gemini 2.5 Flash (OCR) · Emergent LLM key · SMTP.

## Key files
- `/app/frontend/src/pages/vastgoed/AdminDashboard.jsx` — Admin + SaaS sidebar + routing
- `/app/frontend/src/pages/vastgoed/admin/SaasOverview.jsx` — Superadmin Overzicht
- `/app/frontend/src/pages/vastgoed/admin/SaasKasregister.jsx` — SaaS Kasregister (superadmin kiosk)
- `/app/frontend/src/pages/vastgoed/admin/Subscriptions.jsx` — SaaS Facturen/Betalingen/Kasgeld/Regelingen + alle modals
- `/app/backend/routes/superadmin.py` — Overview/online/invoices/payments/kasregister/plans routes
- `/app/backend/routes/saas_ops.py` — Kas-mutaties + Trial-warnings
- `/app/backend/routes/_deps.py` — Shared deps
- `/app/backend/server.py` — Core FastAPI

## API endpoints (recent)
- `GET /api/superadmin/kasregister` — per-bedrijf betaalstatus + outstanding
- `POST /api/superadmin/subscription-invoices` — handmatige factuur maken
- `POST /api/superadmin/saas-payment-plans` — regeling met N termijnen
- `GET /api/superadmin/saas-payment-plans` — plans + termijn-progress
- `POST /api/superadmin/saas-auto-invoice/run` — trigger auto-generatie
- `POST /api/superadmin/kas-mutations` — handmatige +/- boeking
- `POST /api/superadmin/trial-warnings/run` — trigger trial-warning cyclus

## MongoDB collecties (recent)
- `sent_trial_warnings` — dedup marker
- `saas_payment_plans` — SaaS-betalingsregelingen
- `subscription_invoices.saas_plan_id` — koppelt termijn-facturen aan plan
- `subscription_invoices.manual: true / auto_generated: true` — herkomst-marker

## Test credentials
Zie `/app/memory/test_credentials.md`.
