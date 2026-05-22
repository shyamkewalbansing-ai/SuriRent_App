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


---

## 10. White-label subdomains (wildcard DNS — optioneel)

SuriRent ondersteunt **per-bedrijf branding**: elke klant kan in zijn dashboard
onder **Branding** een eigen logo, kleur en app-naam instellen. Klanten kunnen
hun login-pagina vervolgens delen via:

- `https://app.surirent.sr/login?c=<bedrijfsslug>` *(werkt direct, geen DNS nodig)*
- `https://<bedrijfsslug>.app.surirent.sr/` *(vereist wildcard DNS — zie hieronder)*

De backend leest de slug uit de URL OF uit de `Host` header, en kiest de juiste
branding bij het laden van de pagina.

### 10.1 DNS instellen bij je registrar

Voeg bij je DNS-provider (bij de registrar of een aparte DNS-host zoals Cloudflare)
**twee** A-records toe:

| Type | Name           | Value            | TTL   |
|------|----------------|------------------|-------|
| A    | `app`          | `<server-IP>`    | 3600  |
| A    | `*.app`        | `<server-IP>`    | 3600  |

> De `*.app` wildcard zorgt dat álle subdomeinen onder `app.surirent.sr`
> (bv. `klantnaam.app.surirent.sr`) bij dezelfde server uitkomen.

Verifieer met:

```bash
dig +short klantnaam.app.surirent.sr   # moet je server-IP teruggeven
```

### 10.2 CloudPanel — wildcard vhost

CloudPanel staat geen `*` in de vhost-naam toe via de UI, maar wel via een
**"Server Name Indication"** alias in de Nginx config. Het simpelste recept:

1. Open in CloudPanel je bestaande `app.surirent.sr` site.
2. Ga naar **Vhost** → klik **Edit**.
3. Pas de `server_name` regel aan:

   ```nginx
   server_name app.surirent.sr *.app.surirent.sr;
   ```

4. Sla op en herlaad Nginx:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

### 10.3 TLS / wildcard SSL-certificaat

Voor `*.app.surirent.sr` heb je een **wildcard certificaat** nodig. Let's Encrypt
ondersteunt dit alleen via **DNS-01 challenge**:

```bash
sudo apt install -y certbot
sudo certbot certonly --manual --preferred-challenges=dns \
  -d app.surirent.sr -d "*.app.surirent.sr" \
  --agree-tos -m info@surirent.sr
```

Certbot vraagt je een `_acme-challenge` TXT-record toe te voegen bij je DNS-provider.
Plaats het, wacht ~60 seconden, druk Enter. Daarna heb je het certificaat in
`/etc/letsencrypt/live/app.surirent.sr/`.

Wijs CloudPanel naar dit certificaat (Site → SSL → "Existing Certificate") en
vul `fullchain.pem` + `privkey.pem` in.

**Auto-renewal** vereist een DNS-API hook (omdat manual DNS niet automatisch
verlengt). Voor Cloudflare bv.:

```bash
sudo apt install -y python3-certbot-dns-cloudflare
echo "dns_cloudflare_api_token = <token>" | sudo tee /root/.secrets/cf.ini
sudo chmod 600 /root/.secrets/cf.ini
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cf.ini \
  -d app.surirent.sr -d "*.app.surirent.sr"
```

Certbot installeert automatisch een cron-job die elke 60 dagen verlengt.

### 10.4 Test wildcard

```bash
# Spoof Host-header om te checken of backend de slug correct herkent
curl -s -H "Host: surirent.app.surirent.sr" https://app.surirent.sr/api/public/branding-by-host

# Verwacht:
# {"slug":"surirent","host":"surirent.app.surirent.sr","found":true,...}
```

Bezoek vervolgens `https://surirent.app.surirent.sr/` in je browser — de
LoginPage moet de bedrijfsbranding (logo + kleur + naam) van SuriRent tonen
zónder dat de gebruiker een code hoeft in te vullen.

### 10.5 Fallback gedrag

- **Onbekend subdomein** (`flutter.app.surirent.sr` waar geen "flutter" bedrijf
  bestaat) → toont standaard SuriRent branding + de "Bedrijfscode" picker
  onderaan, zodat de gebruiker handmatig zijn slug kan invullen.
- **Hoofddomein** (`app.surirent.sr`) zonder query — toont default branding +
  picker.
- **Met `?c=` query** — die wint altijd, ook over het subdomein. Handig voor
  direct-link campagnes.
