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

## Kiosk Medewerker PIN (Approval Workflow)
- First kiosk employee (Maria K.) PIN: `9999` (reset during iteration_17 voor test stabiliteit)
- Endpoints:
  - `POST /api/employees/{id}/kiosk-pin` body `{pin}` — admin sets/rotates PIN
  - `POST /api/kiosk/employee-verify` body `{pin}` — kiosk verifies, returns employee_id+name
  - `POST /api/kiosk/payments?employee_id=X&employee_pin=Y` — submit met pending_approval
  - `POST /api/payments/{id}/approve` body `{signature_data_url}` — admin approves
  - `POST /api/payments/{id}/reject` body `{reason}` — admin rejects
  - `GET /api/payments/pending-count` — admin bell badge

## Frontend Routes (dual-domain architecture)
Production:
- `https://surirent.sr/` — Marketing landing (marketing host only)
- `https://app.surirent.sr/` — Login (root of app host)
- `https://app.surirent.sr/login` — PIN keypad + admin login (toggle)
- `https://app.surirent.sr/admin` — Beheer dashboard (protected)
- `https://app.surirent.sr/kiosk` — Kiosk flow (requires kiosk_token in localStorage)
- `https://app.surirent.sr/onderteken/:token` — Contract sign page
- `https://app.surirent.sr/huurder` — Tenant login
- `https://app.surirent.sr/huurder/portaal` — Tenant dashboard

Preview / local (hybrid single-domain — both REACT_APP_MARKETING_HOST and REACT_APP_APP_URL empty):
- `/` — Marketing landing
- `/login`, `/admin`, `/kiosk`, `/onderteken/:token`, `/huurder`, `/huurder/portaal`
- Legacy `/vastgoed/*` paths redirect to the new root paths automatically.

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
