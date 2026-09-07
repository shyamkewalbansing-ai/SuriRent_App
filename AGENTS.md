# SuriRent — Base44 Dev Environment

## Stack
- **Backend**: FastAPI (Python 3.11) + MongoDB (motor). Entry point: `backend/server.py`, uvicorn on port 8001.
- **Frontend**: Create React App (react-scripts 5 + craco) + Tailwind CSS. Dev server on port 3000.
- **DB**: MongoDB 7 (compose service `mongo`).

## Architecture (single-origin)
The frontend proxies all `/api/*` requests to the backend via `frontend/src/setupProxy.js`. `REACT_APP_BACKEND_URL` is intentionally empty so all API calls are relative. This keeps httpOnly cookie auth working same-origin.

## Required env vars (backend)
- `MONGO_URL`, `DB_NAME`, `JWT_SECRET` — set inline in `docker-compose.base44.yml` (local infra).
- `COOKIE_SECURE=0` — dev only (allows cookies over HTTP).
- `CORS_ORIGINS=*` — not strictly needed with the proxy but harmless.

## Optional secret
- `EMERGENT_LLM_KEY` — for LLM features (bank-statement OCR, AI QR-plate generation). Not required at boot. Delivered via `/run/base44/app.env`.

## The `emergentintegrations` package
Installed from a custom PyPI index (`https://d33sy5i8bnduwe.cloudfront.net/simple/`). It is imported lazily inside a few functions, so the app boots even if the key is absent.

## Background tasks disabled in dev
`DISABLE_TRIAL_REMINDERS`, `DISABLE_OVERDUE_PUSH`, `DISABLE_AUTO_INVOICE`, `DISABLE_DEMO_RESET`, `DISABLE_BILLING_CRON` are all set to `1` in compose to keep the dev environment quiet.

## Default credentials (seeded on first boot)
- Admin: `admin@vastgoed.sr` / `admin123`
- Superadmin: `super@surirent.sr` / `super123`
- Demo: `demo@surirent.sr` / `demo1234`
- Default kiosk PIN: `1234`

## Verify
```bash
# Backend health
curl -s http://localhost:3000/api/health   # via proxy
# Should return: {"ok":true,"service":"vastgoed-kiosk-api"}
```

## Common issues
- **Frontend blank / chunk errors**: CRA dev overlay is auto-suppressed in `index.js`. A hard refresh usually fixes stale chunk hashes.
- **pip install fails on emergentintegrations**: the custom index must be reachable. If not, remove the line from `requirements.txt` (the package is lazily imported).
- **Node 22 + CRA**: if `ERR_OSSL_EVP_UNSUPPORTED` appears, set `NODE_OPTIONS=--openssl-legacy-provider` in the frontend service environment.
