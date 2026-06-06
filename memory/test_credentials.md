# Test Credentials

## Admin (Beheerder)
- **URL**: /login (admin tab)
- **Email**: `admin@vastgoed.sr`
- **Password**: `admin123`
- **Role**: admin
- **Company**: Dado Vastgoed Beheer (slug: `surirent`)

## Demo (gedeeld)
- **URL**: /login (demo tab) of klik "Demo proberen"
- **Email**: `demo@surirent.sr`
- **Password**: `demo1234`
- **Slug**: `demo`

## Kiosk PIN
- **Default PIN**: `1234`
- **Login flow**: `/login?target=kiosk` → PIN-pad

## Tenant Portal
- **URL**: `/huurder` of `/tenant-portal`
- **Login**: per huurder via email + wachtwoord (set bij onboarding)

## Auth endpoints (httpOnly cookies, ook Bearer fallback)
- `POST /api/auth/login` — admin/staff (cookie: `access_token`)
- `POST /api/auth/kiosk-pin` — kiosk PIN (cookie: `kiosk_token`)
- `POST /api/tenant-portal/login` — huurder (cookie: `tenant_token`)
- `POST /api/auth/logout` — wist alle 3 cookies
- `GET /api/auth/me` — werkt met cookie OF `Authorization: Bearer ...`
