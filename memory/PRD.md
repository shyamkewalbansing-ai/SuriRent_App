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

### Online betalen voor SaaS-abonnement: Mope (SRD) + SumUp (EUR) (2026-05-22) ✅
- ✅ **Backend**: nieuw `payments_service.sumup_create_checkout/get_checkout` (SumUp v0.1/checkouts, Hosted Checkout) + FX helper die SRD→EUR live haalt van `open.er-api.com` (6h cache) met `manual` override.
- ✅ **Nieuwe endpoints**: `GET /api/billing/fx`, `GET /api/billing/me/checkout-options`, `POST /api/billing/me/checkout` (provider=mope|sumup), `POST /api/webhooks/mope-saas`, `POST /api/webhooks/sumup-saas` (CHECKOUT_STATUS_CHANGED + amount/currency-validatie tegen invoice).
- ✅ **Idempotent payment activation**: `_record_saas_payment_from_gateway()` markeert invoice paid, maakt subscription_payment, activeert bedrijf, past pending_plan toe, stuurt bevestigingsmail — herbruikt door beide gateways.
- ✅ **SaaS Instellingen UI** uitgebreid met aparte **SumUp (EUR)** sectie (merchant_code + API key + sandbox toggle + webhook URL) en **Wisselkoers SRD→EUR** sectie (Auto/Manual). Tijdens build verifieerd: PUT settings persistente, getoonde live koers `1 SRD = €0.0230`, manual override `0.025` werkt → €75,00 voor SRD 3.000.
- ✅ **Mijn Abonnement UI**: nieuwe donkere "Direct online betalen" sectie boven bankgegevens met groene Mope-knop en blauwe SumUp-knop. Knoppen zijn alleen zichtbaar als gateway enabled + credentials aanwezig zijn. Wisselkoersregel toont bron (live/cache/manual).
- ✅ Tested via Playwright: beide knoppen visible bij admin@vastgoed.sr met juiste bedragen, SaaS Settings secties operationeel, webhook URL automatisch afgeleid van window.location.origin.

### Country-aware currency display (NL→EUR, SR→SRD) (2026-05-22) ✅
- ✅ **Backend**: nieuwe helper `_detect_country_currency(phone)` — `+31`/`0031` → NL/EUR, default → SR/SRD. Registratie zet `country` + `currency` op de company.
- ✅ Plan-pricing helper `_plan_for_company()` converteert SRD-prijzen on-the-fly naar EUR via FX-koers voor NL bedrijven. Nieuwe endpoints: `/api/billing/me/plans` (auth, gefilterd op display_currency), `/api/billing/plans?phone=...` (publiek, voor registratiepagina).
- ✅ `/billing/me/checkout-options` filtert gateways op currency: NL → alleen SumUp, SR → alleen Mope. Bank-box wordt verborgen voor EUR-klanten.
- ✅ Invoice-aanmaak (`change_plan`, `_ensure_open_invoice_for_company`) gebruikt nu de display currency van het bedrijf — NL bedrijf krijgt EUR-facturen, SR bedrijf SRD-facturen.
- ✅ **Frontend**: MijnAbonnement & LoginPage tonen `€75,00` voor EUR-klanten, `SRD 3.000` voor SR-klanten. PlanCards en register-flow herladen plans wanneer telefoonnummer verandert.
- ✅ Tested via curl + Playwright: NL test-bedrijf ziet alleen SumUp €125,00, geen bank, plans in EUR. SR-bedrijf ziet alleen Mope, bank-box, plans in SRD.

### Expliciete valuta-controle: landing SRD/EUR toggle + landenkeuze bij registratie (2026-05-22) ✅
- ✅ **Marketing landing**: nieuwe `🇸🇷 SRD / 🇳🇱 EUR` pill-toggle in de Prijzen-sectie. Prijzen worden dynamisch herladen via `/api/billing/plans?currency=...`. Keuze persisteert in `localStorage.preferred_currency`.
- ✅ **Registratiepagina**: nieuwe `Land & valuta` sectie met drie tegels (Suriname SRD / Nederland EUR / Anders SRD). Pre-selectie via localStorage van de landing-toggle. Plan-prijzen verversen direct bij wisselen tussen tegels.
- ✅ **Backend**: `RegisterIn.country` (`SR`/`NL`/`OTHER`) overschrijft de phone-based detectie. `/billing/plans` accepteert nu zowel `?currency=` (expliciet) als `?phone=` (auto). Tested: SR-telefoon (+597) met `country=NL` → bedrijf krijgt `currency=EUR`. NL-telefoon zonder country override blijft EUR.
- ✅ Klanten met een SR-nummer in NL of vice versa kunnen nu expliciet hun valuta kiezen — flexibiliteit toegevoegd zonder de automatische detectie te breken.

### Landing Page Live Editor (CMS in SaaS Beheer) (2026-05-22) ✅
- ✅ **Backend**: nieuwe `landing_content.py` module met `LANDING_DEFAULTS` (volledige schema: brand, nav, hero, stats, features_header, features, pricing_header, pricing_starter, pricing_pro, cta_section, footer + links) en `deep_merge` helper. Twee MongoDB collecties: `landing_content` (`_draft` + `_published`) en `landing_assets` (base64 stored).
- ✅ **6 nieuwe endpoints**: `GET /api/landing/content` (publiek), `GET /api/superadmin/landing/content?mode=draft|published`, `PUT /api/superadmin/landing/content`, `POST /api/superadmin/landing/publish`, `POST /api/superadmin/landing/discard`, `POST /api/superadmin/landing/upload` (max 5 MB, alleen image/*), `GET /api/landing/asset/{id}` (publiek serve).
- ✅ **MarketingLanding gerefactored**: alle TopNav, Hero, StatsStrip, FeaturesSection, PricingSection (header+features), CTASection en Footer halen content van `/api/landing/content` met defaults fallback. Dynamische icon-resolver via `lucide-react` whitelist. Image URLs resolven `/api/landing/asset/*` automatisch via REACT_APP_BACKEND_URL.
- ✅ **LandingEditor.jsx** (730 regels): nieuwe superadmin tab "Landing Editor" met 8 sectie-tabs, form-based editor links + live iframe preview rechts. Wijzigingen worden direct in de iframe getoond via `postMessage` (zonder reload). Sticky action bar met `Concept`/`Gepubliceerd` status badge, "Opslaan concept", "Publiceer", "Reset" knoppen. Image upload met file + URL plak fallback. Repeatable lists voor menu-items, badges, stats, features, footer-links met add/remove/up-down sortering. Icon picker uit 27 allowed lucide icons.
- ✅ **Draft → Publish workflow**: concept wijzigingen zichtbaar in iframe preview maar pas live na expliciete "Publiceer" klik. "Reset" knop restored draft naar gepubliceerde versie. End-to-end getest via Playwright: superadmin → edit "De complete" → "De ultieme" → publish → public landing h1 toont "De ultieme huurbeheer..." direct.

### InstallSection (PWA) bewerkbaar (2026-05-22) ✅
- ✅ **Backend schema**: `install` toegevoegd aan `LANDING_DEFAULTS` met sub-velden `qr` (eyebrow/title/desc/qr_image_url), `ios` (label/title/badge/screenshot_url + steps[]), `android` (idem), `benefits[]`. Allowed icons uitgebreid met `Share`, `Plus`, `Download`, `Apple`, `ScanLine`.
- ✅ **Frontend**: `InstallSection` in MarketingLanding refactored om alle teksten, screenshots, QR-image en stappen uit `c.install` te lezen met defaults fallback. iOS + Android stappen worden gerenderd via `RepeatableList` (icoon + titel + omschrijving).
- ✅ **LandingEditor**: nieuwe sectie-tab "Installeer" met formulier voor alle install-velden. Three nested groep-cards (QR-paneel / iOS-kaart / Android-kaart) elk met eigen Image upload + Repeatable steps lijst + icon picker. Benefits-lijst met add/remove/sort.
- ✅ E2E getest: install eyebrow wijzigen → live preview updated direct via postMessage.

### PWA opent direct in login (geen landing page) (2026-05-22) ✅
- ✅ **Manifest aangepast**: `start_url` van `/` → `/login?source=pwa` en `id` naar `/?source=pwa`. Nieuwe PWA-installaties starten direct op login.
- ✅ **Runtime detectie in MarketingLanding**: detecteert `display-mode: standalone`, `navigator.standalone` (iOS), of `?source=pwa` query → redirect naar `/login`. Bestaande installaties met gecachte oude manifest worden ook automatisch gepatcht.
- ✅ **Escape hatch**: `?landing=1` query bypasst de redirect zodat marketing landing nog steeds bereikbaar is vanuit de PWA indien gewenst.
- ✅ Tested via Playwright: `/?source=pwa` → final URL `/login` met Kiosk PIN. `/?landing=1` → landing page met h1 zichtbaar.

### PWA onthoudt voorkeur-rol (kiosk/admin/huurder) (2026-05-22) ✅
- ✅ **Nieuwe `lib/pwaRole.js` helper**: `getPreferredRole`, `setPreferredRole`, `clearPreferredRole`, `isStandalonePWA`, `routeForRole`. localStorage key `pwa_preferred_role` met `kiosk | admin | tenant`.
- ✅ **Auto-save bij login**: kiosk PIN succes → `setPreferredRole('kiosk')`; admin login/register → `setPreferredRole('admin')`; tenant portal login → `setPreferredRole('tenant')`.
- ✅ **Auto-redirect in `/login`**: bij PWA standalone-modus + opgeslagen rol + bijbehorend token aanwezig → `replace` navigate naar `/kiosk` / `/admin` / `/huurder`. Token-check voorkomt redirect-loops bij verlopen tokens.
- ✅ **`PwaRoleBadge`** UI onderaan: toont actieve standaard-modus + "Wijzig" knop (RotateCcw icoon) die de localStorage clear-t. Verschijnt alleen als er een rol opgeslagen is.
- ✅ **Escape route**: `?pick=1` query parameter bypasst de auto-redirect zodat een gebruiker explicit kan kiezen.
- ✅ End-to-end getest: admin token → /login?source=pwa → /admin redirect; tenant role → /huurder; ?pick=1 toont badge met "Beheerder · Wijzig"; reset clear-t de localStorage.

### Per-bedrijf branding (logo + primaire kleur + naam) (2026-05-22) ✅
- ✅ **Backend**: company schema uitgebreid met `branding.{app_name, primary_color, logo_url, tagline}` (hex validatie + fallback naar `#FF5C00`). 4 nieuwe endpoints: publiek `GET /api/public/companies/{slug}/branding`, auth `GET /api/companies/me/branding`, `PUT /api/companies/me/branding`, `POST /api/companies/me/branding/upload` (hergebruikt `landing_assets` collection met `scope: company`).
- ✅ **`lib/branding.js`** helper: detecteert slug via URL `?c=`/`/c/...`, subdomain (`klant.app.surirent.sr`), of localStorage `pwa_company_slug`. Past primary color toe via CSS variable. Cached in localStorage voor instant render bij volgende load.
- ✅ **LoginPage geheel branding-aware**: header, PIN-kaart, PIN-input borders, en page-achtergrond gebruiken nu de primaire kleur. `CompanyCodePicker` verschijnt wanneer geen branding gedetecteerd → klant tikt eenmalig "surirent" → branding actief. `PwaRoleBadge` uitgebreid met "Bedrijf: X · Wijzig" sectie.
- ✅ **Admin Branding tab** (`Branding.jsx`): logo upload (max 5MB), preset color swatches + native color picker + hex input, app-naam + tagline veld, deelbare link `…/login?c=slug`, **live preview kaart** rechts toont exact wat klanten zien.
- ✅ **Fallback**: onbekende slug → standaard SuriRent oranje branding + automatisch picker tonen zodat gebruiker kan corrigeren.
- ✅ End-to-end getest via Playwright: `/login?c=surirent` met blauwe primary color (#1e88e5) renderde **complete blauwe achtergrond** + header "SuriRent Premium" + PIN-card "Welkom bij SuriRent Premium · Test branding live" + bedrijfs-badge onderaan. Unknown slug en picker-flow werken correct.

### "Mijn URL" kaart + welkomstemail met login-link (2026-05-22) ✅
- ✅ **Backend**: nieuw `GET /api/companies/me/url-info` endpoint dat slug, subdomein URL, universele query URL, en live DNS-status (`active | dns_missing | error | unknown`) teruggeeft via best-effort `/api/health` ping (3s timeout, faalt nooit). Respecteert `SAAS_APP_DOMAIN` env override.
- ✅ **Herbruikbaar `MyUrlCard` component**: donkere gradient-kaart met "Wildcard DNS actief" badge (groen/amber/rose tones), eigen subdomein + universele link, Kopieer-knoppen (clipboard API + "Gekopieerd" feedback), Open knop, Refresh knop voor handmatige re-check. Heeft `compact` mode (alleen subdomein) voor het dashboard overzicht.
- ✅ **Geplaatst op 2 locaties**: bovenaan op het Overzicht-dashboard (compact mode — meteen zichtbaar bij login) én bovenaan in de Branding tab (volledige versie met beide URLs).
- ✅ **Welkomstemail uitgebreid**: nieuwe registratie krijgt nu in de mail (1) een grote oranje "Open mijn omgeving" CTA-knop naar de universele query-URL, (2) de plain-text URL eronder voor kopiëren, (3) een aparte sectie met de subdomein-URL "Of gebruik later uw eigen subdomein (zodra DNS actief is)". Tip-regel onderaan over bookmark/install.
- ✅ E2E getest: card visible op zowel Overview als Branding tab, copy button werkt, DNS status badge toont "Wildcard DNS actief" correct (preview env accepteert wildcard hostnames).

### PDF-onboarding pakket + inline QR-code in welkomstemail (2026-05-22) ✅
- ✅ **Nieuwe `pdf_gen.onboarding_pdf()`** functie: 2-koloms layout met QR-code (gegenereerd via `qrcode` lib), login-info tabel (bedrijf/email/wachtwoord/PIN/pakket/prijs/trial), aparte "iOS — iPhone/iPad" en "Android — Chrome/Edge" install-stappen kaarten, oranje brand-accents (gebruikt company's `primary_color` voor headers). 23 KB per PDF.
- ✅ **`_make_qr_png()` helper** in pdf_gen.py: genereert PNG QR-codes (M error-correction, 360px default) — herbruikbaar voor zowel PDF als inline email image.
- ✅ **email_service uitgebreid**: `_build_message()` parseert nu `'image/png; cid=loginqr; inline'` content-type strings → voegt inline image met Content-ID toe (referencable via `src="cid:loginqr"` in HTML body). `send_platform_email` accepteert nu `attachments` parameter.
- ✅ **Welkomstemail aangepast**: bevat nu (1) een **inline gescande QR-code** in de e-mail HTML body voor mobile scanning, (2) een **PDF-bijlage** `SuriRent_welkomstpakket_<slug>.pdf` met complete onboarding info, (3) tekstuele tip "📎 Bijgevoegd: een PDF welkomstpakket met alle inloggegevens, QR-code en installatie-instructies".
- ✅ **Robuustheid**: try/except rond PDF + QR generatie zodat registratie nooit faalt door een email-issue. AI-quality check op generated PDF bevestigt: QR scannable, info tabel leesbaar, iOS/Android sectie gescheiden, branding accent zichtbaar.
- ✅ Tested via curl-registratie van een dummy bedrijf — geen errors, PDF wordt correct gegenereerd en aangehecht.

### PIN-pagina volledig viewport-responsive + Admin auto-lock (2026-05-22) ✅
- ✅ **`PinLanding` volledig herschreven met `clamp()` + `vh`/`vw`-units**: logo, titel, tagline, PIN-slots, keypad-knoppen, footer en header schalen nu proportioneel mee met de viewport. Min-waarden zorgen voor leesbaarheid op de kleinste telefoons (iPhone-SE1 320×568), max-waarden voorkomen dat het te groot wordt op tablets.
- ✅ **Container** gebruikt nu `h-[100dvh] w-full flex flex-col` + `env(safe-area-inset-*)` padding zodat de pagina exact past op alle phones (320–768px breed, 568–1366px hoog), inclusief PWA-standalone met notch/home indicator.
- ✅ **Geverifieerd**: bij viewport 320×568 (iPhone SE), 375×667, 390×844 (iPhone 12+) → `document.height === viewport.height` (geen scroll). Card en DEL-knop blijven volledig binnen het scherm.
- ✅ **Auto-lock (15 min idle)** in `/admin`: nieuw `lib/useIdleLock.js` hook luistert naar mouse/key/touch/scroll events. Bij inactiviteit → `admin_token` verwijderen → `window.location.assign('/login?locked=1')`. Niet actief voor superadmin (langere SaaS-sessies).
- ✅ **Locked-banner** verschijnt op `/login?locked=1` met merkkleur: "Sessie vergrendeld door inactiviteit — voer uw PIN in om verder te gaan". Verdwijnt zodra de gebruiker een toets indrukt. Kiosk_token blijft behouden → PIN-invoer herstelt direct de admin-toegang (één tik PIN i.p.v. wachtwoord).
- ✅ E2E getest via Playwright: PIN-pagina past op alle telefoonschermen, locked-banner toont correct.

### AI Assistent + Online betalen code/endpoints volledig verwijderd (2026-05-22) ✅
- ✅ **Frontend bestanden verwijderd**: `admin/AIChat.jsx`, `admin/PaymentRequests.jsx`
- ✅ **AdminDashboard**: imports + tab-render cases voor `ai` en `paylinks` weggehaald
- ✅ **Invoices.jsx**: per-factuur "betaallink"-knop + `PaymentLinkDialog` verwijderd
- ✅ **Backend**: `/api/ai/chat`, `/api/ai/sessions/{id}`, `AIChatIn`, `_collect_context()`, `ai_service.py` (bestand weg), `ai_sessions` uit `TENANT_SCOPED_COLLECTIONS`
- ✅ **Backend**: `/api/payment-requests/*` + `/api/webhooks/mope` + helpers weggehaald (per-invoice online betalen flow)
- ✅ **SaaS-billing intact**: `saas_payment_requests`, `/api/billing/...`, `/api/webhooks/mope-saas` ongewijzigd — platform-abonnement betalingen werken
- ✅ Smoke-test: `/api/ai/chat` → 404, `/api/payment-requests` → 404, `/api/invoices` → 200, facturen-tabel toont geen betaallink-knop meer

### PWA shortcuts: aparte "Beheer" + "Kiosk" icoon — beide met PIN (2026-05-22) ✅
- ✅ **Manifest.json**: `shortcuts.kiosk.url` → `/login?source=pwa&target=kiosk`, `shortcuts.beheer.url` → `/login?source=pwa&target=admin`. Beide gaan eerst door PIN-scherm, niet meer direct naar `/kiosk` of `/admin` zonder authenticatie.
- ✅ **LoginPage** detecteert `?target=admin` query → na PIN-success: `setPreferredRole('admin')` + hard navigate naar `/admin` (admin_token is al door backend meegegeven sinds eerdere fix). `target=kiosk` (default) → naar `/kiosk` met `preferredRole='kiosk'`.
- ✅ **Visuele hint** in PIN-kaart bij Beheer-target: titel toont "Beheer · {appName}" + oranje sub-tekst "Voer uw PIN in om naar het Beheer-dashboard te gaan", zodat de gebruiker weet wat hij geopend heeft.
- ✅ **PWA auto-redirect** respecteert nu de `target` query — als de Beheer-shortcut wordt geopend met geldig admin_token, springt het direct naar `/admin` (geen kiosk-redirect meer).
- ✅ Service worker cache bumped naar `surirent-v15` zodat het nieuwe manifest direct doorkomt op bestaande installaties.
- ✅ E2E getest via Playwright: beide shortcuts werken; PIN 1234 → juiste surface met juiste tokens + preferred_role gezet.


- ✅ **Verwijderd uit Sidebar én MobileDrawer**: bedrijfsbadge ("Bedrijf SuriRent N.V. /surirent • pro"), Snel-acties blok (Open Kiosk + Vergrendel nu).
- ✅ **`useIdleLock` hook + bestand verwijderd** + auto-lock call uit AdminDashboard weggehaald. Geen onbedoelde sessie-vergrendeling meer.
- ✅ **`locked` banner en `?locked=1` afhandeling uit LoginPage gehaald** — niet meer relevant zonder auto-lock.
- ✅ Sidebar bevat nu: logo + tab-lijst (direct in beeld) + admin e-mail + Uitloggen. Beheerder kan direct alle tabs zien zonder afleiding.
- ✅ "Open Kiosk" blijft beschikbaar als grote CTA-kaart op het Overzicht-scherm.

### Session 2026-05-23 — Bulk WhatsApp + iOS PWA + Auto-update ✅
- ✅ **Bulk WhatsApp Wizard** in Facturen (Invoices.jsx): één klop per huurder, opent `wa.me` met vooringevulde achterstandstekst, progress-balk, skip-knop, waarschuwt voor huurders zonder telefoonnummer. Browser-veilig (geen popup-block).
- ✅ **iOS PWA edge-to-edge oranje achtergrond** — PinLanding + PasswordView + RegisterSuccess wrappers herschreven naar `position: fixed; inset: 0` met safe-area-padding INSIDE. Geen `h-[100dvh]` of `min-h-screen` meer → witte strook onder home-indicator en notch-overlap zijn weg.
- ✅ **First-paint bg fix v2** — inline `<script>` in `index.html` zet BOTH `documentElement.style.backgroundColor` ÉN `document.body.style.backgroundColor` op `#FF5C00` voor `/login`, `/kiosk`, `/` routes vóór React mount. Drie-laagse bescherming (html + body + wrapper) zodat geen witte strook of flits meer op iOS PWA, ook tijdens reload.
- ✅ **PWA stille auto-update** — `controllerchange` reload wacht nu tot `document.visibilityState === 'hidden'` (gebruiker schakelt naar andere app). Geen UpdateToast meer, geen flikker meer mid-page. Bij volgende open van de PWA draait automatisch de nieuwe versie. Cache-versie bumped naar `surirent-v22`.
- ✅ Smoke tested via Playwright: login + admin + Bulk WhatsApp modal werkend; html/body bg = rgb(255,92,0) op `/login`.

### Session 2026-05-23 — Huurder Kiosk (Tenant Kiosk) ✅
- ✅ **Nieuwe route `/kiosk/huurder`** (+ legacy redirect `/vastgoed/kiosk/huurder`) → `TenantKioskLayout` — een fysiek-stijl kiosk voor huurders zelf (los van de bestaande reception/admin kiosk).
- ✅ **Flow**: e-mailadres invoeren → 4-cijferige PIN-pad → dashboard met 4 grote actie-tegels (Betalen, Onderhoud, Mijn gegevens, Contact) + saldo-strook. Idle auto-logout na 90s.
- ✅ **2 nieuwe backend endpoints** (huurder-scoped, body kan NIET tenant_id/company_id overrulen):
  - `GET /api/tenant-portal/invoices` — alle facturen van de ingelogde huurder
  - `POST /api/tenant-portal/payments` — registreert een betaling (auto-link aan factuur, marks paid bij ≥95%, push naar admins). Cross-tenant invoice_id → 404.
- ✅ **Login body** verschoven naar `{identifier, pin}` (komt overeen met backend `TenantLoginIn`).
- ✅ Geverifieerd: 16/16 nieuwe pytest tests (`test_tenant_kiosk.py`) + frontend e2e via Playwright (email → PIN → dashboard → Pay/Onderhoud flows). Iteration 10 report.

### Session 2026-05-23 — QR-sticker per appartement (deur-tot-kiosk) ✅
- ✅ **Publieke lookup**: `GET /api/tenant-portal/lookup-apartment/{apt_id}` → `{apartment, tenant: {name, email, first_name}, company}`. Zonder auth. 404 voor onbekende of nog-niet-PIN-toegewezen appartementen. **PII-guard**: geen `pin_hash`, geen telefoon, geen saldo in respons.
- ✅ **Print-poster**: `GET /api/apartments/{apt_id}/kiosk-sticker.pdf` (publiek) — A4 PDF met grote QR-code → `/kiosk/huurder?apt=<id>`, appartement-nummer + adres + bedrijfsnaam, gekleurd met de bedrijfsbranding (`primary_color`).
- ✅ **PDF helper** `kiosk_sticker_pdf()` in `pdf_gen.py` (gebruikt `_make_qr_png` op 600px) — 43 KB per poster.
- ✅ **Frontend `TenantKioskLayout`**: leest `?apt=...` query-param → roept lookup aan → slaat de e-mail-stap over → toont direct PIN-pad met "Welkom &lt;Voornaam&gt;" + "Appartement &lt;nummer&gt;". In QR-mode is de "Andere e-mail"-link verborgen (locked-flag).
- ✅ **Fallback**: onbekend/ongeldig `?apt=...` → valt netjes terug op de normale e-mail+PIN-flow zonder crash.
- ✅ **Admin UI**: nieuwe `QrCode`-icon-knop op elke appartement-kaart in Appartementen-tab — opent de sticker-PDF direct in een nieuw tabblad. Branded oranje (`bg-[#FFE6D3] text-[#C74600]`).
- ✅ Geverifieerd: 9 nieuwe pytest cases (`test_kiosk_qr_sticker.py`) + frontend Playwright e2e (Welkom-prefill, geen email-input, fallback bij ongeldige apt-id, admin-knoppen aanwezig). Iteration 11 report.

### Session 2026-05-23 — Huurder Kiosk: PIN-only + admin-kiosk redesign ✅
- ✅ **Per-bedrijf PIN-uniqueness** afgedwongen op `POST /api/auth/tenant-set-pin`: wanneer admin een PIN instelt die al in gebruik is door een andere huurder van hetzelfde bedrijf → `409` met `detail` die de naam van de conflicterende huurder bevat. Zelfde-tenant idempotent (geen vals 409 tegen zichzelf). Cross-company isolation behouden — PIN `5678` kan in bedrijf A én bedrijf B bestaan.
- ✅ **Nieuwe endpoint** `POST /api/tenant-portal/pin-login` body `{pin, company_slug?, company_id?}` → één unieke huurder zoeken binnen het bedrijf, token uitgeven. 401 bij verkeerde PIN, 400 zonder bedrijfscontext. Brute-force throttle (8 fails → 429) per IP+company.
- ✅ **Frontend volledig herontworpen** (`TenantKioskLayout.jsx`) in admin-kiosk-stijl:
  - **PIN-only login** — geen e-mail-stap meer (de QR-sticker geeft `apt=<id>` mee voor "Welkom &lt;Voornaam&gt;", standalone modus haalt `company_id` uit branding).
  - **Branded oranje gradient** achtergrond (volgt `branding.primary_color`).
  - **Hero-stijl welkom**: groot logo (of huis-icon), "HUURDER KIOSK" eyebrow, "Welkom &lt;naam&gt;", appartement-badge bij QR-mode.
  - **Groot PIN-pad** met framer-motion: PinDots met shake-animatie bij fouten, knoppen met depth-shadow + active translate-Y, haptic feedback via `navigator.vibrate`.
  - **Dashboard** met saldo-banner (rood bij achterstand, groen bij volledig bij) + 4 actie-tegels (Betalen/Onderhoud/Mijn gegevens/Contact), elk met eigen accent (oranje/sky/emerald/violet) + hover lift.
  - **`framer-motion` AnimatePresence** voor view transities (slide-in/out).
  - **Sticky witte footer** met bedrijfsnaam + huurder-naam + "Uit"-knop (matched admin-kiosk pattern).
  - Idle auto-logout na 90s blijft behouden.
- ✅ Geverifieerd: **15 nieuwe pytest cases + 24 regressie + frontend Playwright e2e (iteration 12)**. Wrong PIN → shake + auto-clear, juiste PIN → dashboard, alle 4 tegels navigeerbaar, QR-mode prefill, no-context graceful error. Zero issues.

### Session 2026-05-23 — Huurder Kiosk polish v2 ✅
- ✅ **PIN dots zichtbaarheid**: dots vergroot naar 24px (w-6/h-6), 3px massieve witte rand. Gevulde staat = donker slate-900 (was wit op oranje, nu donker op wit-met-rand → enorme contrast). Error-state in rood. Resultaat: huurders zien meteen hoeveel cijfers ze al getypt hebben.
- ✅ **Dashboard volledig herbouwd in admin-kiosk split-screen stijl** (i.p.v. eerdere "balance banner + tile grid"):
  - **LEFT card (3/5 breed)** — "Financieel overzicht" met line-items voor Maandhuur / (Openstaande huur, hoogtepunt) / Servicekosten / Boetes / Internet + grote "Totaal openstaand" footer-regel.
  - **RIGHT card (2/5 breed)** — grote "Te betalen" amount + primary CTA-knop. Wisselt naar emerald-groen "Saldo SRD 0,00 · U bent volledig bij. Bedankt!" + "Bekijk facturen" wanneer er geen achterstand is.
  - **3 secondary tiles** onder de CTA: Onderhoud / Gegevens / Contact (compacte iconenrij i.p.v. de eerdere 4 grote tegels).
- ✅ **CompanyPicker fallback** — `/kiosk/huurder` zonder `?c=` en zonder QR-link → toont "Welk bedrijf?" kaart met text-input (`tk-slug-input`) en doorgaan-knop. Onbekende slug → inline foutmelding. Probeert eerst `/api/public/branding-default` (single-tenant systemen): geeft 200 als er exact 1 bedrijf is, anders 404 → picker.
- ✅ **Nieuw publiek endpoint** `GET /api/public/branding-default` voor single-tenant deployments. 4 nieuwe pytest tests.
- ✅ **Admin TenantPinModal verbeterd**: na opslaan toont de modal een groen succesblok met "PIN &lt;X&gt; is ingesteld voor &lt;Naam&gt;", de complete Huurder-Kiosk URL (`window.location.origin/kiosk/huurder?c=&lt;slug&gt;`) met "Kopieer"-knop, een "Open Huurder Kiosk" anchor (opens new tab) én een "Sluiten" knop. Admin weet nu direct waar de huurder kan inloggen.
- ✅ Geverifieerd: **4 nieuwe pytest + 43 regressie + frontend Playwright e2e (iteration 13)** — alle groen. PIN dots visueel duidelijk, dashboard 1-op-1 admin-kiosk stijl, picker werkt, modal-flow met copy/open knoppen volledig functioneel.

### Session 2026-05-23 — Klantenscherm (Customer Display) ✅
- ✅ **Live-mirror display** voor de admin Kiosk — een aparte read-only pagina op `/kiosk/klant?c=<slug>` die toont wat de receptie/admin op dat moment doet. Werkt op een 2e monitor, tablet of TV in de wachtruimte.
- ✅ **Backend (3 nieuwe endpoints)**:
  - `PUT /api/kiosk/customer-display` — admin Kiosk pusht state (kiosk_token vereist). Body: `{step, apartment?, tenant?, overview?, payload?, payment?}`. Upserts naar nieuwe collection `customer_display` per `company_id`.
  - `DELETE /api/kiosk/customer-display` — reset naar idle bij uitloggen (kiosk_token).
  - `GET /api/public/customer-display/{slug}` — publiek polling endpoint (1.5s cadence). Geeft `{branding, state}` terug. Stale state (>5 min geen update) → auto-reset naar idle.
- ✅ **Admin Kiosk wijziging**: `KioskLayout` heeft een nieuwe `useEffect` die op elke state-verandering automatisch `PUT /api/kiosk/customer-display` doet. Geen kostbare info gestuurd — alleen wat de klant mag zien (geen pin_hash, geen company_id).
- ✅ **6 phases op het klantenscherm** met framer-motion transitions:
  - `idle/check` → **IdleScreen**: groot bedrijfslogo, "WELKOM BIJ &lt;naam&gt;", subtitel "Een medewerker helpt u zo", pulse-animatie op logo.
  - `select` → **GreetScreen**: "WELKOM &lt;voornaam&gt;" + appartement-badge.
  - `overview` → **OverviewScreen**: zelfde split-screen layout als de admin Kiosk's TenantOverview — links specificatie (Maandhuur / Openstaande huur / Servicekosten / Boetes / Internet), rechts groot "Te betalen" bedrag.
  - `pay` → **PayScreen**: checklist van geselecteerde categorieën + groot lopend totaal in oranje.
  - `method / confirm` → **MethodScreen**: betaalmethode icoon (Banknote/CreditCard/Smartphone) + bedrag in mega-letters.
  - `receipt` → **ReceiptScreen**: groene CheckCircle spring-bounce + bedrag + kwitantienummer + "Bedankt voor uw betaling!".
- ✅ **Slug picker fallback** wanneer `/kiosk/klant` zonder `?c=` geopend wordt — eenmalige bedrijfscode-invoer, daarna start het scherm.
- ✅ **Branded oranje gradient** achtergrond volgt `branding.primary_color`. Footer rechtsonder toont "KLANTENSCHERM" + bedrijfsnaam.
- ✅ Geverifieerd: **10 nieuwe pytest cases (`test_customer_display.py`) + 43 regressie + frontend Playwright e2e live-sync (iteration 14)** — admin tab selecteert appartement → klant tab toont GreetScreen binnen 2s. Polling cadence 1.5s werkend.

### Per-bedrijf Branded Routes (uitgebreid — 2026-05-24)
- ✅ **`/c/:slug/*` URL-prefix** met `BrandedShell` die per bedrijf branding (kleur, logo, naam) ophaalt en de CSS-vars zet vóór de child rendert.
- ✅ **Branded sub-routes**: `/c/<slug>/`, `/c/<slug>/login`, `/c/<slug>/kiosk`, `/c/<slug>/kiosk/huurder`, `/c/<slug>/kiosk/klant`, `/c/<slug>/admin`, `/c/<slug>/huurder`, `/c/<slug>/huurder/portaal`.
- ✅ **404 voor onbekende slug** — toont nette "Bedrijf niet gevonden" kaart i.p.v. door te lopen op default branding.
- ✅ **`useBrandedNavigate()` hook** (`/app/frontend/src/lib/branded-nav.js`) — drop-in replacement voor `useNavigate()` die alle absolute navigations (`/login`, `/admin`, `/kiosk`, `/huurder`) automatisch prefixt met `/c/<slug>` wanneer de gebruiker binnen branded context zit. Toegepast in: LoginPage, KioskLayout, TenantKioskLayout, AdminDashboard, TenantLoginPage, TenantDashboard.
- ✅ **Subdomain branding** blijft werken via bestaande `detectCompanySlug()` + `/api/public/branding-by-host` (klant.app.surirent.sr → slug=klant).


### QR-codes voor branded URLs (uitgebreid — 2026-05-24)
- ✅ **Backend endpoint** `GET /api/companies/me/qr.png?kind=<login|kiosk|tenant_kiosk|customer_display|tenant_portal|query>&size=160-800` — auth-required; bouwt URL server-side via `_QR_KIND_PATHS` (phishing-safe); levert PNG via `qrcode[pil]`.
- ✅ **`QrCodeModal` component** (`/app/frontend/src/components/QrCodeModal.jsx`) — fetcht PNG als blob via axios met Bearer-auth, toont in modal met kopieer-URL + Download PNG + Open knoppen. Clipboard fallback via `document.execCommand('copy')` voor browsers zonder Clipboard API.
- ✅ **`MyUrlCard` integratie** — QR-iconen op alle 5 URL-rijen (subdomein, branded pad, admin kiosk, huurder kiosk, klantenscherm) in de Branding tab van de Admin Dashboard.
- ✅ Geverifieerd: **20 nieuwe pytest cases (`test_qr_endpoint.py`) — alle kinds, auth, size-clamp, pyzbar-decode** + frontend e2e modal-open / download / kopieer (iteration_16 100% pass). Bonus: refactor-miss in AdminDashboard.jsx (3 vergeten `useNavigate` → `useBrandedNavigate`) opgelost.

### Mobile-only POS-stijl Betalingen (uitgebreid — 2026-05-25)
- ✅ **Telefoon-specifieke Betalingen pagina** (`md:hidden`, < 768px) — POS-terminal look gebaseerd op gebruikersmockup: grote "Betalingen" titel + "Vandaag" stat-kaart rechtsboven, gradient "Nieuwe betaling" pill, tab-pills (Alle/Vandaag/Week/Maand) met oranje underline, vierkante filter-icoon, soft-cream payment cards met avatar + naam + adres + CONTANT pill + groot groen bedrag.
- ✅ **Inline expand-detail** — tikken op een kaart toont Kwitantie/Datum/Categorie/Notitie + PDF/Verstuur/QR knoppen in een emerald-tint paneel.
- ✅ **Tablet + desktop ongewijzigd** (>= 768px): bestaande KPI cards + tabelweergave blijft werken (verified op 1440px viewport).
- ✅ State + handlers gedeeld met bestaande Payments component (zelfde load/filter/expand logica) — geen DRY-schending.


### PWA fix (2026-02-26)
- ✅ **iOS PWA install-naam + start_url bug FIXED** — Het inline `<head>`-script in `index.html` controleerde `/kiosk` vóór `/kiosk/huurder`, waardoor de tenant kiosk route werd herkend als de algemene `kiosk` rol. Resultaat: PWA werd geïnstalleerd met de kiosk-naam/manifest, en startte bij `/kiosk?source=pwa` (vastgoed kiosk) in plaats van `/kiosk/huurder?source=pwa` (huurder kiosk). Volgorde aangepast: specifieke routes (`/kiosk/klant`, `/kiosk/huurder`) eerst, daarna pas algemene `/kiosk`.
- ✅ Static `<title>` van "SuriRent" → "App" zodat fallback niet brand-naam toont vóór script runt.
- ✅ Service Worker cache versie gebumpt v49 → v50 om oude cache van iOS/Safari te invalideren.
- Verified via screenshot tool: `/kiosk/huurder` → manifest-huurder.json + title "Huurder" + theme #10B981 ✅

## Prioritized Backlog (Fases E-F)
- 📧 **Email notificaties** — wacht op SendGrid / Resend credentials van user
- 📱 **WhatsApp/SMS herinneringen** — wacht op Twilio credentials

### Huurportaal-poster · Share Feature (2026-02-26)
- ✅ **Algemene huurportaal A6 poster** — `GET /api/companies/me/portal-poster.pdf` genereert printbare A6-kaart (105×148mm) met grote QR, bedrijfsnaam, "Scan voor mijn huurportaal" — QR linkt naar `/c/<slug>/huurder` (branded).
- ✅ **Per-huurder A6 poster** — `GET /api/tenants/{id}/portal-poster.pdf` met QR die de identifier (email/telefoon) vooringevuld geeft via `?identifier=…`. Huurder hoeft alleen PIN te tikken.
- ✅ **TenantLoginPage prefill** — `/huurder?identifier=jan@example.sr` slaat identifier-stap over en gaat direct naar PIN keypad, met identifier in back-button.
- ✅ **Branding / "Uw login-URL" card** uitgebreid met "Mijn Huurportaal · deel met huurders" rij — QR + Print poster + Kopieer + Open knoppen.
- ✅ **Huurders tabel** uitgebreid met groene Printer-knop per rij voor per-huurder A6 poster.
- ✅ Nieuwe helper `portal_poster_pdf()` in `pdf_gen.py` + `_build_a6()` voor A6 paginagrootte.
- ✅ Nieuwe veld `tenant_portal_url` in `/companies/me/url-info` response.
- Verified via curl: beide endpoints HTTP 200, PDF 35–44KB. Frontend smoke test: pill zichtbaar op Branding, 2 printer-knoppen op Huurders tabel, prefill werkt op `/huurder?identifier=…`.

- 💳 **Payment gateways** (SumUp/Mope/Uni5Pay) — wacht op credentials

### Refactor: /huurder route afgeschaft → kiosk/huurder is enige tenant login (2026-02-26)
- ✅ **Routes verwijderd**: `/huurder` en `/huurder/portaal` (TenantLoginPage + TenantDashboard pagina's verwijderd).
- ✅ **Legacy redirects**: `/huurder` → `/kiosk/huurder` (zowel root als branded `/c/<slug>/huurder`).
- ✅ **QR-codes ompunten**: zowel algemene als per-huurder poster linkt nu naar `/c/<slug>/kiosk/huurder` (PIN-only via QR).
- ✅ **Backend `_QR_KIND_PATHS.tenant_portal`** verwijst naar `kiosk/huurder` (legacy field gehandhaafd voor compat).
- ✅ **`tenant_portal_url`** in `/companies/me/url-info` is nu identiek aan `tenant_kiosk_url`.
- ✅ **Per-huurder poster**: identifier-prefill verwijderd (niet meer nodig, PIN identificeert). Toont nog wel naam + appartement op de poster zelf.
- ✅ **pwa-manifest.js + index.html inline script**: `/huurder` rol-detectie verwijderd (route bestaat niet meer).
- ✅ **pwaRole.js**: `routeForRole('tenant')` → `/kiosk/huurder`.
- ✅ **MarketingLanding footer**: tenant_portal link → `/kiosk/huurder`.
- Verified: /huurder, /huurder/portaal en /c/surirent/huurder redirecten allemaal naar `/kiosk/huurder` (eventueel branded). Branded `/c/surirent/kiosk/huurder` toont meteen "HUURDER KIOSK · SuriRent" PIN keypad met juiste branding.

- 🤖 **AI assistent Nederlandse chat** — via Emergent LLM key
- 🔔 **PWA push notificaties** — geen externe key, VAPID generen
- 🔐 **AES-256 versleutelde PDFs** + QR verificatie


### QR-code URL + Auth Fixes (2026-02-26)
**Drie bugs gevonden bij testen van de QR-functionaliteit:**

- ✅ **Apartement kiosk-sticker QR onleesbaar** — `_public_url("/kiosk/huurder?apt=…")` gaf alleen het relatieve pad terug omdat backend geen `APP_PUBLIC_URL` env var heeft. **Fix:** endpoint accepteert nu `Request`, gebruikt `_company_base_url()` voor absolute URL + branded `/c/<slug>/` pad.

- ✅ **Company/Tenant poster QR miste subdomein** — `_company_base_url` knipte de eerste DNS-component af zodra de host >= 4 delen had ("vastgoed-app.preview.emergentagent.com" → "preview.emergentagent.com"). Dit was bedoeld voor "slug.app.surirent.sr" → "app.surirent.sr" recovery, maar brak elke preview-omgeving. **Fix:** strip-logica volledig verwijderd; path bevat al `/c/<slug>/…` dus branding werkt op elk (sub)domein.

- ✅ **Per-tenant poster gaf 401 "Niet ingelogd"** — `window.open(url)` stuurt geen `Authorization: Bearer` header en de cookie was niet altijd beschikbaar in nieuwe tabs. **Fix:** nieuwe `openAuthedPdf(path)` helper in `lib/api.js` — fetch met `responseType:'blob'` (inclusief Bearer header) + opent blob URL in nieuw tabblad. Toegepast op company poster + tenant poster knoppen.

- ✅ **Bonus:** legacy duplicaat code (dood) onderaan `server.py` opgeruimd (12 regels indentatie-fout die backend voorkwam te starten).

**Verified via QR decode (pyzbar):**
- APT_STICKER: `https://vastgoed-app.preview.emergentagent.com/c/surirent/kiosk/huurder?apt=…`
- COMPANY_POSTER + TENANT_POSTER: `https://vastgoed-app.preview.emergentagent.com/c/surirent/kiosk/huurder`
- Frontend network test: Tenant poster fetch → HTTP 200 application/pdf

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
