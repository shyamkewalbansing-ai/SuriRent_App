# Vastgoed Kiosk - PRD

## Original Problem Statement
"Ik wil de /vastgoed en de KIOSK van dit https://github.com/shyamkewalbansing-ai/erp.git hierop zetten met backend en frontend alleen de /vastgoed en de KIOSK..."

User koos voor **Optie C — minimale herbouw** (kern eerst), dan vroeg om **Fase 1 uitbreiding** met 7 modules.

## Architecture
- Backend: FastAPI + Motor (MongoDB) + ReportLab (PDFs), single `server.py` (~1460 regels)
- Auth: JWT (Bearer + httpOnly cookies optioneel) via bcrypt
- Frontend: React 19 + React Router 7 + Tailwind + framer-motion + lucide-react
- PDF: ReportLab Platypus, eigen SuriRent-stijl
- Database: MongoDB — collecties: `users`, `settings`, `apartments`, `tenants`, `payments`, `contracts`, `invoices`, `employees`, `salaries`, `deposits`, `maintenance`, `kasgeld`, `counters`

## User Personas
1. **Beheerder (Admin)** — Email + wachtwoord login
2. **Huurder / Kiosk gebruiker** — 4-cijferige PIN
3. **Contracttekenaar** — Publieke link `/onderteken/:token`

## What's Implemented

### Fase 0 (initial — 2026-05-20)
- ✅ Marketing landing, JWT auth, kiosk PIN flow
- ✅ CRUD Appartementen, Huurders, Betalingen
- ✅ Kiosk flow Welcome → Select → Overview → Pay → Confirm → Receipt
- ✅ Multi-valuta SRD/USD/EUR + maandelijks saldo berekening

### Fase 1 (uitgebreid — 2026-05-20)
- ✅ **Contracten** (CRUD, contract_number `HC{year}-NNNN`, ondertekenlink, PDF)
- ✅ **Digitaal ondertekenen** publieke pagina `/onderteken/:token` met IP + naam + tijdstempel
- ✅ **Facturen** (factuurnummer `F{year}-NNNNN`, maand-generator, PDF)
- ✅ **Werknemers + Loonstroken** (CRUD, auto-fill salaris, payslip PDF)
- ✅ **Borg / Deposits** (held → refunded met aftrek, refund PDF)
- ✅ **Onderhoud tickets** (CRUD per appartement, status workflow open/in_progress/done)
- ✅ **Kasgeld** (in/out, saldo per valuta)
- ✅ **PDF kwitanties** per betaling
- ✅ 11 admin tabs (sidebar + horizontaal scrollbaar mobiel)

### Fase 2 deel 1 (uitgebreid — 2026-05-20, zonder externe credentials)
- ✅ **AI assistent** (Nederlandse chat) via Emergent LLM key + Claude Sonnet 4.5, met live portefeuille-context (appartementen, bezetting, openstaande huur, maand-inkomsten per valuta)
- ✅ **PWA push notificaties** — VAPID keys gegenereerd, service worker `/sw.js`, subscribe/unsubscribe + test/overdue push
- ✅ **AES-256 versleutelde PDFs** met QR overlay + signed verify token (`/api/verify/{token}` voor publieke verificatie)

### Fase 3a (uitgebreid — 2026-05-20)
- ✅ **Tenant portal** — `/huurder` mobile-first login (email/telefoon + PIN), `/huurder/portaal` dashboard met:
  - Eigen appartement + maandhuur + saldo (openstaand/positief)
  - Betalingsgeschiedenis met PDF kwitanties
  - Contracten met PDF
  - Onderhoudsmeldingen (lijst + zelf aanmaken met prioriteit)
- ✅ Admin kan tenant PIN instellen via KeySquare-knop in Huurders tab
- ✅ Mixed-case email + flexible phone matching (full string en digits-only)

## Routes
| Route | Description |
|-------|-------------|
| `/vastgoed` | Marketing landing |
| `/vastgoed/login` | PIN keypad + admin login |
| `/vastgoed/admin/*` | Beheer dashboard (11 tabs, JWT protected) |
| `/vastgoed/kiosk` | Kiosk flow |
| `/onderteken/:token` | Publieke contract signing |

## API Endpoints (samenvatting)
- Auth: `/auth/login` `/auth/register` `/auth/me` `/auth/kiosk-pin` `/auth/kiosk-set-pin`
- Apartments: `/apartments` (CRUD) `/apartments/{id}/assign-tenant` `/apartments/{id}/remove-tenant`
- Tenants: `/tenants` (CRUD) `/tenants/{id}/balance`
- Payments: `/payments` (GET/POST) `/payments/{id}/pdf` (public)
- Contracts: `/contracts` (CRUD) `/contracts/{id}/pdf` `/contracts/sign/{token}` (GET+POST public)
- Invoices: `/invoices` (CRUD) `/invoices/generate-month` `/invoices/{id}/pdf`
- Employees: `/employees` (CRUD)
- Salaries: `/salaries` (GET/POST/DELETE) `/salaries/{id}/pdf`
- Deposits: `/deposits` (CRUD) `/deposits/{id}/refund` `/deposits/{id}/refund-pdf`
- Maintenance: `/maintenance` (CRUD) `/maintenance/{id}/status`
- Kasgeld: `/kasgeld` (CRUD) `/kasgeld/balance`
- Kiosk: `/kiosk/apartments` `/kiosk/tenants/{id}/overview` `/kiosk/payments`

## Test Results
- Iteration 1 (Fase 0): 100% backend & frontend ✅
- Iteration 2 (Fase 1): 100% backend (8/8 nieuwe + 10/11 regression met PIN reset) & frontend (alle 11 tabs) ✅
- Iteration 5 (Multi-Company audit): 25/34 — vond 8 critical data leak bugs
- Iteration 6 (Multi-Company regression): 42/43 ✅ — alle leaks gefixed, data isolation sealed
- Iteration 7 (P1 hardening + regression): 55/55 ✅ — brute force lockout, Jan PIN re-seed, tenant set-pin scope, alle vorige tests blijven groen

### Fase 3 deel 2 (Multi-Company SaaS — 2026-05-20) ✅
- ✅ **Multi-Company architectuur volledig stabiel** — alle 12+ tenant-scoped resources gefilterd via `scope(user)` op list/get/put/delete + `company_id` op create
- ✅ **Superadmin role** met `/api/companies` CRUD (create/update/delete + seed-admin)
- ✅ **Header-based company switching** voor superadmin: `x-active-company: <company_id>` of `?company_id=...`
- ✅ **Kiosk PIN per company** — unique-PIN enforced cross-company, PIN matches naar correcte company's scope
- ✅ **Admin stats + AI context + push notify-overdue** alle scoped per company
- ✅ **Data isolation geverifieerd**: 42/43 tests pass (iteration_6), zero cross-company leakage
- ✅ Test suite `/app/backend/tests/test_multi_company.py` (43 tests) is canonical regressie

### Fase 3 deel 3 (P1 — Frontend Multi-Company UI + Hardening — 2026-05-20) ✅
- ✅ **Companies admin tab** voor superadmin (`/app/frontend/src/pages/vastgoed/admin/Companies.jsx`): CRUD + stats per company + actief-status badge + optionele seed-admin bij create
- ✅ **Company switcher** — superadmin kan met één klik wisselen tussen "Alle bedrijven" en specifiek bedrijf; selectie persisteert in `localStorage.active_company_id`
- ✅ **`x-active-company` header injectie** in axios interceptor (`api.js`) — backend ontvangt automatisch de actieve company scope
- ✅ **Sidebar company badge** — toont "Actief bedrijf" met naam + slug/plan
- ✅ **PIN brute-force lockout** — 8 mislukte pogingen → 429 voor 5 minuten op `/api/auth/kiosk-pin` en `/api/tenant-portal/login`
- ✅ **Idempotent re-seed Jan de Vries PIN** in `lifespan()` — geen handmatige DB reset meer nodig
- ✅ **Tenant set-PIN scope** — Admin A kan geen PIN zetten voor tenant van Admin B (404)
- ✅ 55/55 tests pass (iteration_7)

### Fase 3 deel 4 (PWA — Installable app op iOS & Android — 2026-05-20) ✅
- ✅ **manifest.json** met name, start_url=`/vastgoed`, scope=`/`, display=`standalone`, theme_color, 4 icons (any+maskable), 3 shortcuts (Kiosk / Beheer / Huurder)
- ✅ **iOS support**: alle apple-mobile-web-app-* meta tags, apple-touch-icon (144/192/512), 20 apple-touch-startup-images voor alle iPhone/iPad modellen (8/X/XR/XS Max/13/15 Pro/Pro Max + iPad/iPad Pro 11"/12.9", portrait+landscape)
- ✅ **Android/Chromium**: beforeinstallprompt-handler met "Installeren" CTA
- ✅ **Service Worker v3** (`/sw.js`): app shell caching (precache + runtime), network-first voor HTML, cache-first voor assets, bypass `/api/*`, push notificaties behouden
- ✅ **Auto-registratie** van SW in `App.js` via `useRegisterServiceWorker()` hook
- ✅ **InstallPrompt component** — Android toont native install knop; iOS Safari toont "Tik op Delen → Zet op beginscherm" hint (4s delay, dismissable, 30-dagen cooldown)
- ✅ **Safe-area support** voor iPhone notch / iPad home indicator: body padding + `.kiosk-fullscreen` padding + admin mobile tab bar padding
- ✅ **Standalone media query** schakelt naar oranje achtergrond wanneer geinstalleerd
- ✅ App icon: oranje huis logo (`/kiosk-icons/kiosk-512.png`)
- ✅ **Screenshot tour** in manifest — 3 mobile screenshots (Landing, Kiosk PIN, Huurder Portaal) op 540×960 JPEG, totaal 89KB. Zichtbaar in Android Chrome + Edge install dialoog als "preview".
- ✅ **Install marketing sectie** op landing page tussen Hero en Features — 2 visuele cards (iOS Safari + Android Chrome) met phone mockups, stap-voor-stap instructies, en 3 benefits-callouts ("Direct beschikbaar / Werkt offline / Native gevoel"). Nieuwe "Installeer" link in TopNav.

## Prioritized Backlog (na PWA)
- 📧 **Email notificaties** — wacht op SendGrid / Resend credentials van user
- 📱 **WhatsApp/SMS herinneringen** — wacht op Twilio credentials
- 💳 **Payment gateways** (SumUp/Mope/Uni5Pay) — wacht op credentials
- 🤖 **AI assistent Nederlandse chat** — via Emergent LLM key
- 🔔 **PWA push notificaties** — geen externe key, VAPID generen
- 🔐 **AES-256 versleutelde PDFs** + QR verificatie

### Fase 3 (multi-bedrijf)
- Multi-bedrijf SaaS (companies, subscription, superadmin)
- Tenant portal (huurder login + betalingsgeschiedenis)
- Custom domein per bedrijf

### Fase 4 (hardware)
- Shelly smart breakers per appartement
- Tenda router koppeling (internet plannen)
- Eigen domein + SSL deployment

### Tech debt (van code review)
- Splits `server.py` (~1460 regels) in routers per resource
- PDF endpoints zijn public via UUID — voor productie: signed/expiring tokens
- Deposit `deduction <= amount` validatie strenger maken
- Maintenance reopen `resolved_at` clearen
