# Vastgoed Kiosk - PRD

## Original Problem Statement
"Ik wil de /vastgoed en de KIOSK van dit https://github.com/shyamkewalbansing-ai/erp.git hierop zetten met backend en frontend alleen de /vastgoed en de KIOSK, NIET DE ERP OF ANDERE DINGEN ALLEEN DE /vastgoed heb ik nodig en de kiosk"

User choice: Optie C — minimale herbouw (alleen vastgoed CRUD + kiosk flow, geen overige ERP modules).

## Architecture
- Backend: FastAPI + Motor (MongoDB), single `server.py`
- Auth: JWT (httpOnly cookies + Bearer header fallback) via bcrypt
- Frontend: React 19 + React Router 7 + Tailwind + framer-motion + lucide-react
- Database: MongoDB collections — `users`, `settings` (kiosk PIN), `apartments`, `tenants`, `payments`, `counters`

## User Personas
1. **Beheerder (Admin)** — Beheert appartementen, huurders en betalingen; logt in via email + wachtwoord.
2. **Huurder / Kiosk gebruiker** — Doet zelf-service betalingen via een fysieke kiosk; ontgrendelt met 4-cijferige PIN.

## Core Requirements (static)
- Marketing landing op `/vastgoed` (oranje/cream stijl uit originele repo)
- 4-cijferige PIN login flow voor kiosk
- JWT email/wachtwoord login voor beheerder
- CRUD voor appartementen, huurders en betalingen
- Kiosk flow: Welcome → Apartment Select → Tenant Overview → Payment Select → Confirm → Receipt
- Multi-valuta support (SRD, USD, EUR)
- Genummerde digitale kwitanties (KW{jaar}-{seq})

## What's Been Implemented (2026-05-20)
- ✅ Backend (`/app/backend/server.py`) — alle endpoints uit `/app/memory/test_credentials.md`
- ✅ Frontend pages: MarketingLanding, LoginPage, AdminDashboard (5 tabs), KioskLayout (6 screens)
- ✅ Seeded admin (`admin@vastgoed.sr`/`admin123`) en kiosk PIN `1234`
- ✅ Auth provider met localStorage + httpOnly cookie fallback
- ✅ Multi-valuta + maandelijks huur-saldo berekening
- ✅ Kiosk PIN change vanuit admin Settings tab
- ✅ data-testid op alle interactieve elementen
- ✅ Testing agent: 100% pass (backend pytest + frontend playwright)

## Routes
| Route | Description |
|-------|-------------|
| `/vastgoed` | Marketing landing (publiek) |
| `/vastgoed/login` | PIN keypad + admin login toggle |
| `/vastgoed/admin/*` | Beheer dashboard (JWT protected) |
| `/vastgoed/kiosk` | Kiosk flow (kiosk_token in localStorage) |

## Prioritized Backlog
### P0 (next)
- Geen blocking items

### P1 (nice to have)
- PDF kwitantie download/print
- Huurder portal (eigen login + betalingsgeschiedenis)
- Periode-betalingen rapport / export naar Excel
- Email/SMS herinneringen voor openstaande huur

### P2 (future)
- Multi-bedrijf (multi-tenant) zoals het originele systeem
- Foto upload bij appartement
- Onderhoud-tickets module
- Meterstanden module (gas/water/elektra)
- Splitsen `server.py` in routers (auth, apartments, tenants, payments, kiosk)
- CORS lock-down naar exacte frontend URL i.p.v. wildcard

## Tech Notes
- `_set_access_cookie` gebruikt `secure=False` (preview); productie zou `secure=True` moeten zijn (https)
- Receipt counter per jaar (`db.counters._id = "receipt_{year}"`); atomic via `find_one_and_update`
- `_calc_balance` rekent maanden vanaf `tenant.created_at`; geen aparte move-in date (kan later toegevoegd)
