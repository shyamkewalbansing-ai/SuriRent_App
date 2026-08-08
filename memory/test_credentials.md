# Test Credentials

## ⚠️ Preview database is compleet gewist (2026-02-08)
Alle geregistreerde bedrijven + hun admins zijn verwijderd. Alleen deze twee accounts blijven.

## Superadmin
- **URL**: /login (admin tab)
- **Email**: `super@surirent.sr`
- **Password**: `super1234`
- **Role**: superadmin
- **Toegang**: SaaS-overzicht, alle bedrijven, Danger Zone reset

## Demo (gedeeld)
- **URL**: /login (demo tab) of klik "Demo proberen"
- **Email**: `demo@surirent.sr`
- **Password**: `demo1234`
- **Slug**: `demo`
- **Company**: Demo Vastgoed N.V.

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

## Wipe-all endpoint (superadmin only)
- `POST /api/superadmin/wipe-all-companies` body `{"confirm":"WIPE ALL COMPANIES"}`
- UI: SaaS Overzicht → "Danger Zone" → "Toon opties"
