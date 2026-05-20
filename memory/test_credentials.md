# Test Credentials - Vastgoed Kiosk (Multi-Company SaaS)

## Superadmin (manages all companies)
- Email: `super@surirent.sr`
- Password: `super123`
- Role: `superadmin`
- `company_id`: null (can simulate any company via header `x-active-company: <company_id>`)

## Admin Company A — SuriRent N.V. (default)
- Email: `admin@vastgoed.sr`
- Password: `admin123`
- Role: `admin`
- Company slug: `surirent`

## Admin Company B — Test Vastgoed B (created in iteration 5 for isolation tests)
- Email: `adminb@test.sr`
- Password: `adminb123`
- Role: `admin`
- Company slug: `test-vastgoed-b`

## Kiosk PIN
- Default PIN (Company A): `1234`
- Each company has its OWN kiosk PIN, unique across all companies.

Endpoints:
- `POST /api/auth/kiosk-pin` body `{"pin":"1234"}` → matches PIN against all companies, returns token with that company's scope.
- `POST /api/auth/kiosk-set-pin` (admin auth required) — sets PIN for active company; rejects if PIN already used by another company.

## Tenant Portal
- Login URL: `/huurder`
- Dashboard URL: `/huurder/portaal`
- Test tenant (Company A): `Jan de Vries` (email `jan@example.sr`, phone `+597 8001234`, PIN `5678`)
- Login accepteert email of telefoon (volledig string OF alleen cijfers) — case-insensitive voor email.

## Frontend Routes
- `/vastgoed` — Marketing landing
- `/vastgoed/login` — PIN keypad + admin login (toggle)
- `/vastgoed/admin` — Beheer dashboard (protected)
- `/vastgoed/kiosk` — Kiosk flow (requires kiosk_token in localStorage)
- `/huurder` — Tenant login
- `/huurder/portaal` — Tenant dashboard

## Multi-Company Architecture Notes
- `get_current_user` sets `user["active_company_id"]`:
  - For normal admin → equal to `user["company_id"]`
  - For superadmin → comes from header `x-active-company` or query `?company_id=...`, falls back to `user["company_id"]` (which is null → unscoped, sees everything).
- `scope(user)` returns `{"company_id": active_company_id}` or `{}` (unscoped, only when superadmin has no header).
- All tenant-scoped collections (apartments, tenants, payments, contracts, invoices, employees, salaries, deposits, maintenance, kasgeld, ai_sessions, push_subs) carry `company_id`.

## API Endpoints
### Auth
- `POST /api/auth/login` `{email, password}` → `{token, user, company}`
- `POST /api/auth/register` `{name, email, password}` → joins default company
- `POST /api/auth/logout`
- `GET /api/auth/me` (auth) → `{...user, active_company_id, active_company}`
- `POST /api/auth/kiosk-pin` `{pin}` → `{token, company}`
- `POST /api/auth/kiosk-set-pin` `{pin}` (auth)

### Companies (superadmin only)
- `GET /api/companies` — list with `stats {apartments, tenants, admins}`
- `POST /api/companies` `{name, slug, plan, active, contact_email, contact_phone, address}`
- `PUT /api/companies/{cid}`
- `DELETE /api/companies/{cid}` (refuses if data exists)
- `POST /api/companies/{cid}/seed-admin` `{name, email, password}` — create first admin for company

### Apartments, Tenants, Payments, Contracts, Invoices, Employees, Salaries, Deposits, Maintenance, Kasgeld
All standard CRUD, automatically scoped by `company_id` via `scope(user)`.

### Tenant Portal
- `POST /api/tenant-portal/login` `{identifier, pin}` → `{token, tenant}`
- `GET /api/tenant-portal/me`
- `GET /api/tenant-portal/overview`
- `GET /api/tenant-portal/payments`
- `GET /api/tenant-portal/contracts`
- `GET/POST /api/tenant-portal/maintenance`
- `POST /api/tenant-portal/logout`

Frontend sends Bearer token from localStorage (`admin_token`, `kiosk_token`, `tenant_token`).
