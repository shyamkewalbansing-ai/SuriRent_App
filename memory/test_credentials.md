# Test Credentials - Vastgoed Kiosk

## Admin (Beheerder) Login
- Email: `admin@vastgoed.sr`
- Password: `admin123`
- Role: `admin`

Login endpoint: `POST /api/auth/login`
Returns JSON `{token, user}` + sets `access_token` httpOnly cookie.

## Kiosk PIN
- Default PIN: `1234`

Verify endpoint: `POST /api/auth/kiosk-pin` body `{"pin":"1234"}`
Returns JSON `{token}` + sets `kiosk_token` httpOnly cookie.

## Routes
- `/vastgoed` — Marketing landing
- `/vastgoed/login` — PIN keypad + admin login (toggle)
- `/vastgoed/admin` — Beheer dashboard (protected)
- `/vastgoed/kiosk` — Kiosk flow (requires kiosk_token in localStorage)

## API Endpoints
### Auth
- `POST /api/auth/login` `{email, password}` → `{token, user}`
- `POST /api/auth/register` `{name, email, password}` → `{token, user}`
- `POST /api/auth/logout`
- `GET /api/auth/me` (auth)
- `POST /api/auth/kiosk-pin` `{pin}` → `{token}`
- `POST /api/auth/kiosk-set-pin` `{pin}` (auth)

### Apartments (auth)
- `GET/POST /api/apartments`
- `PUT/DELETE /api/apartments/{id}`
- `POST /api/apartments/{id}/assign-tenant` `{tenant_id}`
- `POST /api/apartments/{id}/remove-tenant`

### Tenants (auth)
- `GET/POST /api/tenants`
- `PUT/DELETE /api/tenants/{id}`
- `GET /api/tenants/{id}/balance`

### Payments
- `GET /api/payments` (auth)
- `POST /api/payments` (auth) — admin payment
- `GET /api/admin/stats` (auth)

### Kiosk public/session
- `GET /api/kiosk/apartments` — list with tenants
- `GET /api/kiosk/tenants/{id}/overview` — overview + balance
- `POST /api/kiosk/payments` (kiosk session) — create payment from kiosk
- `GET /api/kiosk/receipts/{id}` — receipt

## Tenant Portal
- Login URL: `/huurder`
- Dashboard URL: `/huurder/portaal`
- Auth: 4-cijferige PIN ingesteld door admin via `POST /api/auth/tenant-set-pin`
- Test tenant: `Jan de Vries` (email `jan@example.sr`, phone `+597 8001234`, PIN `5678`)
- Login accepteert email of telefoon (volledig string OF alleen cijfers) — case-insensitive voor email
- Endpoints (Bearer tenant_token):
  - `POST /api/tenant-portal/login` `{identifier, pin}` → `{token, tenant}`
  - `GET /api/tenant-portal/me`
  - `GET /api/tenant-portal/overview` — tenant + apartment + balance
  - `GET /api/tenant-portal/payments` — alleen eigen betalingen
  - `GET /api/tenant-portal/contracts` — alleen eigen contracten
  - `GET/POST /api/tenant-portal/maintenance` — eigen tickets
  - `POST /api/tenant-portal/logout`

Frontend sends Bearer token from localStorage (`admin_token` and `kiosk_token`).
