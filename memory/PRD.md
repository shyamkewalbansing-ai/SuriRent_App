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

## Prioritized Backlog

### Fase 2 (volgende sessie — integraties)
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
