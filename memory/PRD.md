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
- **2026-02-15**: Handmatige SaaS Kasgeld mutaties (correctie/refund/herboeking, +/−) via nieuwe endpoint `/api/superadmin/kas-mutations`. Verschijnt direct in kasboek en beïnvloedt hero-saldo. UI-knop "Nieuwe mutatie" + modal + "Handmatig" filter-pill.
- **2026-02-15**: Trial-verloop e-mailwaarschuwing 3 dagen voor einde, idempotent via `sent_trial_warnings` marker-collectie. Draait automatisch in daily-billing loop. Handmatige trigger via `/api/superadmin/trial-warnings/run`.
- **2026-02-15**: Server modularisatie eerste stap — nieuwe `/app/backend/routes/saas_ops.py` module + uitgebreide `_deps.py` (require_role, saas_email, iso, now_utc, new_id shared). Patroon vastgelegd voor verdere refactor.
- **2026-02-15**: SaaS Overzicht 1:1 gespiegeld aan Admin Overview (luxe hero + 4 KPI + Snelle acties). Backend `/superadmin/overview` aggregeert nu vanuit `subscription_payments` zodat handmatige mutaties direct doorwerken in het saldo.
- 2026-02: Custom domain resolver + DNS/SSL widget.
- 2026-02: Contract PDF generator herbouwd, ID/DOB auto-fill, num2words NL, live preview.
- 2026-02: Kasgeld, Huurders, Contracten UI redesign naar "Betalingsregelingen" card-stijl.
- 2026-02: Superadmin sidebar + routing 1:1 gespiegeld aan Admin.

## Backlog (P0 → P2)
- **P1** `server.py` (>13k regels) volledige modularisatie naar `/app/backend/routes/` — patroon is nu vastgelegd via `saas_ops.py`.
- **P1** JWT-migratie van `localStorage` naar `httpOnly` cookies.
- **P2** React Hook exhaustive-deps warnings fixen (KioskLayout, EmailLogin).
- **P2** Superadmin Settings card-based redesign.
- **P2** Shelly Smart Breakers integratie.
- **P2** Toon `sent_trial_warnings` historie in superadmin dashboard.

## Tech stack
React · FastAPI · Motor (async MongoDB) · SSE · ReportLab · num2words · Web NFC · Gemini 2.5 Flash (OCR) · Emergent LLM key · SMTP (SaaS platform + per-bedrijf).

## Key files
- `/app/frontend/src/pages/vastgoed/AdminDashboard.jsx` — Admin + SaaS sidebar + Overview
- `/app/frontend/src/pages/vastgoed/admin/SaasOverview.jsx` — Superadmin Overzicht
- `/app/frontend/src/pages/vastgoed/admin/Subscriptions.jsx` — SaaS Kasgeld + Mutation modal
- `/app/backend/server.py` — Core FastAPI (>13k regels, incrementeel refactoren)
- `/app/backend/routes/saas_ops.py` — Kas-mutaties + Trial-warnings module
- `/app/backend/routes/_deps.py` — Shared dependencies voor route-modules
- `/app/backend/pdf_gen.py` — Contract PDF

## Nieuwe API endpoints (2026-02-15)
- `POST /api/superadmin/kas-mutations` — handmatige +/- boeking (kind: adjustment/refund/correction)
- `POST /api/superadmin/trial-warnings/run` — handmatig trial-warning cyclus triggeren

## Nieuwe MongoDB collecties
- `sent_trial_warnings` — dedup marker `{_key: "company_id::trial_ends_at", ...}`
- `subscription_payments.is_manual: true` — kenmerkt handmatige mutaties

## Test credentials
Zie `/app/memory/test_credentials.md`.
