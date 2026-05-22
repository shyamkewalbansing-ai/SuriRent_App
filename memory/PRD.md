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
- ✅ **QR-code panel** (alleen desktop/tablet zichtbaar): genereerd als statisch SVG (`/kiosk-icons/install-qr.svg`) met SuriRent oranje, link naar productie URL `vastgoed-app.emergent.host/vastgoed`. Perfect voor demo's en pitches op een PC.

### Fase 3 deel 5 (Instellingen-infrastructuur — 2026-05-21) ✅
- ✅ **`company_settings` collectie** per company met 6 secties: SMTP, Twilio, Mope, Uni5Pay, Shelly, Domain
- ✅ **Fernet AES encryption** (`settings_service.py`) voor alle secrets (wachtwoorden, API keys, tokens, webhook secrets)
- ✅ **Mask pattern**: GET retourneert secrets als `•••••`; PUT met mask of leeg behoudt encrypted blob
- ✅ **API**: `GET/PUT /api/settings`, `PUT /api/settings/{section}`, `POST /api/settings/{section}/test` (placeholder)
- ✅ **Frontend Settings page** (`/app/frontend/src/pages/vastgoed/admin/Settings.jsx`) met sub-nav: 6 integraties + Kiosk PIN. Per sectie: ingeschakeld-toggle, alle velden, "Bewaar" + "Test verbinding" knoppen, DNS-instructies voor custom domain
- ✅ 55/55 backend regressie pass

### Fase 3 deel 6 (Fase B — SMTP E-mail send — 2026-05-21) ✅
- ✅ **`email_service.py`** — async smtplib wrapper (STARTTLS poort 587 + SSL poort 465), branded HTML template met SuriRent kleuren
- ✅ **Test verbinding** stuurt echte test-e-mail naar admin
- ✅ **Verstuur kwitantie/factuur/contract via e-mail** met PDF als bijlage en branded HTML body
- ✅ **3 nieuwe endpoints**: `POST /api/email/payment/{id}`, `POST /api/email/invoice/{id}`, `POST /api/email/contract/{id}` (body: `{to?, message?}`)
- ✅ **EmailDialog component** (`/app/frontend/src/components/EmailDialog.jsx`) — prefilled met tenant.email, override + extra bericht, foutafhandeling
- ✅ **Mail buttons** toegevoegd aan Payments, Invoices, Contracts rij-acties (33+ items getest)
- ✅ Heldere foutmelding bij verkeerde SMTP (toonbaar voorbeeld: `[Errno -2] Name or service not known`)

### Fase 3 deel 7 (Fase C — Twilio WhatsApp & SMS — 2026-05-21) ✅
- ✅ **`twilio_service.py`** — directe Twilio REST API via httpx (geen SDK), basic auth met SID + Auth Token
- ✅ **Test verbinding** stuurt echte test-bericht naar geconfigureerde from-nummer (bewezen: 401 vs verkeerde creds bereikt Twilio API)
- ✅ **4 nieuwe endpoints**: `POST /api/message/payment|invoice|contract|overdue-reminder/{id}` met body `{to?, message?, channel: "whatsapp"|"sms"}`
- ✅ **PDF-links in bericht body** (i.p.v. bijlage) — Twilio MMS is duur, link is gratis
- ✅ **SendDialog component** (vervangt EmailDialog): 3-channel switcher (E-mail / WhatsApp / SMS), automatisch wisselen prefilled veld tussen email/telefoon
- ✅ Alle 3 send-knoppen (Payments/Invoices/Contracts) gebruiken nu één dialoog met alle kanalen

### Fase 3 deel 8 (Fase D — Mope + Uni5Pay online betalingen — 2026-05-21) ✅
- ✅ **`payments_service.py`** — Mope REST API (create + get payment_request) via httpx; bedragen in cents; test mode op `test_` token prefix
- ✅ **Mope `Test verbinding`** roept echt API aan en valideert response (bewijst werkende auth-flow)
- ✅ **Nieuwe collectie `payment_requests`** met provider/provider_id/invoice/status/payment_url/paid_at
- ✅ **Endpoints**:
  - `POST /api/payment-requests/invoice/{id}` body `{provider: "mope"|"uni5pay"}` → maakt verzoek aan
  - `GET /api/payment-requests` lijst
  - `POST /api/payment-requests/{id}/refresh` ververst status
  - `POST /api/webhooks/mope` publiek endpoint met Bearer-token auth tegen company.mope.api_key
- ✅ **Auto-payment**: als status=paid → maakt automatisch Payment record + zet invoice op `paid` (idempotent)
- ✅ **Nieuwe admin-tab "Online betalen"** (`/app/frontend/src/pages/vastgoed/admin/PaymentRequests.jsx`) met 4 status-counters, filter, refresh + copy + open-link knoppen
- ✅ **PaymentLinkDialog**: knop op factuurrij opent dialoog (Mope/Uni5Pay), genereert link, toont met copy + open-buttons
- ✅ **Uni5Pay stub**: nette foutmelding "nog niet geconfigureerd — deel API documentatie"

### Dual-domain refactor (2026-05-21) ✅
- ✅ Volledig verwijderen van `/vastgoed/*` subfolder routing — alle app-pagina's nu op root (`/login`, `/admin`, `/kiosk`, `/huurder`, `/onderteken/:token`)
- ✅ Hostname-based routing in `App.js`: `MarketingRoutes` (surirent.sr), `AppRoutes` (app.surirent.sr), `HybridRoutes` (preview/local)
- ✅ Nieuwe helper `frontend/src/lib/env.js` met `isMarketingHost()`, `appLink()`, `appUrl()`, `publicMarketingUrl()` — leest uit `REACT_APP_MARKETING_HOST` en `REACT_APP_APP_URL`
- ✅ Backend `_public_url()` gebruikt `APP_PUBLIC_URL` env var — alle mail/SMS/contract/betaal-links worden gegenereerd richting het app-domein
- ✅ `DEPLOYMENT.md` (root) compleet met CloudPanel-stappen voor 2 vhosts, Nginx config, PM2, DNS, MongoDB backup
- ✅ `.env.example` (backend + frontend) met productie-defaults en uitleg
- ✅ SW cache bumped naar `surirent-v6`
- ✅ Legacy `/vastgoed/*` paths blijven als redirect (veiligheidsnet voor oude bookmarks)
- ✅ Tested: backend 55/55 regression + alle frontend flows (admin login, kiosk PIN, tenant portal, legacy redirects)

### Fase E — Shelly smart breakers (2026-05-21) ✅
- ✅ `backend/shelly_service.py` — Shelly Cloud API (control_relay, device_status, list_devices) via httpx
- ✅ Apartment model heeft optioneel `shelly: {device_id, channel, label}` veld voor binding
- ✅ Endpoints (alle scope-filtered op company):
  - `GET /api/shelly/devices` → lijst van apparaten op het Shelly Cloud-account van het bedrijf
  - `PUT /api/apartments/{id}/shelly` body `{device_id, channel, label}` → koppel/ontkoppel (lege device_id ontkoppelt)
  - `GET /api/shelly/apartment/{id}/status` → relay state + power_w + energy_wh
  - `POST /api/shelly/apartment/{id}/control` body `{turn: on|off|toggle}` → flip relay
- ✅ Cross-company isolation: 404 zonder Shelly te lekken
- ✅ Frontend: nieuw `Zap` icoon-knop op elke appartement-kaart → `ShellyControlModal` met device binding, Cloud lijst-picker, AAN/UIT knoppen, status (vermogen + kWh)
- ✅ Tested: 11 nieuwe Shelly-tests (test_shelly.py) + 55 regressie-tests = **66/66 backend pass**

### Mobile dashboard nav (2026-05-21) ✅
- ✅ Hamburger drawer met alle 14 tabs vervangt de horizontale scrollende bottom-bar die functies verstopte
- ✅ `MobileHeader` (sticky top), `MobileTabBar` (4 primaire + Meer-knop), `MobileDrawer` (slide-in met alle tabs + actief bedrijf + uitloggen)
- ✅ Respecteert `safe-area-inset-top/bottom` voor iOS PWA (notch)
- ✅ SW cache → `surirent-v7`

### Kiosk volledige herbouw — oude ERP-stijl + Locaties (2026-05-21) ✅
- ✅ **Nieuwe collectie `locations`** (`{id, company_id, name, address, photo_url, created_at}`) met CRUD endpoints:
  - `GET/POST /api/locations`, `PUT/DELETE /api/locations/{id}` — scope-filtered op bedrijf
  - DELETE ontkoppelt appartementen (zet `location_id` op null)
- ✅ **Apartment.location_id** + **Tenant.internet_amount** + **PaymentIn category `internet`** + **method `uni5pay`** + **`received_by`/`approved_by`** velden
- ✅ **Kiosk endpoints**:
  - `GET /api/kiosk/locations` (incl. synthetische `_none` bucket voor losse appartementen)
  - `GET /api/kiosk/apartments?location_id=…` met filter
  - `GET /api/kiosk/tenants/{id}/overview` returnt nu ook `internet_amount`
  - `GET /api/kiosk/tenants/{id}/payments` — geschiedenis voor de modal
- ✅ **Admin UI**: nieuwe **Locaties tab** (CRUD met foto-preview), locatie-dropdown in `ApartmentForm`, internet-bedrag input in `TenantForm`
- ✅ **Kiosk redesign** (8 stappen, exact zoals oude ERP-screenshots):
  1. Welcome
  2. **LocationSelect** — grid met locatie-cards (foto/MapPin + appartementen-count)
  3. **ApartmentSelect** — grid met grote HUIS-cards + Bezet/Vacant badge, header "Locatie · Kies uw appartement"
  4. **TenantOverview** — split-screen: Financieel overzicht (Maandhuur, Openstaande huur, Servicekosten, Boetes, Internet) links + "Te betalen" + Volgende + Betalingsgeschiedenis rechts
  5. **PaymentHistoryModal** — kwitanties met Afdruk-knop
  6. **PaySelect** — split-screen: checklist (Huur/Service/Boetes/Internet) links + numeriek toetsenbord rechts (typing-mode wist auto-fill bij eerste druk)
  7. **MethodSelect** — 3 grote cards Contant / Mope / Uni5Pay
  8. **PaymentConfirm** + **Receipt** met `approved_by` regel
- ✅ **`KioskFooter`** sticky onderaan met bedrijfsnaam, appt info, Beheerder & Uit knoppen
- ✅ Auto-skip naar appartement-grid wanneer er ≤1 locatie is
- ✅ SW cache → `surirent-v8`
- ✅ Tested: **88/88 backend pass** (22 nieuwe location-tests + 66 regressie) + alle 8 kiosk-stappen + admin Locaties CRUD geverifieerd

### Impersonation UI fix + verification (2026-05-22) ✅
- ✅ **Bug fix**: backend crashte met `NameError: name 'app' is not defined` — `@app.on_event("shutdown")` en `@api.post("/superadmin/run-trial-reminders")` decorators stonden op regel 548/554, vóór `app = FastAPI(...)` op regel 561. Verplaatst: `app.on_event` (no-op) verwijderd, `run-trial-reminders` route nu vlak boven `app.include_router(api)` geplaatst zodat `api` al bestaat.
- ✅ **Impersonation flow geverifieerd via Playwright**: superadmin login → `/api/superadmin/companies/{id}/impersonate` → hard reload naar `/admin` → `ImpersonationBanner` ("Support modus actief · Terug naar SaaS dashboard") zichtbaar, geen lingering dark overlay, "Mijn Abonnement" tab beschikbaar in sidebar. Exit-knop reset cleanly terug naar SaaS dashboard.

## Prioritized Backlog (Fases E-F)
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
