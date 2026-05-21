# SuriRent — Productie deployment op CloudPanel

> Doel: SuriRent draaien op je eigen VPS via CloudPanel met 2 vhosts:
> - `https://surirent.sr` → marketing landing
> - `https://app.surirent.sr` → kiosk + beheer + huurportaal + API

Beide vhosts serveren **dezelfde** React build (één codebase, één deploy).
De React app detecteert het domein en toont de juiste routes.

## 1. Server voorbereiden

```bash
sudo apt update && sudo apt install -y python3.11 python3.11-venv python3-pip nodejs npm
sudo npm install -g yarn pm2

# MongoDB (lokale install voor 1 server)
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb http://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

## 2. Code clonen & dependencies

```bash
cd /home/cloudpanel
git clone https://github.com/<jouw-org>/surirent.git surirent
cd surirent

# Backend
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# Backend .env
cp .env.example .env
nano .env
#   ↳ Vul JWT_SECRET (openssl rand -hex 32), SETTINGS_ENCRYPTION_KEY,
#     PDF_AES_PASSWORD, ADMIN_EMAIL/PASSWORD, APP_PUBLIC_URL, CORS_ORIGINS.

# Frontend
cd ../frontend
cp .env.example .env
nano .env
#   ↳ REACT_APP_BACKEND_URL=https://app.surirent.sr
#     REACT_APP_MARKETING_HOST=surirent.sr
#     REACT_APP_APP_URL=https://app.surirent.sr
yarn install
yarn build
```

De build output zit in `/home/cloudpanel/surirent/frontend/build/`.

## 3. Backend draaien als service

```bash
cd /home/cloudpanel/surirent/backend
pm2 start --name surirent-api \
  --interpreter ./.venv/bin/python \
  -- ./.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
pm2 save
pm2 startup
```

> ⚠️ **Belangrijk**: PIN-throttle + Mope-webhook-state zijn in-memory. Bij
> meerdere workers wordt de state per-worker bijgehouden. Voor multi-worker
> productie: zet `--workers 1` of migreer throttle/state naar Redis.

## 4. CloudPanel vhosts

### vhost 1 — Marketing (`surirent.sr`)

CloudPanel → **+ Add Site** → **Static Site**:
- Domain: `surirent.sr`
- Document root: `/home/cloudpanel/surirent/frontend/build`
- SSL: Let's Encrypt → ✓ Force HTTPS

Geen reverse proxy nodig — het is een statische SPA. Voeg in CloudPanel vhost
config een fallback toe (Nginx → Custom):
```
location / {
  try_files $uri $uri/ /index.html;
}
```

### vhost 2 — App + API (`app.surirent.sr`)

CloudPanel → **+ Add Site** → **Reverse Proxy** (of Static + custom):
- Domain: `app.surirent.sr`
- SSL: Let's Encrypt → ✓ Force HTTPS

In **Nginx → Custom** configuratie:

```nginx
# Statische frontend
root /home/cloudpanel/surirent/frontend/build;

location / {
  try_files $uri $uri/ /index.html;
}

# Backend API — alle /api/* requests doorzetten naar FastAPI
location /api/ {
  proxy_pass http://127.0.0.1:8001;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 90;
}

# Service worker moet altijd vers zijn (geen cache)
location = /sw.js {
  add_header Cache-Control "no-cache";
  expires off;
}

# PWA assets
location /kiosk-icons/ {
  expires 7d;
  add_header Cache-Control "public";
}
```

## 5. DNS

Bij je domeinregistrar (bv. Hostnet, Domains.com):
```
Type  Naam               Waarde
A     surirent.sr        <IP van je VPS>
A     www.surirent.sr    <IP van je VPS>
A     app.surirent.sr    <IP van je VPS>
```

Wacht 5-60 minuten op DNS propagatie, dan SSL activeren in CloudPanel.

## 6. Custom domeinen voor klanten

Wanneer een klant zijn eigen domein wil (`vastgoed.klantbedrijf.com`):

1. **DNS aan klantkant**:
   ```
   A   vastgoed.klantbedrijf.com   <IP van je VPS>
   ```
2. **CloudPanel** → site `app.surirent.sr` → **Domains** → **+ Add Domain**
   → `vastgoed.klantbedrijf.com` → SSL: Let's Encrypt
3. **In de app** (als die klant): Instellingen → Eigen domein → vul in
   `vastgoed.klantbedrijf.com` → klik **Test verbinding** (controleert DNS).

## 7. MongoDB backup (cronjob)

```bash
sudo tee /etc/cron.daily/surirent-backup >/dev/null <<'BASH'
#!/bin/bash
DATE=$(date +%F)
mongodump --db vastgoed_kiosk --out /home/cloudpanel/backups/$DATE
find /home/cloudpanel/backups -mindepth 1 -maxdepth 1 -mtime +30 -exec rm -rf {} \;
BASH
sudo chmod +x /etc/cron.daily/surirent-backup
```

## 8. Updaten naar nieuwe versie

```bash
cd /home/cloudpanel/surirent
git pull
cd backend && source .venv/bin/activate && pip install -r requirements.txt
cd ../frontend && yarn install && yarn build
pm2 restart surirent-api
```

Service worker bumpt zelf de cache versie bij elke deploy (zie `sw.js`,
constante `CACHE_VERSION`). Gebruikers krijgen automatisch de nieuwste
versie bij hun volgende bezoek.

## 9. Health check

```bash
curl -i https://app.surirent.sr/api/health
# {"ok":true,"service":"vastgoed-kiosk-api"}

curl -I https://surirent.sr/
# 200 OK + Content-Type: text/html
```
