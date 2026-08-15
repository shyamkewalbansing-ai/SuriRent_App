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

## Wat is af (recente sessies)
- **2026-02-15**: Superadmin kiosk-bug fixed — de "Kiosk" sidebar-knop haalt nu eerst een kiosk-token via `/api/auth/admin-to-kiosk` (zelfde pattern als de Admin-flow) en navigeert same-tab i.p.v. window.open (popup-blocker-proof).
- **2026-02-15**: Superadmin routes eerste refactor-batch verplaatst naar `/app/backend/routes/superadmin.py`: `overview`, `online-status`, `subscription-invoices` (list + mark-paid), `subscription-payments` (list). `_deps.py` uitgebreid met `billing_summary` en `is_online`.
- **2026-02-15**: Handmatige SaaS Kasgeld mutaties (correctie/refund/herboeking, +/−) via `/app/backend/routes/saas_ops.py`.
- **2026-02-15**: Trial-verloop e-mailwaarschuwing 3 dagen voor einde, idempotent via `sent_trial_warnings` collectie. Draait in daily-billing loop.
- **2026-02-15**: SaaS Overzicht 1:1 gespiegeld aan Admin Overview (luxe hero + 4 KPI + Snelle acties).
- 2026-02: Custom domain resolver + DNS/SSL widget.
- 2026-02: Contract PDF generator herbouwd, ID/DOB auto-fill, num2words NL, live preview.
- 2026-02: Kasgeld, Huurders, Contracten UI redesign naar "Betalingsregelingen" card-stijl.
- 2026-02: Superadmin sidebar + routing 1:1 gespiegeld aan Admin.

## Backlog (P0 → P2)
- **P1** `server.py` volledige modularisatie — batch 2: verplaats `saas-pending-approvals`, `saas-payment-requests/*` (approve/reject), `subscription-payments POST`, `saas-bank-statement`, `settings`, `plans` naar de `routes/superadmin.py` module.
- **P1** JWT-migratie van `localStorage` naar `httpOnly` cookies.
- **P2** React Hook exhaustive-deps warnings fixen (KioskLayout, EmailLogin).
- **P2** Superadmin Settings card-based redesign.
- **P2** Shelly Smart Breakers integratie.
- **P2** Toon `sent_trial_warnings` historie in superadmin dashboard.

## Tech stack
React · FastAPI · Motor (async MongoDB) · SSE · ReportLab · num2words · Web NFC · Gemini 2.5 Flash (OCR) · Emergent LLM key · SMTP (SaaS platform + per-bedrijf).

## Key files
- `/app/frontend/src/pages/vastgoed/AdminDashboard.jsx` — Admin + SaaS sidebar + Overview + Kiosk-open flow
- `/app/frontend/src/pages/vastgoed/admin/SaasOverview.jsx` — Superadmin Overzicht
- `/app/frontend/src/pages/vastgoed/admin/Subscriptions.jsx` — SaaS Kasgeld + Mutation modal
- `/app/backend/server.py` — Core FastAPI (nu ~13k regels, incrementeel refactoren)
- `/app/backend/routes/superadmin.py` — Overview + online-status + invoices/payments listing
- `/app/backend/routes/saas_ops.py` — Kas-mutaties + Trial-warnings module
- `/app/backend/routes/nfc.py` — NFC lookup + assign
- `/app/backend/routes/_deps.py` — Shared dependencies voor route-modules
- `/app/backend/pdf_gen.py` — Contract PDF

## API endpoints (recent)
- `POST /api/superadmin/kas-mutations` — handmatige +/- boeking
- `POST /api/superadmin/trial-warnings/run` — handmatig trial-warning cyclus triggeren
- **Verplaatst naar `/app/backend/routes/superadmin.py`**:
  - `GET /api/superadmin/overview`
  - `GET /api/superadmin/online-status`
  - `GET /api/superadmin/subscription-invoices`
  - `POST /api/superadmin/subscription-invoices/{id}/mark-paid`
  - `GET /api/superadmin/subscription-payments`

## MongoDB collecties (recent)
- `sent_trial_warnings` — dedup marker `{_key: "company_id::trial_ends_at", ...}`
- `subscription_payments.is_manual: true` — kenmerkt handmatige mutaties

## Test credentials
Zie `/app/memory/test_credentials.md`.
