# Vastgoed Kiosk - PRD

## Session 2026-06-03 (v28) — Full Editable Landing + Per-Company Public Landings ✅

### 1. SuriRent hoofdpagina volledig inline-editable
Uitgebreid van ~12 paden → **103 data-edit-path** velden in MarketingLandingV2.jsx:
- TopHeader: logo (EditableImage), `v2.brand.name_prefix/suffix/legal_suffix/cta_login`
- Greeting card: `v2.greeting.subtitle/whatsapp_label/popular_label`
- ProductGrid: 8 cards × {label, desc} (`v2.product.cards.0..7`)
- FeatureRows: 5 rows × {eyebrow, title, desc, bullets[], img} (`v2.features.rows.0..4`)
- KioskSection: eyebrow/title_line1/title_highlight/subtitle + 4 steps × {label, desc, img}
- FAQSection: dynamische items × {q, a}
- Footer: branding + email/phone/address/rating_label

### 2. Per-bedrijf landing op custom domain (NIEUW)
**Architectuur**:
- `companies.custom_domain` (uniek genormaliseerd: lowercase, geen www., geen port)
- `company_landings` collectie: {id, draft, published, updated_at, published_at}
- `landing_leads` collectie: publieke leads vanuit het contactformulier
- `App.js useTenantLandingResolver()`: bij mount checkt host → custom_domain match → rendert direct `<TenantPublicLanding />` ipv alle routes. Skipt system hosts (surirent.sr, *.surirent.sr, emergent preview, localhost).

**Backend endpoints**:
- `GET /api/public/company-landing` — host-based, geen auth, returnt {found, company, apartments[vacant+available], content}
- `POST /api/public/landing-lead` — geen auth, vereist {company_id, name, phone}
- `GET/PUT /api/companies/me/landing` — admin draft management
- `POST /api/companies/me/landing/{publish,discard}` — promote/reset
- `PUT /api/companies/me/custom-domain` — set/clear domain met dup-check (409)
- `GET /api/companies/me/landing-apartments` — preview-helper
- `GET /api/companies/me/landing-leads` + `POST .../{lead_id}/status` — lead inbox
- Superadmin variants: `/api/superadmin/companies/{cid}/landing` GET/PUT/publish

**Frontend**:
- `TenantPublicLanding.jsx` — apartement-rental showcase template met Hero (Unsplash bg), StatsBar, ApartmentsGrid (auto-gevuld uit vacant units), About, ContactSection (lead form), Footer. Volledig editable in `?edit=1` mode. Branding `primary_color` toegepast op accents.
- `MijnLanding.jsx` — admin editor: custom-domain card met DNS-instructies (CNAME → surirent.sr) + iframe-based WYSIWYG editor (zelfde patroon als LiveLandingEditor).
- Sidebar item "Mijn Landing" toegevoegd onder Account-groep.

### Test Results (Iteration 32)
- **Backend**: 18/18 pytest PASS (`/app/backend/tests/test_iter32_tenant_landing.py`)
  - Bug gefixed: `list_my_landing_leads` had `async for` over `to_list()` Future → vervangen door `await ... .to_list()`
- **Frontend**: Mijn Landing editor + iframe + inline edit + custom domain save + public lead form + no regressies
- **End-to-end**: custom_domain=`surirent-demo.com` → PUT landing → publish → `/api/public/company-landing?host=surirent-demo.com` returnt published content + filtered apartments ✓


## Session 2026-06-03 (v27) — Superadmin restructuring + Live Landing Editor ✅

### 1. Sidebar Reorganisatie (SaaS Beheer split)
Voorheen had superadmin één combined "SaaS Beheer" sidebar item met interne tabs.
Nu zijn die tabs **individuele sidebar items** in exacte volgorde:
- SaaS Overzicht (NEW — live dashboard)
- Bedrijven
- OCR-goedkeuring (Subscriptions viewMode='pending')
- SaaS Facturen (Subscriptions viewMode='invoices')
- SaaS Betalingen (Subscriptions viewMode='payments')
- Pakketten
- Landing Editor
- SaaS Instellingen

Implementatie: `Subscriptions.jsx` accepteert nieuwe `viewMode` prop — bij specifieke
mode wordt de interne tab-balk verborgen + heading wordt aangepast.
Default landing-tab voor superadmin: `saas_overview` (was `subscriptions`).

### 2. SaaS Overzicht Dashboard (NIEUW)
`/app/frontend/src/pages/vastgoed/admin/SaasOverview.jsx`
- KPI cards: MRR, Online nu (live!), Proefperiode, Verlopen/Opgezegd
- Action cards: Wacht op OCR-keuring, Open facturen, Betaalde facturen
- **Live presence**: "Nu online" sectie met groene pulse + gesorteerd op recent
- Trial expiring binnen 3 dagen — gele warning sectie
- "Recent gezien" lijst (offline bedrijven, gesorteerd op last_seen_at desc)
- Auto-refresh elke 15s

### 3. Presence Tracking
`get_current_user()` middleware update:
- Update `users.last_seen_at` + `companies.last_seen_at` op elke API call (throttled 60s)
- Nieuwe endpoint `GET /api/superadmin/online-status` → returns per-company online status
- Online threshold = 5 min
- `GET /api/superadmin/overview` uitgebreid met `online_now`, `open_invoices`, `pending_ocr`

### 4. Live WYSIWYG Landing Editor
**Probleem opgelost**: oude LandingEditor.jsx (672 regels form-input) bewerkte velden die
de nieuwe Brutalist `MarketingLandingV2.jsx` NIET gebruikte → live preview kwam niet overeen.

**Nieuw**: `/app/frontend/src/pages/vastgoed/admin/LiveLandingEditor.jsx`
- Iframe-based editor — toont de echte landing in een iframe via `/?edit=1`
- Device switcher: Desktop / Tablet / Mobiel
- Status badge: Live=Concept / Niet opgeslagen / Onuitgegeven
- Autosave: 1.5s debounce na elke patch → POST `/api/superadmin/landing/content`
- Publish & Discard knoppen
- Image picker modal (klik op afbeelding in iframe → upload via parent)

**Inline edit infrastructure**: `/app/frontend/src/lib/landing-editable.jsx`
- `<EditableProvider editMode initialContent onPatch>` — wraps the landing page
- `<EditableText path="v2.hero.title" fallback="...">` — contenteditable spans in edit mode
- `<EditableImage path="..." fallback="...">` — klikbare image overlay in edit mode
- `useLandingContent(editMode)` hook — fetch published OR draft content
- PostMessage protocol parent↔child:
  - child → parent: `{type:'landing-edit-patch', path, value}` / `{type:'landing-edit-image-request', path, current}`
  - parent → child: `{type:'landing-edit-reset', content}` / `{type:'landing-edit-image-reply', path, url}`

**MarketingLandingV2.jsx editable fields**:
- `v2.hero.eyebrow`, `v2.hero.title_line1/2/highlight`, `v2.hero.subtitle`, `v2.hero.cta_primary/secondary`
- `v2.pricing.eyebrow`, `v2.pricing.title`
- `v2.features.eyebrow`, `v2.features.title`
- `v2.footer.tagline`, `v2.footer.rating_label`, `v2.footer.email/phone/address`

### End-to-end Verified (Iteration 31)
- 8/8 backend tests PASS (`/app/backend/tests/test_iter31_saas_overview_landing.py`)
- Frontend: all sidebar items, all sub-pages, full inline edit→save→publish→discard cycle PASS
- Admin regression: BASE_TABS still load, Backup & Herstel still works, no super-only tabs leak
- Presence: admin login updates company last_seen → online_now KPI increments


## Session 2026-06-02 (v26) — Plan limits + cronjob + backup/restore ✅

### 1. Plan Limits (Hard-block)
- `plan_catalog.limits`: max_apartments, max_tenants, max_locations, max_employees, allow_kiosk, allow_ocr, allow_shelly, allow_branding, allow_backup
- Helpers `_enforce_count_limit()` + `_require_plan_feature()` raise HTTP 403 met code='plan_limit_reached' of 'plan_feature_locked'
- Inject in POST /apartments, /tenants, /locations, /employees
- PlansAdmin.jsx LimitsEditor: numerieke velden + ∞ knop voor unlimited + boolean toggles per feature
- Backfill: bestaande plan_catalog rows zonder limits krijgen auto defaults

### 2. Cronjob 06:00 dagelijks
- `_daily_billing_checks_loop()` toegevoegd aan lifespan
- Berekent slaaptijd naar 09:00 UTC (= 06:00 Suriname/UTC-3)
- Runt `_enforce_billing_expirations()` automatisch
- Disable via env `DISABLE_BILLING_CRON=1`

### 3. Backup & Restore
- GET /api/companies/me/backup → JSON dump van alle tenant-scoped collections + users + company
- POST /api/companies/me/restore met mode='merge' (upsert) of 'replace' (wipe+insert)
- POST /api/superadmin/migrate-company-data: superadmin migreert data tussen bedrijven
- Plan feature `allow_backup` required (geldt ook voor restore)
- Frontend BackupRestore.jsx: download knop + upload met mode switcher + waarschuwing
- Toegevoegd aan Account-groep in sidebar

### End-to-end Verified
- starter limits PUT → opgeslagen ✓
- backup download → JSON met 4 apartments, 3 tenants, 339 payments etc ✓
- restore merge → succesvol, 0 changes (data identiek) ✓
- backfill resolver: legacy plan_id 'pro' valt nu terug op eerste actieve plan ✓

## Session 2026-06-02 (v25) — Volledige SaaS workflow ✅

### A. Sidebar bug fix
- `SIDEBAR_GROUPS` had geen group voor superadmin tabs → Landing Editor + SaaS Instellingen verdwenen weggefilterd.
- **Fix**: nieuwe `saas` group toegevoegd: `['subscriptions', 'companies', 'plans', 'landing_editor', 'saas_settings']`.

### B. DB-driven plan catalog + Pakketten beheer UI
- Nieuwe collection `db.plan_catalog` (seeds vanuit `PLAN_PRICES` op eerste call).
- Endpoints: `GET/POST /api/superadmin/plans`, `PUT/DELETE /api/superadmin/plans/{id}`.
- Soft-delete: als een plan in gebruik is wordt het op inactief gezet ipv hard verwijderd.
- Nieuwe page `PlansAdmin.jsx` met inline edit + create + delete UI.
- Tab "Pakketten" toegevoegd aan SUPER_TABS.
- `GET /api/billing/plans` (public) leest nu uit DB; landing page Pricing blijft automatisch werken.

### C. Billing enforcement middleware (KRITIEK)
- `get_current_user()` checkt billing_status, returnt HTTP 402 `{code:'billing_blocked'}` voor cancelled/expired/past_due.
- BILLING_EXEMPT routes: `/auth/`, `/billing/`, `/companies/me/branding`, `/public/`, `/health`.
- Frontend `api.js` interceptor vangt 402 → custom event 'billing-blocked' + localStorage.
- `BillingBlockedScreen.jsx`: full-screen UI met WhatsApp/email contact + uitlog + refresh.
- AdminDashboard rendert BillingBlockedScreen vóór alle andere UI (skipped voor superadmin/impersonators).

### D. Abonnement workflow
- Self-cancel: `POST /api/companies/me/cancel-subscription` (alias `/{cid}` met `cid='me'`).
- Reactivate: `POST /api/companies/{cid}/reactivate-subscription` (superadmin).
- Expiry cronjob: `POST /api/superadmin/run-billing-checks`.
- `_saas_email()` helper voor SaaS-platform emails via SMTP settings.
- `MijnAbonnement.jsx`: gevarenzone met rode "Abonnement opzeggen" knop.
- `/api/billing/me` exposed nu `next_billing_date`, `cancelled_at`, `reactivated_at`.

### Bug fixes na testing agent feedback (iter 30)
- Route-ordering bug: `/companies/me/cancel-subscription` werd niet bereikt → fix via cid=='me' detection in /{cid} route.
- renews_at null in billing/me → fix: lees next_billing_date als fallback.

### Verified end-to-end
- self-cancel 200 ✓ → admin endpoint 402 ✓ → reactivate 200 ✓ → run-billing-checks 200 ✓

## Session 2026-06-01 (v20) — Device QR token: PWA scant zonder PIN/login ✅
- **User request**: "QR scan vanaf PWA moet desktop autologinnen zonder PIN/login"
- **Backend**:
  - Nieuwe endpoint `POST /api/auth/device-qr-token/issue` (auth) → genereert bcrypt-hashed long-lived (90 dagen) token gekoppeld aan user_id, slaat op in `db.device_qr_tokens`, retourneert raw token 1x.
  - `POST /api/auth/qr/claim/{token}` accepteert nu naast Bearer ook header `X-Device-QR-Token` als auth fallback. Backend zoekt matching hash, valideert expiry, resolved user, claimt sessie.
  - Nieuwe helper `get_current_user_optional()` returnt None ipv 401.
- **Frontend**:
  - `auth.jsx`: na elke `login()` automatisch `issueDeviceQrTokenSilently()` → slaat raw token in localStorage onder `device_qr_token`.
  - `LoginPage.verify()` (Personal PIN flow): zelfde — token uitgegeven na PIN login.
  - `LoginPage.QrScannerModal.handleScan()`: voegt `X-Device-QR-Token` header toe bij claim call.
  - `QrLinkPage`: detecteert device_qr_token in localStorage, auto-claimt direct (geen redirect naar /login meer als token aanwezig is).
- **Security**: token kan ALLEEN /auth/qr/claim aanroepen, geen andere endpoints. Hash-based (bcrypt). 90 dagen TTL. Revocable door token uit DB te verwijderen.
- **Verified end-to-end**: login → device_qr_token in localStorage → wis admin_token (simuleert verlopen sessie) → bezoek qr_url → auto-claim succes met device_qr_token, desktop status=claimed met admin@vastgoed.sr ✓

## Session 2026-06-01 (v19) — QR cross-device login + witte balk fix ✅

### Bug A — Witte strook onderaan PWA (PinLanding op iPhone)
- **Root cause**: `position: fixed; inset: 0` op iOS standalone PWA dekt niet altijd de home-indicator gesture-zone. body/html bg was wit (CSS default voor `@media (display-mode: standalone)`).
- **Fix**: `PinLanding` mount useEffect zet nu `document.documentElement.style.backgroundColor` + `document.body.style.backgroundColor` op `primary` (brand kleur). Cleanup on unmount herstelt vorige waarden.

### Bug B — QR code scan vanaf telefoon claimde desktop sessie niet
- **Root cause**: race-conditie tussen 2 redirects na login:
  1. `submit()` navigeert naar `/qr-link?token=X` (mijn fix uit v18)
  2. Parent useEffect (`LoginPageContent`) ziet `user` set → navigeert `replace:true` naar `/admin`
  3. `/admin` wint omdat `replace:true` overschrijft de history entry
- **Fix 1**: Parent useEffect controleert nu eerst `sessionStorage.pending_qr_token` — als gezet, niet auto-redirecten naar `/admin`.
- **Fix 2**: `submit()` removed niet meer `pending_qr_token` (laat het aan QrLinkPage).
- **Fix 3**: `QrLinkPage` doet nu **auto-claim** wanneer hij mount met token + admin_token + sessionStorage match. Gebruiker hoeft geen extra "Bevestig" knop te tikken. Wrapped `claim` in `useCallback` voor stable identity.
- **Verified end-to-end**: phone scant QR → /qr-link → /login → submit → /qr-link?token=X → auto-claim → desktop QR status = `claimed`, `access_token` present, `user.email=admin@vastgoed.sr` ✓

## Session 2026-06-01 (v18) — PWA branded recovery via post-login redirect ✅
- **Probleem**: iOS 16.4+ isoleert PWA storage van Safari → mijn v17 localStorage-redirect werkt in Safari maar NIET in de PWA (lege storage).
- **Definitieve fix**: 
  - Bij `login()` in `auth.jsx` slaan we nu de bedrijfs-slug op in `localStorage.pwa_company_slug` (uit `data.company.slug`).
  - In `LoginPage.submit()`: na succesvolle login, als de gebruiker op generieke `/login` zit en zijn JWT heeft een bedrijfs-slug, `window.location.assign('/<slug>/admin')` → hard-navigate naar branded route. Dit triggert BrandedShell → activeert branding + stored_slug in PWA storage.
- **Flow voor de gebruiker met huidige (verkeerde) PWA install**:
  1. Open PWA (opent generic `/login?source=pwa&view=admin`)
  2. Login met email + wachtwoord
  3. Auto-redirect naar `/<slug>/admin` ← branded ✓
  4. PWA storage nu gevuld met `pwa_company_slug`
  5. Daarna: logout → branded login, elke PWA-start → branded PIN ✓
- **Verified**: lege localStorage → /login PWA → email login → `/surirent/admin` met branded sidebar ✓

## Session 2026-06-01 (v17) — PWA install fix #3: in-app slug recovery vangnet ✅
- **Probleem**: iOS Safari heeft de oude (verkeerde) start_url `/login` gecaptured bij een eerdere install. Na fix v15/v16 deïnstall + reïnstall: iOS Safari kan de manifest **niet altijd opnieuw lezen** vanwege OS-level caching, dus de PWA bleef openen op `/login`.
- **Vangnet-fix**: In `LoginPage.jsx` toegevoegd: bij mount, als URL = `/login` (geen slug) maar `localStorage.pwa_company_slug` bevat een geldige slug → direct `window.location.replace('/<slug>/login' + query)`. 
- **Hoe werkt het**: BrandedShell zet `pwa_company_slug='surirent'` zodra de gebruiker ooit `/surirent/...` bezocht. Op de iOS PWA, wanneer hij verkeerd opent op `/login`, leest LoginPage deze stored slug en redirect intern naar `/surirent/login?source=pwa&view=admin` — met behoud van alle query params (source=pwa, view=admin, target=kiosk, etc.).
- **Verified**: `/surirent/login` bezoek → stored_slug=`surirent` → navigeer naar `/login?source=pwa&view=admin` → auto-redirect naar `/surirent/login?source=pwa&view=admin` met GOPI APPARTEMENT branding ✓.
- **Gevolg**: zelfs als iOS de oude install met `/login` start_url heeft, werkt de app nu meteen — geen extra deïnstall/install cyclus meer nodig.

## Session 2026-06-01 (v16) — PWA install fix #2: SW cache strategy ✅
- **Probleem**: gebruiker meldde dat na fix v15 (slug-aware manifest endpoint) de installed PWA op iOS Safari nog steeds opent op `/login` ipv `/surirent/login`.
- **Diepere root cause**: Service Worker `surirent-v77` deed `stale-while-revalidate` voor HTML + JS → bij PWA install las iOS Safari de **gecachete oude index.html + oude bundle.js**, die de manifest URL OVERSCHRIJVEN naar `/manifest-beheer.json` (zonder slug). iOS 16.4+ leest manifest start_url BIJ install, dus de install krijgt de verkeerde start_url.
- **Fix**: 
  - SW versie naar `v79` (bumpt cache).
  - HTML + JS strategie veranderd naar **network-first** (was stale-while-revalidate). Bij online: altijd fresh code. Bij offline: cache fallback. Iets latente eerste paint, maar correctheid wint.
  - `activate` handler: bij SW UPDATE (niet first install) post nu SW_ACTIVATED message met `reload: true` voor alle open clients.
- **Gevolg**: gebruikers moeten oude install **deïnstalleren + één keer fresh laden** zodat de nieuwe SW activeert + alle oude cache wist, en pas **dan** opnieuw installeren. iOS captures manifest start_url at install time — kan niet retroactief gefixt worden.

## Session 2026-06-01 (v15) — 3 bugfixes: PWA install, logout redirect, QR scan URL ✅

### Bug A — PWA install vanaf `/<slug>/login` opent nog steeds `/login`
- **Root cause**: blob: URL manifest is document-scoped — Chrome kon de geïnstalleerde PWA's manifest niet later refetchen, en op iOS Safari werkte de blob URL helemaal niet. Statische manifests `/manifest-{role}.json` hadden hardcoded `start_url: /login`.
- **Fix**: Nieuwe **backend endpoint** `GET /api/pwa/manifest?role=X&slug=Y` returnt slug-aware manifest met `start_url`/`scope`/`id` correct gemuteerd. Frontend (`pwa-manifest.js` + `index.html`) zet `<link rel="manifest">` naar deze stabiele HTTP URL ipv blob URL.
- **Verified**: `/api/pwa/manifest?role=beheer&slug=surirent` → `start_url: /surirent/login?source=pwa&view=admin`, `scope: /surirent/`.
- **Belangrijk voor gebruiker**: oude PWA installs moeten **eerst worden gedeïnstalleerd** voordat de nieuwe (slug-aware) install actief wordt.

### Bug B — Na logout redirect naar `/login` ipv `/<slug>/login`
- **Root cause**: `Protected` component in `App.js` had hardcoded `<Navigate to="/login" replace />`. Bij `user=null` (logout) wint deze synchroon-tijdens-render redirect van `doLogout`'s `navigate('/login')` (die wel slug-aware was).
- **Fix**: `Protected` detecteert nu de slug uit `location.pathname` via `brandedSlugFromPath()` en redirect naar `/<slug>/login`.
- **Bonus**: `api.js` 401-interceptor ook slug-aware gemaakt (was eerder hardcoded `/login?stale=1` voor `path.startsWith('/admin')`, herkende `/surirent/admin` niet).
- **Verified**: Login op `/surirent/login` → `/surirent/admin` → klik logout → land op `/surirent/login` ✓.

### Bug C — QR-code scan werkt niet vanaf telefoon (verkeerde host)
- **Root cause**: Backend `/auth/qr/create` gebruikte `Origin` header als base URL. Cloudflare-worker `preview.emergentagent.com` herschrijft `Origin` echter naar de **cluster-interne** host (`vastgoed-app.cluster-1.preview.emergentcf.cloud`), die niet bereikbaar is vanaf de telefoon van de gebruiker. QR encodeerde dus een dead-link.
- **Fix**: Header-prioriteit aangepast naar `FRONTEND_BASE_URL` → **`X-Forwarded-Host`** (publiek) → `Referer` → `Origin` → `Host`. `X-Forwarded-Host` bevat de echte publieke host die door de ingress wordt doorgegeven.
- **Verified**: `POST /api/auth/qr/create` returnt nu `qr_url: https://vastgoed-app.preview.emergentagent.com/qr-link?token=...`.

## Session 2026-06-01 (v14) — Bugfix: PWA install vanaf tenant login → slug-aware manifest ✅
- **Bug**: bij PWA install vanaf `/<slug>/login` (bedrijfs-tenant login) opende de geïnstalleerde app `/login` (generiek) ipv `/<slug>/login`.
- **Root cause**: `usePwaManifest()` hook in `lib/pwa-manifest.js` overschreef de slug-aware blob-manifest (gezet door inline `index.html` script) met statische `/manifest-{role}.json` (hardcoded `start_url: /login?view=admin`).
- **Fix**: `usePwaManifest` doet nu zelf de slug + role detectie, fetcht `manifest-{role}.json`, muteert `start_url`/`scope`/`id` met `/<slug>/` prefix, en serveert via `URL.createObjectURL` (blob:). Vorige blob URLs worden gerevoke'd om geheugenlek te voorkomen.
- **Role-aware in-slug start_urls**:
  - `beheer` → `/<slug>/login?source=pwa&view=admin`
  - `huurder` → `/<slug>/kiosk/huurder?source=pwa`
  - `klant` → `/<slug>/kiosk/klant?source=pwa`
  - `kiosk` → `/<slug>/kiosk?source=pwa`
- **Inline `index.html` script** ook aangepast met dezelfde `inSlugStart()` logica zodat de first-paint manifest al klopt (vóór React mount).
- **Verified live**: `/surirent/login` → manifest `start_url: /surirent/login?source=pwa&view=admin`, `scope: /surirent/`. `/surirent/kiosk/huurder` → manifest `start_url: /surirent/kiosk/huurder?source=pwa`, `scope: /surirent/`.

## Session 2026-06-01 (v13) — QR cross-device login + ABN-stijl PinLanding redesign ✅
- **Backend (server.py)**: 3 nieuwe endpoints + `qr_sessions` collection:
  - `POST /auth/qr/create` (anoniem) — genereert 24-byte urlsafe token, expires in 5 min, returnt `{token, qr_url, expires_in}`. URL afgeleid uit Origin/Host header met X-Forwarded-Proto fallback.
  - `GET /auth/qr/status/{token}` — desktop polt elke 2s; returnt `pending`/`claimed`/`expired` + optioneel access_token + user_summary.
  - `POST /auth/qr/claim/{token}` (auth required) — mobiel bevestigt; genereert verse JWT voor desktop sessie, markt sessie als `claimed`. Verlopen of dubbel-claim → 400. Onbekend token → 404.
- **Frontend (LoginPage.jsx)**:
  - **QrScannerModal**: `html5-qrcode` camera scanner, extract token uit URL, POST claim, success/error states.
  - **QrLoginTab**: desktop QR weergave via `qrcode.react` (220px SVG, level M), polling elke 2s, "Ingelogd!" → `window.location.assign('/admin')`, expired state met refresh.
  - **PasswordView tabs**: `loginMethod` state met "Wachtwoord" vs "QR code" tab toggle (alleen in login mode).
  - **PinLanding redesign** (ABN AMRO-stijl behoudens oranje branding):
    - "Welkom" massieve header
    - Profielfoto in cream/goud cirkel (cream-to-gold radial gradient) met witte 4px border
    - Online indicator (groene dot rechtsonder)
    - Bedrijfsnaam in uppercase wide tracking
    - "Vul je 4-cijferige PIN in om verder te gaan"
    - 4 PIN dots
    - 3x4 numpad met letter sub-labels (ABC/DEF/GHI/JKL/MNO/PQRS/TUV/WXYZ)
    - **Scan QR** pill linksboven (witte glass-blur)
    - **Help** pill rechtsboven (witte glass-blur)
    - Diagonal curve SVG patroon op de achtergrond + radial glow blobs
    - "Inloggen met e-mail · Nieuw account" onderaan
  - **HelpModal**: 3-stap uitleg (PIN entry / QR scanning / PIN vergeten).
- **Nieuwe pagina `QrLinkPage.jsx`** + route `/qr-link?token=X` voor deep-link scans via native camera. Geen auth? → bewaart token in sessionStorage en redirect naar `/login`. Geauthenticeerd? → "Desktop inloggen?" confirmatie pagina met one-tap claim. Success state met Check icoon.
- **PasswordView submit**: na succesvolle login wordt `sessionStorage.pending_qr_token` gecheckt; indien aanwezig → redirect naar `/qr-link?token=X` ipv `/admin`, zodat de QR claim flow direct verdergaat.
- **Packages**: `qrcode.react@4.2.0` + `html5-qrcode@2.3.8` via yarn.
- **Tests**: iteration_29 — 9/9 backend tests pass + frontend integratie pass.

## Session 2026-05-31 (v12) — Hero vergroot + functionele zoekbalk ✅
- **Hero canvas** is nu volledig edge-to-edge (geen rounded wrapper meer), `minHeight: clamp(620px, 78vh, 880px)` voor ABN-AMRO dramatische schaal.
- **Headline** vergroot naar clamp `2.75rem–5.5rem` (was 4.5rem max). Subkopie `text-2xl` met "**30% sneller**" highlight.
- **2 CTA knoppen in hero** (Bekijk de demo · WhatsApp ons) ipv 1.
- Dubbele oranje radial-glow blobs voor dramatischer effect.
- **Functionele zoekbalk** in greeting card via nieuwe `SEARCH_INDEX` (8 categorieën, 50+ terms): typen ≥2 chars toont dropdown met max 6 resultaten naar `feature-0..4`, `kiosk`, `pricing`, `faq`. Enter-key opent eerste resultaat, Esc sluit. Smooth scroll naar target.
- **Quick-pill suggestions** onder zoekbalk: "Veelgezocht" met 4 shortcuts (Prijzen · Kiosk PWA · OCR / AI · FAQ).
- **Empty state**: "Geen resultaten voor [query]" wanneer geen match.

## Session 2026-05-31 (v11) — ABN AMRO-stijl landing (zwart + oranje) ✅
- Gebruiker stuurde ABN AMRO screenshot als referentie. **Volledige rewrite** in zwart `#0F0F0F` + oranje `#FF5C00` palette.
- **Dubbele nav**: tier 1 (h-20) met SuriRent logo + "Beheerder · Huurder · Demo" segment selector (toggle state met border-active) + grote oranje "🔒 Inloggen" pill rechts. Tier 2 (h-14 sticky) met Home · Functies ▾ · Kiosk PWA · Prijzen · Service & FAQ + search icoon.
- **Hero canvas**: rounded container met dashboard screenshot als bg-image + zwart gradient overlay (0.92 → 0.35), oranje radial glow accent. Links massieve headline "Voor als Excel uw vastgoed **niet meer trekt.**" (clamp 2.5rem-4.5rem), oranje "Bekijk de demo" CTA.
- **Floating greeting card** (`#0F0F0F/95` met blur): tijd-aware greeting (Goedemorgen/Goedemiddag/Goedenavond), "Waarmee kunnen we u vooruit helpen?" subtitle, witte search input met focus-ring oranje, WhatsApp link onder.
- **8 product cards** in 4x2 grid op slate-50 bg: Inloggen, Demo proberen, Beheer Suite, Kiosk PWA, Locaties, Appartementen, Betalingen, Facturen. Elk met oranje icoon-tile (`bg-orange-50` → `bg-[#FF5C00]` op hover, icoon wordt wit), titel + sub + chevron rechts. Hover: lichte translate-y + shadow.
- **Feature rows**: alle 5 desktop screenshots in alternerende editorial layout (#feature-0..4) met macOS browser frame en oranje square-bullet check-icons.
- **Kiosk section** (#0F0F0F): 4 tablet screenshots in 2x2 grid in `#1F1F1F` cards met oranje nummers (01-04).
- **Pricing**: 3-tier waarvan Pro (950) zwart met oranje accents + oranje "Aanbevolen" pill + oranje CTA.
- **FAQ** + **Footer**: zwart met oranje accenten, 5-sterren rating, contact info met oranje icons.
- Body bg: wit. Selection: oranje. Max-width: `1280px` voor ABN-stijl content gewicht.

## Session 2026-05-31 (v10) — Local Hero · Premium SaaS · Warme aardetinten ✅
- Gebruiker verwierp v9 (Swiss Brutalist) en koos voor **"Local Hero (Surinaams trots) + Premium SaaS"** combinatie met warme aardetinten + goud/oranje.
- **Volledige rewrite** `MarketingLandingV2.jsx`. Palette: cream `#FDF6EC/#FAF1E1`, chocolate `#1F1308/#3D2817`, burnt orange `#FF5C00/#C74600`, gold `#F8C260/#D4A037/#B8860B`, terracotta.
- **TopNav**: cream glass-blur (`bg-[#FDF6EC]/85`), scroll-aware, "SuriRent" met chocolate/oranje split, oranje gradient demo-knop.
- **Hero**: warme gradient (cream → perzik), 🇸🇷 "Gemaakt in Suriname" badge, massieve Outfit display "Vastgoed beheren, *zoals het hoort.*" met goud gradient italic accent op laatste regel. Tropical leaf SVG silhouette als subtiele textuur. Browser mockup rechts met gouden glow blur achter. Zwevende "Volledige Beheer · 12+ modules" callout kaart. 5-sterren rating "Surinaams gebouwd, lokaal vertrouwd".
- **Stats strip**: 4 stats (∞ bedrijven, 3 valuta, 24/7 Kiosk, AI OCR) met chocolate gradient cijfers en cream/gold divider.
- **Editorial Features**: 5 alternerende tekst↔screenshot rijen, elk met cream `#FAEAD0` of `#F5E6D3` decoratieve blob achter de screenshot, gouden checkmark-tile icons. Eyebrows in burnt orange, headlines met goud gradient accent woorden.
- **Kiosk Section**: Diep chocolate radial gradient achtergrond met gouden ellipse glow, 4 tablet-mockups in 2x2 grid genummerd 01-04 met goud gradient nummers, bottom pills met goud accenten ("Offline-first · Multi-currency · PIN beveiligd · Gemini AI OCR · WhatsApp bevestiging").
- **Pricing**: 3 tiers waarvan Pro (950) chocolate gradient met **gouden "Aanbevolen" pill** + gouden CTA knop. Starter en Enterprise cream/wit met gold-accented border hover.
- **FAQ**: Premium cream cards met goud accent border bij open state.
- **CTA Banner**: Oranje gradient block met gouden mesh radial overlays + grid texture, 🇸🇷 "Speciaal voor Suriname" badge, "Klaar voor het volgende **hoofdstuk?**" met cream gradient.
- **Footer**: Chocolate radial gradient met gouden accenten — top hairline divider (gold linear), gouden mail/phone icons, "🇸🇷 Met trots gemaakt in Paramaribo" pill, gouden "Rent" in logo.
- Body font: Outfit. Selection color: `bg-[#C74600]`. Body bg `#FDF6EC`.

## Session 2026-05-31 (v9) — Architectural/Brutalist Swiss redesign ✅
- Gebruiker rejecteerde v5/v6/v7/v8 (Premium SaaS / Editorial). Design-expert `design_agent_full_stack` ingeschakeld voor blueprint in `/app/design_guidelines.json`. Gekozen: **Archetype 4 — Swiss & High-Contrast** (Light Theme, hard borders, brutalist).
- **Volledige rewrite** `MarketingLandingV2.jsx` (overwrite). Geen video, geen blur, geen soft shadows. Strict 1px black borders overal.
- **TopNav**: Hard `border-b-black`, links als "01 / PRODUCT" tracking-wide uppercase, "DEMO AANVRAGEN" solid orange knop.
- **Top meta strip**: Architectural data ribbon (Live·Paramaribo / v2.5 / Multi-Tenant SaaS / SRD·EUR·USD / PWA / Vastgoed Suite) in 6 bordered cells.
- **Hero**: 2-koloms split met harde vertical divider. Links massieve typography "Eén platform. Alle huur. Nul Excel." (clamp 3rem-7.5rem, leading-0.85, oranje accent op laatste regel), spec-metrics onderaan (12+ modules / 3 valuta / ∞ bedrijven). Rechts cream `#F5F5F0` panel met "Fig. 01 / Beheer Suite — Overzicht" label + hard-bordered screenshot container.
- **Marquee strip**: Zwart full-width met horizontaal scrollende ticker (`@keyframes marquee` toegevoegd aan index.css) — 12 feature items roterend.
- **ProductIntro**: Manifest-stijl statement met "[01] Wat is SuriRent?" links en grote text rechts.
- **FeatureMatrix**: **Sticky split layout** — links 40% kolom met 4 numerieke modules (01-04) als clickable index die actief wordt op klik, rechts 60% kolom met gestackte screenshots in bordered viewports, elk met "Fig. 02 / Locaties → /admin/locaties" architectural labels en 3 spec-bullets per module.
- **Kiosk Filmstrip**: Zwarte sectie, 4 tablets in chronologische 4-koloms rij (genummerd 01-04 STEP), bottom strip met "● Offline-first ● Multi-currency ● PIN ● Gemini AI OCR".
- **Pricing**: 3-koloms strikte matrix met hard borders. Pro tier (950) inverted (black bg, white text, orange Aanbevolen badge). Genummerd 01/02/03 STARTER/PRO/ENTERPRISE.
- **FAQ**: Minimal accordion met 4-koloms label ("Vragen? Antwoorden.") + 8-koloms genummerde lijst (01-05) met plus/minus icons, harde border-b per item.
- **Final CTA**: Volledig oranje block (`#FF5C00`) met grid pattern overlay en clamp 3rem-8rem typography "Digitaliseer uw vastgoed. Vandaag nog." (laatste regel wit).
- **Footer**: Zwart architectural met 12-col grid + **massieve "SuriRent®" logo statement** onderaan (clamp 4rem-18rem) voor brand presence.
- IBM Plex Sans als body font, ingesteld via inline style op root div.

## Session 2026-05-31 (v8) — Fresh modern editorial redesign (geen video) ✅
- **Volledig herschreven** `MarketingLandingV2.jsx` (rewrite, geen patch). Video volledig verwijderd, alleen screenshots.
- **Hero (editorial split)**: links bold zwarte headline "De complete **huurbeheer** oplossing voor vastgoed." (oranje accent woord + perzik highlight onderlijn), 2 CTAs + trust badges. Rechts: 2 overlappende gekantelde browser mockups (Overzicht -3°, Betalingen +4°) ipv video.
- **Stats**: 4 grote stats met dividers (3 valuta, ∞ bedrijven, 24/7, AI).
- **Editorial Features (nieuw)**: 5 alternerende rijen (text↔screenshot per rij), elk met eyebrow + grote title + intro + 3 bullets + macOS browser screenshot. Toont Overzicht, Locaties, Appartementen, Betalingen, Facturen.
- **Bento Gallery (nieuw)**: donkere sectie met asymmetrische 12-koloms mosaic — Overzicht 8-cols/2-rows, anderen 4-cols/6-cols.
- **Kiosk Section**: 4 tablet-screenshots in 2x2 grid (i.p.v. video).
- **Compact Features**: 8-icoon grid voor "en meer" categorie (Multi-bedrijf, WhatsApp, OCR, Werknemers, QR codes, etc.).
- **Pricing / FAQ / CTA banner / Footer**: behouden uit vorige versie maar styling-consistent gehouden.
- Video assets (`/app/frontend/public/landing/demo.mp4` + poster) **opgeruimd**.

## Session 2026-05-31 (v7) — Video codec fix + landing design polish ✅
- **Bug fix**: video speelde niet in Chrome/Firefox/Edge omdat het **HEVC/H.265** was (iPhone screen recording). Alleen Safari kon het renderen.
- **Fix**: Video gedownload, gehertranscodeerd naar **H.264 + faststart MP4** (815 KB, 720px wide, geen audio) via ffmpeg, opgeslagen op `/app/frontend/public/landing/demo.mp4`. Universeel afspeelbaar op alle browsers.
- **Hero polish**:
  - Toegevoegd: 2 zwevende notification-cards ("Betaling ontvangen +SRD 5.000" + "AI OCR voltooid - 3 betalingen verwerkt") met `@keyframes float` animation in `index.css`
  - Versie pill "v2.5" in de top-badge
  - Subtiele dot-grid achtergrond (radial-gradient)
- **Features Bento Grid**:
  - 2 grote hero-tiles: Multi-bedrijf SaaS (oranje gradient + decorative orb) + Kiosk PWA (donker met witte tekst)
  - 10 kleinere features in 5-koloms grid voor visuele variatie
  - "Meer info" arrow CTA per hero-tile

## Session 2026-05-31 (v6) — Live demo video op landingspagina ✅
- Gebruiker upload screen recording (1290×2796 portrait iPhone, 34s, 14 MB).
- **Hero**: kleine iPhone (240px) met `<video autoPlay loop muted playsInline>` overlay, vervangt de TabletFrame in de hero-mockup.
- **Nieuwe `VideoShowcase` sectie** tussen Features en Beheer Suite carousel: grote iPhone (360px) met video + "Live opname" badge + 3 bullet points (KPI dashboard, multi-currency, touchscreen optimized).
- `PhoneFrame` component uitgebreid met `videoSrc` + `poster` props (fallback naar `<img src>`).
- Poster image (JPG, 1 frame uit video) gegenereerd via ffmpeg en opgeslagen onder `/app/frontend/public/landing/demo-poster.jpg` voor snelle eerste render.
- Auto-loop zonder geluid, native browser autoplay-friendly (muted + playsInline).

## Session 2026-05-31 (v5) — Marketing Landing volledig redesign (Premium SaaS) ✅
- **Nieuwe `MarketingLandingV2.jsx`** vervangt de oude landing op de root route (`App.js` import gewijzigd). Oude `MarketingLanding.jsx` behouden voor LandingEditor preview compatibiliteit.
- **9 echte app screenshots** geïntegreerd (5x Beheer + 4x Kiosk), gehost op Emergent Assets CDN.
- **Hero**: grote H1 met gradient Orange "Beheer & Kiosk." kop, dual-device mockup (macOS browser frame + iPad landscape overlay), 2 CTAs (Demo proberen / WhatsApp), trust strip.
- **Stats strip**: 3 valuta · ∞ bedrijven · 24/7 Kiosk · PWA
- **Features**: 12-feature grid (Multi-bedrijf SaaS, Kiosk PWA, 3-bucket facturen, Betalingsregelingen, herinneringen, multi-currency, OCR, Kasgeld, werknemers, huurderportaal, iOS+Android PWA, QR codes per appartement).
- **Beheer Suite showcase**: 5-tabs carousel met sidebar (Overzicht / Locaties / Appartementen / Betalingen / Facturen), elk in macOS browser frame.
- **Kiosk PWA sectie** (donker `bg-slate-950`): 4 stappen in iPad landscape mockups met goud-oranje gradient titel.
- **Pricing**: 3 tiers (Starter 450 SRD, Pro 950 SRD highlight, Enterprise Custom) met juiste CTA per tier.
- **FAQ**: 5 vragen met accordion (setup tijd, iOS/Android, white-label, veiligheid, opzegging).
- **CTA banner**: oranje gradient met grid overlay + dual CTA.
- **Footer**: branding, productlinks, contact, status indicator.
- **TabletFrame** component (custom): donkere bezel + home indicator, gebruikt landscape aspect-ratio passend bij de daadwerkelijke kiosk-resolutie (alle screenshots waren landscape 16:9 desktop browser captures).
- **TopNav**: glass-blur sticky, scroll-aware, mobile drawer.
- **WhatsApp link**: placeholder `+597XXXXXXX` — user moet vervangen met echte nummer.
- Visueel geverifieerd via 5 screenshots in iteration_28 + 2 follow-up screenshots na Kiosk-fix.

## Session 2026-05-31 (v4) — Sidebar logo = bedrijfslogo (white-label) ✅
- `Sidebar` haalt nu logo op uit `readCachedBranding()` (localStorage `pwa_company_logo`) of `activeCompany.logo_url`. Wanneer aanwezig: witte tile met klant-logo. Wanneer afwezig: fallback naar oranje `SuriRent` icoon.
- **Live update**: `applyBranding()` in `/app/frontend/src/lib/branding.js` dispatcht nu een `branding-updated` CustomEvent op `window`. De Sidebar luistert en ververst direct zonder page reload.
- Bestaande `LogoUploader` in `/admin/branding` (met PNG/SVG upload max 5 MB via `POST /api/companies/me/branding/upload`) is ongewijzigd — wiring was reeds compleet, alleen Sidebar miste de live binding.
- White-label SaaS is nu visueel compleet: elk bedrijf in de multi-tenant SaaS toont zijn eigen logo + naam in de zijbalk.

## Session 2026-05-31 (v3) — Zoekbalk verplaatst naar Top Bar ✅
- Gebruiker correctie: `GlobalSearch` is verhuisd vanuit "Snelle Acties" naar de **DesktopTopBar**, ter vervanging van `QuickPayButton` (de groene "Nieuwe betaling" snelknop bovenaan rechts). Nieuwe `variant="topbar"` prop maakt slanke pill-stijl (h-10, w-72 → xl:w-96) passend in de header.
- "Nieuwe betaling" knop is **teruggezet** in de Snelle Acties rij — alle 4 originele knoppen zijn terug: Nieuwe factuur · Nieuwe huurder · Nieuwe betaling · Open Kiosk.
- `QuickPayButton` import in `AdminDashboard.jsx` blijft (component nog beschikbaar voor andere views indien nodig).

## Session 2026-05-31 — Admin Overzicht: luxe banking-hero, payment plans lijst, globale zoekbalk ✅
- **Hero Kas saldo** (banking-stijl) bovenaan de Overzicht: donkere bodem met goud/oranje radial glow, gradient-text titel, 3 valuta tegels (SRD/EUR/USD) elk met TrendingUp indicator. "Beheer kasgeld" pill-knop opent kasgeld tab.
- **KPI rij — 4 tegels**: Appartementen (met bezettingsgraad bar), Actieve huurders (CTA naar Huurders), Open · lopende maand (count + €), Achterstand (rood gradient bij overdue > 0). Alle klikbaar.
- **Snelle Acties — herontworpen**: Nieuwe factuur · Nieuwe huurder · **GlobalSearch input** (vervangt "Nieuwe betaling" knop op gebruikers verzoek) · Open Kiosk. De zoekbalk doorzoekt client-side huurders (naam/telefoon/e-mail), appartementen (nummer/adres) en facturen (nummer/huurdernaam/periode). Lazy-load van alle data op eerste focus. Resultaten in dropdown met 5 per categorie + navigatie naar juiste tab bij klik.
- **PaymentPlansList** vervangt het oude "Status Overzicht" (donut + huurstatus): scrollable lijst (max-h 420px) met alle actieve `payment-plans`, toont huurder + appartement + remaining/total + per-plan voortgangsbalk + overdue-badge + volgende vervaldatum. Tellend badge naast titel. "Bekijk alle →" knop linkt naar Betalingsregelingen tab. Auto-refresh elke 15s.
- **Top bar bg fix**: `DesktopTopBar` (`#FFF7F0/85` cream) gelijk getrokken aan main content wrapper (`#F7F8FA`) zodat er geen kleurverschil meer is tussen sticky header en page-body.
- **Iconen fix**: ontbrekende imports `AlertCircle`, `UserPlus`, `TrendingUp`, `ArrowUpRight` toegevoegd aan `lucide-react`-import in `AdminDashboard.jsx`.
- **Quick fix**: `kpi-cash-cta` go-tab `cash` → `kasgeld` (matched de tab-id, was kapot).
- Mobile/tablet UI ongewijzigd — `lg:hidden` Portfolio in één oogopslag + Inkomsten/Openstaand card blijven werken.
- Tests via `testing_agent_v3_fork` (iteration 28): **12/12 acceptance criteria PASS** (login → Overzicht, hero Kas tiles, 4 KPIs, quick actions, global search "kew" toont 3 huurders + 1 appartement, click-through navigatie, payment plans lijst met 7 actieve regelingen, kiosk-open flow, mobile fallback, geen console errors).

## Session 2026-05-30 — 3-bucket invoice classification + Multi-invoice Regeling vanaf Kiosk ✅
- **Backend**: nieuwe helper `_classify_invoice_bucket(period_month, period_year, today, grace_workdays)` retourneert `"overdue" | "current" | "future"`. Achterstand vereist dat periode-einde + `grace_workdays` (uit `company_settings.invoicing.grace_workdays`, default 10) verstreken is.
- **`GET /api/kiosk/tenants/{id}/overview`** retourneert nu 3 buckets: `open_invoices` (overdue), `current_invoices`, `future_invoices` + matching `*_total`. Plus `grace_workdays` voor frontend-info.
- **`GET /api/invoices`** voegt `bucket` veld toe aan elke onbetaalde factuur (`overdue|current|future|null`).
- **Frontend Admin Facturen**: `groupByTenant` gebruikt `inv.bucket` direct. TenantRow hoofdregel toont `totalDue` (achterstand + huidige, géén vooruit) en `lastDue` (meest recente non-future). Uitklap bevat 3 secties met eigen subtotaal. KPI "Totaal openstaand" excludeert vooruit.
- **Frontend Kiosk TenantOverview**: Servicekosten regel verwijderd. Totaal openstaand = achterstand + huidige + internet (vooruit alleen informatief).
- **Frontend Kiosk PaySelect**: 3 secties (Achterstand ROOD · Huidige maand AMBER · Vooruit gefactureerd BLAUW opt-in). Per-factuur checkbox-rijen i.p.v. generieke "Huur"-knop.
- **NIEUW: "Regeling afspreken" knop in PaySelect** → `<ArrangePlanModal>`. Huurder selecteert achterstand/huidige/vooruit-facturen, kiest 2/3/4/6/8 termijnen, optionele startdatum. POST `/api/kiosk/payment-plans/quick` met `invoice_ids` (multi-invoice support nieuw toegevoegd aan `KioskQuickPlanIn`, achterwaarts compatibel met legacy `invoice_id`). Bevestiging via `<PlanArrangedReceipt>`.
- **Bucket-overgangen automatisch** op systeemdatum: bv. op 1 juni schuift mei → current (binnen grace), juni-factuur → current (huidige maand), juli → future. Rond juni 14 schuift mei → overdue.
- Volledig regression-getest via testing agent: backend 9/9, frontend visible flows ✅.



## Session 2026-02-26 — Dynamische betalingsregeling-suggestie na partial ✅
- **Nieuw backend endpoint** `POST /api/kiosk/payment-plans/quick` (kiosk-token authenticated, geen admin-PIN nodig). Body: `tenant_id, invoice_id?, total_amount, num_installments (2-12), currency`. Maakt direct een actief `payment_plans` document + `payment_plan_installments` records (één per termijn, gelijke verdeling met laatste termijn afronding). Eerste vervaldatum: vandaag + 30 dagen. Push-notificatie naar admins.
- **Nieuw frontend component** `<PartialPlanSuggestion>` — bottom-sheet op mobiel / center-modal op desktop. Toont:
  - "Er staat nog X open voor januari 2026"
  - 3 keuze-tiles: 2× / 3× / 4× termijnen met live per-maand bedrag preview
  - Samenvattings-vak met monthly + eerste vervaldatum
  - "Nee, later" / "Maak regeling" knoppen
- **ReceiptScreen integratie**: na partial betaling refetch overview, detect eerste factuur met `is_partial: true` → modal opent automatisch. Auto-done timer (10s) wordt gepauzeerd zolang modal open is — sluit als de huurder de keuze heeft gemaakt of "Nee, later" tikt.
- **Belangrijke route registratie-fix**: endpoint geregistreerd via `@app.post("/api/kiosk/...")` direct (niet `@api.post(...)`) omdat `app.include_router(api)` al uitgevoerd was vóór de nieuwe regel — anders 404.
- End-to-end geverifieerd via curl: partial SRD 4.000 op Jan → status partial → quick-plan SRD 2.000 / 2 termijnen → returnt monthly SRD 1.000 + first_due 2026-06-28. Visual UI bevestigd.



## Session 2026-02-26 — Kiosk/Admin sync + Partial Payment flow ✅

### Bug fix: huidige maand niet meer als achterstand in kiosk
- **Backend `kiosk_tenant_overview`** filtert `open_invoices` nu op `period < curMonth/Year`, dezelfde regel als admin `Invoices.jsx` `isOverdueInv`. De huidige maand-factuur wordt niet meer als achterstand getoond — die hoort bij "Maandhuur" + admin "Komt nog".
- **Backend veld-bug**: was `inv.get("amount_paid")` (bestaat niet), nu `paid_amount` (juiste veldnaam).
- Geverifieerd: Melano had 5 open (Jan-Mei), nu 4 (Jan-Apr). Kiosk + admin tonen identiek aantal.

### Partial Payment flow
- **Backend `_apply_payment_to_invoice`**: factuur status springt nu naar `partial` zodra `paid_amount > 0` maar < 95% van factuurbedrag. Wanneer cumulatief ≥ 95% → status automatisch `paid` (zoals voorheen).
- **Backend `PaymentIn`** model uitgebreid met `invoice_ids: Optional[List[str]]`. Wanneer gevuld: `_create_payment_doc` mat de betaling tegen exact die set (oudst-eerst), overflow blijft binnen die selectie en lekt niet naar andere maanden.
- **Frontend PaySelect**: stuurt `invoice_ids` mee met `onConfirm` payload zodat backend FIFO binnen de gekozen set werkt.
- **`is_partial` flag** in kiosk overview returns. PaySelect toont "Deels betaald · nog X open" sub-label onder factuur-button.
- **Admin Invoices.jsx**: amber "Deels betaald" badge bij invoice met `status: partial` of `paid_amount > 0 && < 95%`.
- End-to-end geverifieerd: SRD 4.000 betaling op Jan-factuur → status `partial`, openstaand SRD 2.000, overige maanden ongewijzigd, totaal openstaand correct SRD 20.000.



## Session 2026-02-26 — Breakdown weg in overzicht + per-maand selectie in betaalscherm ✅
- **Financieel overzicht**: het uitgeklapte breakdown-vak onder "Openstaande huur (N maanden)" is verwijderd. Sub-tekst `jan, feb, maa, apr, mei 2026` blijft als compacte hint. Overzicht is nu minimaal.
- **PaySelect "Wat wilt u betalen?"**: bij ≥2 open facturen wordt de enkele "Huur"-knop vervangen door een sectie **"Openstaande huur · N maanden"** met één selecteerbare regel per maand (`Huur januari 2026`, `februari 2026`, ...). Elke knop heeft eigen checkbox + bedrag + vervaldatum sub-tekst. Huurder kan deelbetalingen kiezen (bv. alleen Jan+Feb).
- `selectedInvItems`, `selectedInvTotal`, en `buildDescription` aangepast om `inv:<id>` selecties correct mee te tellen. "Alles betalen"-knop selecteert ook alle invoice-keys.
- Bij 0 of 1 open factuur blijft de oude enkele "Huur"-knop behavior gehandhaafd (geen onnodige UI-verandering).
- Visual geverifieerd voor Melano: 5 invoice-buttons, generieke Huur-knop verdwenen in split-modus, financieel overzicht zonder breakdown lijst.



## Session 2026-02-26 — Financieel overzicht consolideren + breakdown in betaalscherm ✅
- **Financieel overzicht**: terug naar één enkele "Openstaande huur (N maanden)"-regel met sub-tekst `jan, feb, ...` i.p.v. één regel per maand. Direct onder deze regel wordt een light-orange **breakdown-vak** getoond met alle openstaande maanden + bedragen. Compactere visuele weergave maar alle data blijft direct zichtbaar.
- **PaySelect "Wat wilt u betalen?"** verwerkt nu `open_invoices` + `open_invoices_total` vanuit overview:
  - Huur-bedrag = som van alle openstaande facturen (i.p.v. legacy balance-berekening)
  - Onder de "Huur"-knop verschijnt automatisch hetzelfde maand-voor-maand breakdown-vak wanneer er >1 openstaande factuur is
  - Huur-knop subtekst toont "{N} maanden achterstand" in oranje
- Geverifieerd visueel voor Melano (5 open facturen): overzicht toont 5 maanden in 1 ingeklapt vak met SRD 30.000 totaal, betaalselectie toont Huur SRD 30.000,00 met "5 maanden achterstand" sub-label + breakdown lijst.



## Session 2026-02-26 — Kiosk Financieel: alle open facturen + Superadmin OCR-inbox ✅

### Bug fix: Kiosk Financieel overzicht toont nu ALLE open facturen
- **Backend `kiosk_tenant_overview` uitgebreid** met `open_invoices[]` + `open_invoices_total`. Haalt alle facturen op met `status != paid` voor de huurder, gesorteerd op periode_year/month/due_date. Voor elk: outstanding = amount_due - amount_paid.
- **Frontend `KioskLayout.FinancialOverview`** rendert nu één regel per open factuur (`Huur Januari 2026` SRD 6.000, `Huur Februari 2026` SRD 6.000, ...) i.p.v. één samenvattingsregel "Openstaande huur" met alleen next_period label.
- Backwards-compatible: huurders zonder facturen vallen terug op de oude balance-berekening.
- Geverifieerd: huurder Melano (5 open facturen Jan-Mei 2026) toont alle 5 maanden + Totaal openstaand SRD 30.000,00.

### Superadmin OCR-goedkeurings-inbox
- **3 nieuwe backend endpoints** (allen superadmin-only):
  - `GET /superadmin/saas-pending-approvals` → lijst van saas_payment_requests met status `pending_approval`, joined met company-naam en factuur-info.
  - `GET /superadmin/saas-bank-statement/{id}` → cross-tenant download van bankafschrift voor preview (returnt blob).
  - `POST /superadmin/saas-payment-requests/{id}/approve` → activeert het bedrijf via `_record_saas_payment_manual()`.
  - `POST /superadmin/saas-payment-requests/{id}/reject` → markeert als afgewezen met optionele reden.
- **Frontend Subscriptions.jsx** nieuwe tab "OCR-goedkeuring" met badge-count (amber wanneer >0). Toont per rij:
  - Bedrijfsnaam + slug
  - 2-koloms vergelijking "Verwacht (factuur)" vs "OCR-resultaat" met confidence%
  - Knoppen: Bekijk afschrift (blob fetch → modal met img/PDF iframe), Afwijzen (prompt reden), Goedkeuren (confirm + activeren).
- Geverifieerd visueel: 2 mismatches getoond met juiste data, preview modal opent correct.



## Session 2026-02-26 — SaaS Abonnement OCR Auto-approve voor Bankoverschrijving ✅
- **Nieuw backend endpoint** `POST /api/billing/me/bank-confirm` (multipart): admin uploadt screenshot/PDF van bankoverschrijving voor zijn lopende SaaS-factuur.
  1. Bestand (≤5MB, JPG/PNG/WEBP/PDF) opgeslagen in `bank_statements` collectie met `kind: 'saas_billing'`.
  2. Direct synchroon Gemini 2.5 Flash OCR via bestaande `_ocr_bank_statement()` helper.
  3. Match-check via bestaande `_ocr_match_ok()` (bedrag-tolerantie, confidence ≥0.7, valuta).
  4. Bij match → **automatisch goedgekeurd** via nieuwe `_record_saas_payment_manual()`:
     - `subscription_invoices.status = paid`
     - `subscription_payments` record aangemaakt met `auto_approved: true`, `bank_statement_id`, `method: bank`
     - `companies.billing_status = active` via `_activate_company_after_saas_payment()`
     - Confirmation email verstuurd
  5. Bij mismatch → `saas_payment_requests.status = pending_approval` (superadmin moet handmatig goedkeuren). Mismatch-reasons gereturnd.
- **Frontend** `MijnAbonnement.jsx`: nieuw `<BankProofUploader>` component geïntegreerd in bestaande `<BankBox>`. Toont:
  - Heldere uitleg ("wij scannen automatisch het bedrag, datum en omschrijving — als alles matcht wordt uw abonnement direct geactiveerd")
  - Donkere upload-knop (toggle naar "Scannen…" spinner tijdens OCR)
  - **Groene `✓ Goedgekeurd` kaart** bij paid status met OCR-detected bedrag/datum/payer
  - **Amber `⚠ Wacht op handmatige goedkeuring` kaart** bij mismatch met lijst van redenen
  - "Opnieuw uploaden" knop om nieuwe poging
- Bij `status: 'paid'` reload `MijnAbonnement` zichzelf → `billing_status: active` badge wordt direct zichtbaar.
- Geverifieerd: curl POST met 4-byte fake JPEG → `pending_approval` met heldere OCR-fout, Playwright visueel + UI flow getest.



## Session 2026-02-26 — Slug Beschikbaarheids-check + Landscape Desktop Layout ✅
- **Nieuw publiek endpoint** `GET /api/public/companies/{slug}/available` → `{available: bool, reason?: 'format'|'reserved'|'taken'}`. Lekt geen interne data (geen naam/branding van bestaande bedrijven).
- **Frontend debounced check (350ms)** in `LoginPage.PasswordView`. State-machine met 5 toestanden: `idle | checking | available | taken | reserved | format`. Visualiseert met kleurcodering:
  - **Groen `✓ VRIJ`** badge wanneer slug beschikbaar is
  - **Rood `✗ BEZET`** badge + rode preview-kaart wanneer al in gebruik
  - **Geel `AUTO-NAAM`** badge bij reserved slug (auto-suffix `-bedrijf` zichtbaar in preview)
  - Spinner tijdens check
- **Submit-knop disabled** wanneer status `taken` of `format` is → voorkomt nutteloze pogingen.
- **Landscape desktop layout**: form max-w-2xl op tablet, **max-w-4xl** op lg+. In register-mode 2-koloms grid: links `Land & valuta` + `Pakket-kiezer` (1 kolom plans op lg), rechts `Bedrijfsnaam+URL-preview`, `Naam+Telefoon`, `Email+Wachtwoord`, `Kiosk PIN`. CTA volledige breedte onderaan. Geen scroll meer op standaard 1440×900 monitor.
- Geverifieerd: 3 status-screenshots (VRIJ/BEZET/preview) groen, mobile responsive blijft compact.



## Session 2026-02-26 — Compacte Registratie + Live Portal-URL Preview ✅
- **Registratieformulier herontworpen** voor minder scrollen op zowel desktop als mobiel:
  - 2-koloms grid voor Naam+Telefoon, Email+Wachtwoord (klapt naar 1-kol op mobiel).
  - Compactere input-hoogte (h-12 i.p.v. h-14), kleinere icons (w-12), strakker spacing (space-y-3).
  - Land & valuta cards compacter, Plan cards op 1-regel layout met kleinere description.
  - Padding p-5 op mobiel (i.p.v. p-8) zodat het formulier breder in het scherm past.
- **Live portaal-URL preview** onder de Bedrijfsnaam-input. Toont in een groene kaart "Uw portaal-URL: vastgoed-app.preview.../{slug}" die meebeweegt met wat de gebruiker typt. Gebruikt dezelfde slug-regels als backend (`_slugify` + RESERVED_SLUGS suffix). Geeft direct duidelijkheid: "dit wordt mijn URL".
  - Bv. "Demo Vastgoed N.V." → `.../demo-vastgoed-n-v`
  - "Admin" → `.../admin-bedrijf` (reserved auto-suffix zichtbaar)
- Geverifieerd via screenshot op desktop (1440px) + mobile (390px). Geen verticale scrollbalk meer op desktop voor de complete registratie.



## Session 2026-02-26 — PIN-login per-bedrijf + Direct naar eigen portaal na registratie ✅
- **PIN-login is nu strikt company-scoped**. `/auth/kiosk-pin` accepteert `company_slug` of `company_id` in de body. Zonder bedrijfs-context → 400 ("PIN-login werkt alleen op uw bedrijfs-portaal"). Met slug → alleen die ene bedrijfs-PIN + employee-PINs van datzelfde bedrijf worden gecheckt.
- **Globale PIN-uniqueness opgeheven** (zowel `/auth/kiosk-set-pin` als `/employees/{id}/kiosk-pin`). Twee verschillende bedrijven mogen nu dezelfde PIN (bv. `1234`) gebruiken zonder conflict. Uniqueness wordt alleen binnen het eigen bedrijf afgedwongen (geen botsing tussen company-PIN en employee-PIN van datzelfde bedrijf).
- **Generieke `/login` toont alleen e-mail + wachtwoord** (Beheerder Login formulier). De "Terug naar PIN"-knop verbergt zich automatisch zonder bedrijfs-context. PIN-flow start ALLEEN op `/<slug>/login` of `/<slug>/` (branded portaal).
- **Na registratie hard-redirect naar `/<slug>/admin`** (eigen branded portaal) i.p.v. de generieke `/admin`. RegisterSuccess-knop "Naar mijn dashboard" stuurt direct naar het bedrijfs-pad zodat BrandedShell de juiste kleuren/logo bootstrapt vóór dashboard laadt.
- **Frontend `PinLanding`** stuurt nu `company_slug` (of `company_id`) mee met `/auth/kiosk-pin`. LoginPage hoofd-component skip de PinLanding wanneer `branding?.slug` ontbreekt en valt direct terug op `PasswordView`.
- Geverifieerd: `/login` toont email/wachtwoord (geen PIN), `/surirent` toont branded PIN+Welkom, PIN 1234 + slug=surirent → success + admin_token, PIN 1234 + slug=test-vastgoed-b → 401 (cross-bedrijf geblokkeerd), registratie van "NewCo351" → final URL `/newco351/admin` (✓) + Setup Wizard sheet auto-opent op branded portaal.



## Session 2026-02-26 — Setup Wizard auto-open als Sheet/Modal ✅
- **Nieuw component**: `/app/frontend/src/pages/vastgoed/admin/SetupWizardSheet.jsx` — wrapper rond bestaande `SetupWizard`. Op desktop een gecentreerde modal (max-w-5xl), op mobiel een bottom-sheet die slide-up van onderaan met pull-handle. Sluit-knop linksboven en "Later voltooien" footer op mobiel.
- **AdminDashboard.jsx** uitgebreid met `wizardOpen` state + auto-detect useEffect. Bij login GET `/api/companies/me/setup-status`: als `completed < 2` (basis-setup nog niet begonnen) EN `localStorage.setup_wizard_dismissed_<company_id>` is niet '1' → wizard auto-opent. Sluiten zet de dismiss-flag → blijft daarna gesloten tot admin de "Setup Wizard" tab handmatig opent.
- **Niet voor superadmin** (alleen voor gewone admin-rol).
- Geverifieerd via Playwright: registratie → /admin → wizard auto-opent (desktop centered modal én mobile bottom-sheet 390px viewport). Close-knop → sheet weg + localStorage flag gezet. Reload → wizard blijft gesloten. Bestaande `Setup Wizard` tab in zijbalk werkt onveranderd.



## Session 2026-02-26 — Short branded URLs + subdomain feature verwijderd ✅
- **Branded URL gewijzigd van `/c/<slug>/...` → `/<slug>/...`** (zonder `/c/`-prefix). Bv. `surirent.sr/surirent` i.p.v. `surirent.sr/c/surirent`. Legacy `/c/<slug>/...` URLs blijven werken (oude QR-codes, welkomstmails).
- **Reserved slugs server-side afgedwongen** (`RESERVED_SLUGS` constant): `admin`, `login`, `kiosk`, `huurder`, `onderteken`, `c`, `api`, `health`, `static`, etc. Superadmin POST/PUT `/api/companies` weigert reserved slugs met 400. Auto-suffix in self-serve registratie (auto-generated slug die per ongeluk reserved is → `-bedrijf` suffix).
- **`_validate_slug_or_raise()` helper** controleert regex + reserved-lijst.
- **Frontend `branded-nav.js`** bevat nu `RESERVED_SLUGS` Set (gesynced met backend). `brandedSlugFromPath()` detecteert zowel `/c/<slug>/` (legacy) als `/<slug>/` (nieuw, met reserved-filter). `useBrandedNavigate()` prefixt nu `/<slug>` i.p.v. `/c/<slug>`.
- **Frontend `App.js`** voegt `<Route path="/:slug/*">` als laatste vóór 404 catch-all toe (zowel `AppRoutes` als `HybridRoutes`). Alle exacte paden matchen eerst.
- **Frontend `branding.js`** detecteert beide URL-vormen.
- **`MyUrlCard` toont nu de nieuwe URL** + de "Eigen subdomein"-feature is volledig verwijderd. Alleen `Custom domain` (vanuit Instellingen → Eigen domein, DNS verified) wordt nog als primaire URL gemarkeerd.
- **Backend wijzigingen**: `_QR_KIND_PATHS`, `/companies/me/url-info`, `kiosk-sticker.pdf`, `qr-plate.pdf`, `portal-poster.pdf` allemaal naar `/<slug>/...`.
- Geverifieerd: `/surirent` toont branded LoginPage, `/c/surirent` blijft werken (legacy compat), `/login` blijft default LoginPage, `/nonexistent-xyz` toont "Bedrijf niet gevonden", reserved-slug create geweigerd met heldere foutmelding.



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

### Fase 2 deel 1 (uitgebreid — 2026-05-20, zonder externe credentials)
- ✅ **AI assistent** (Nederlandse chat) via Emergent LLM key + Claude Sonnet 4.5, met live portefeuille-context (appartementen, bezetting, openstaande huur, maand-inkomsten per valuta)
- ✅ **PWA push notificaties** — VAPID keys gegenereerd, service worker `/sw.js`, subscribe/unsubscribe + test/overdue push
- ✅ **AES-256 versleutelde PDFs** met QR overlay + signed verify token (`/api/verify/{token}` voor publieke verificatie)

### Fase 3a (uitgebreid — 2026-05-20)
- ✅ **Tenant portal** — `/huurder` mobile-first login (email/telefoon + PIN), `/huurder/portaal` dashboard met:
  - Eigen appartement + maandhuur + saldo (openstaand/positief)
  - Betalingsgeschiedenis met PDF kwitanties
  - Contracten met PDF
  - Onderhoudsmeldingen (lijst + zelf aanmaken met prioriteit)
- ✅ Admin kan tenant PIN instellen via KeySquare-knop in Huurders tab
- ✅ Mixed-case email + flexible phone matching (full string en digits-only)

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
- Iteration 5 (Multi-Company audit): 25/34 — vond 8 critical data leak bugs
- Iteration 6 (Multi-Company regression): 42/43 ✅ — alle leaks gefixed, data isolation sealed
- Iteration 7 (P1 hardening + regression): 55/55 ✅ — brute force lockout, Jan PIN re-seed, tenant set-pin scope, alle vorige tests blijven groen

### Fase 3 deel 2 (Multi-Company SaaS — 2026-05-20) ✅
- ✅ **Multi-Company architectuur volledig stabiel** — alle 12+ tenant-scoped resources gefilterd via `scope(user)` op list/get/put/delete + `company_id` op create
- ✅ **Superadmin role** met `/api/companies` CRUD (create/update/delete + seed-admin)
- ✅ **Header-based company switching** voor superadmin: `x-active-company: <company_id>` of `?company_id=...`
- ✅ **Kiosk PIN per company** — unique-PIN enforced cross-company, PIN matches naar correcte company's scope
- ✅ **Admin stats + AI context + push notify-overdue** alle scoped per company
- ✅ **Data isolation geverifieerd**: 42/43 tests pass (iteration_6), zero cross-company leakage
- ✅ Test suite `/app/backend/tests/test_multi_company.py` (43 tests) is canonical regressie

### Fase 3 deel 3 (P1 — Frontend Multi-Company UI + Hardening — 2026-05-20) ✅
- ✅ **Companies admin tab** voor superadmin (`/app/frontend/src/pages/vastgoed/admin/Companies.jsx`): CRUD + stats per company + actief-status badge + optionele seed-admin bij create
- ✅ **Company switcher** — superadmin kan met één klik wisselen tussen "Alle bedrijven" en specifiek bedrijf; selectie persisteert in `localStorage.active_company_id`
- ✅ **`x-active-company` header injectie** in axios interceptor (`api.js`) — backend ontvangt automatisch de actieve company scope
- ✅ **Sidebar company badge** — toont "Actief bedrijf" met naam + slug/plan
- ✅ **PIN brute-force lockout** — 8 mislukte pogingen → 429 voor 5 minuten op `/api/auth/kiosk-pin` en `/api/tenant-portal/login`
- ✅ **Idempotent re-seed Jan de Vries PIN** in `lifespan()` — geen handmatige DB reset meer nodig
- ✅ **Tenant set-PIN scope** — Admin A kan geen PIN zetten voor tenant van Admin B (404)
- ✅ 55/55 tests pass (iteration_7)

### Fase 3 deel 4 (PWA — Installable app op iOS & Android — 2026-05-20) ✅
- ✅ **manifest.json** met name, start_url=`/vastgoed`, scope=`/`, display=`standalone`, theme_color, 4 icons (any+maskable), 3 shortcuts (Kiosk / Beheer / Huurder)
- ✅ **iOS support**: alle apple-mobile-web-app-* meta tags, apple-touch-icon (144/192/512), 20 apple-touch-startup-images voor alle iPhone/iPad modellen (8/X/XR/XS Max/13/15 Pro/Pro Max + iPad/iPad Pro 11"/12.9", portrait+landscape)
- ✅ **Android/Chromium**: beforeinstallprompt-handler met "Installeren" CTA
- ✅ **Service Worker v3** (`/sw.js`): app shell caching (precache + runtime), network-first voor HTML, cache-first voor assets, bypass `/api/*`, push notificaties behouden
- ✅ **Auto-registratie** van SW in `App.js` via `useRegisterServiceWorker()` hook
- ✅ **InstallPrompt component** — Android toont native install knop; iOS Safari toont "Tik op Delen → Zet op beginscherm" hint (4s delay, dismissable, 30-dagen cooldown)
- ✅ **Safe-area support** voor iPhone notch / iPad home indicator: body padding + `.kiosk-fullscreen` padding + admin mobile tab bar padding
- ✅ **Standalone media query** schakelt naar oranje achtergrond wanneer geinstalleerd
- ✅ App icon: oranje huis logo (`/kiosk-icons/kiosk-512.png`)
- ✅ **Screenshot tour** in manifest — 3 mobile screenshots (Landing, Kiosk PIN, Huurder Portaal) op 540×960 JPEG, totaal 89KB. Zichtbaar in Android Chrome + Edge install dialoog als "preview".
- ✅ **Install marketing sectie** op landing page tussen Hero en Features — 2 visuele cards (iOS Safari + Android Chrome) met phone mockups, stap-voor-stap instructies, en 3 benefits-callouts ("Direct beschikbaar / Werkt offline / Native gevoel"). Nieuwe "Installeer" link in TopNav.
- ✅ **QR-code panel** (alleen desktop/tablet zichtbaar): genereerd als statisch SVG (`/kiosk-icons/install-qr.svg`) met SuriRent oranje, link naar productie URL `vastgoed-app.emergent.host/vastgoed`. Perfect voor demo's en pitches op een PC.

### Fase 3 deel 5 (Instellingen-infrastructuur — 2026-05-21) ✅
- ✅ **`company_settings` collectie** per company met 6 secties: SMTP, Twilio, Mope, Uni5Pay, Shelly, Domain
- ✅ **Fernet AES encryption** (`settings_service.py`) voor alle secrets (wachtwoorden, API keys, tokens, webhook secrets)
- ✅ **Mask pattern**: GET retourneert secrets als `•••••`; PUT met mask of leeg behoudt encrypted blob
- ✅ **API**: `GET/PUT /api/settings`, `PUT /api/settings/{section}`, `POST /api/settings/{section}/test` (placeholder)
- ✅ **Frontend Settings page** (`/app/frontend/src/pages/vastgoed/admin/Settings.jsx`) met sub-nav: 6 integraties + Kiosk PIN. Per sectie: ingeschakeld-toggle, alle velden, "Bewaar" + "Test verbinding" knoppen, DNS-instructies voor custom domain
- ✅ 55/55 backend regressie pass

### Fase 3 deel 6 (Fase B — SMTP E-mail send — 2026-05-21) ✅
- ✅ **`email_service.py`** — async smtplib wrapper (STARTTLS poort 587 + SSL poort 465), branded HTML template met SuriRent kleuren
- ✅ **Test verbinding** stuurt echte test-e-mail naar admin
- ✅ **Verstuur kwitantie/factuur/contract via e-mail** met PDF als bijlage en branded HTML body
- ✅ **3 nieuwe endpoints**: `POST /api/email/payment/{id}`, `POST /api/email/invoice/{id}`, `POST /api/email/contract/{id}` (body: `{to?, message?}`)
- ✅ **EmailDialog component** (`/app/frontend/src/components/EmailDialog.jsx`) — prefilled met tenant.email, override + extra bericht, foutafhandeling
- ✅ **Mail buttons** toegevoegd aan Payments, Invoices, Contracts rij-acties (33+ items getest)
- ✅ Heldere foutmelding bij verkeerde SMTP (toonbaar voorbeeld: `[Errno -2] Name or service not known`)

### Fase 3 deel 7 (Fase C — Twilio WhatsApp & SMS — 2026-05-21) ✅
- ✅ **`twilio_service.py`** — directe Twilio REST API via httpx (geen SDK), basic auth met SID + Auth Token
- ✅ **Test verbinding** stuurt echte test-bericht naar geconfigureerde from-nummer (bewezen: 401 vs verkeerde creds bereikt Twilio API)
- ✅ **4 nieuwe endpoints**: `POST /api/message/payment|invoice|contract|overdue-reminder/{id}` met body `{to?, message?, channel: "whatsapp"|"sms"}`
- ✅ **PDF-links in bericht body** (i.p.v. bijlage) — Twilio MMS is duur, link is gratis
- ✅ **SendDialog component** (vervangt EmailDialog): 3-channel switcher (E-mail / WhatsApp / SMS), automatisch wisselen prefilled veld tussen email/telefoon
- ✅ Alle 3 send-knoppen (Payments/Invoices/Contracts) gebruiken nu één dialoog met alle kanalen

### Fase 3 deel 8 (Fase D — Mope + Uni5Pay online betalingen — 2026-05-21) ✅
- ✅ **`payments_service.py`** — Mope REST API (create + get payment_request) via httpx; bedragen in cents; test mode op `test_` token prefix
- ✅ **Mope `Test verbinding`** roept echt API aan en valideert response (bewijst werkende auth-flow)
- ✅ **Nieuwe collectie `payment_requests`** met provider/provider_id/invoice/status/payment_url/paid_at
- ✅ **Endpoints**:
  - `POST /api/payment-requests/invoice/{id}` body `{provider: "mope"|"uni5pay"}` → maakt verzoek aan
  - `GET /api/payment-requests` lijst
  - `POST /api/payment-requests/{id}/refresh` ververst status
  - `POST /api/webhooks/mope` publiek endpoint met Bearer-token auth tegen company.mope.api_key
- ✅ **Auto-payment**: als status=paid → maakt automatisch Payment record + zet invoice op `paid` (idempotent)
- ✅ **Nieuwe admin-tab "Online betalen"** (`/app/frontend/src/pages/vastgoed/admin/PaymentRequests.jsx`) met 4 status-counters, filter, refresh + copy + open-link knoppen
- ✅ **PaymentLinkDialog**: knop op factuurrij opent dialoog (Mope/Uni5Pay), genereert link, toont met copy + open-buttons
- ✅ **Uni5Pay stub**: nette foutmelding "nog niet geconfigureerd — deel API documentatie"

### Dual-domain refactor (2026-05-21) ✅
- ✅ Volledig verwijderen van `/vastgoed/*` subfolder routing — alle app-pagina's nu op root (`/login`, `/admin`, `/kiosk`, `/huurder`, `/onderteken/:token`)
- ✅ Hostname-based routing in `App.js`: `MarketingRoutes` (surirent.sr), `AppRoutes` (app.surirent.sr), `HybridRoutes` (preview/local)
- ✅ Nieuwe helper `frontend/src/lib/env.js` met `isMarketingHost()`, `appLink()`, `appUrl()`, `publicMarketingUrl()` — leest uit `REACT_APP_MARKETING_HOST` en `REACT_APP_APP_URL`
- ✅ Backend `_public_url()` gebruikt `APP_PUBLIC_URL` env var — alle mail/SMS/contract/betaal-links worden gegenereerd richting het app-domein
- ✅ `DEPLOYMENT.md` (root) compleet met CloudPanel-stappen voor 2 vhosts, Nginx config, PM2, DNS, MongoDB backup
- ✅ `.env.example` (backend + frontend) met productie-defaults en uitleg
- ✅ SW cache bumped naar `surirent-v6`
- ✅ Legacy `/vastgoed/*` paths blijven als redirect (veiligheidsnet voor oude bookmarks)
- ✅ Tested: backend 55/55 regression + alle frontend flows (admin login, kiosk PIN, tenant portal, legacy redirects)

### Fase E — Shelly smart breakers (2026-05-21) ✅
- ✅ `backend/shelly_service.py` — Shelly Cloud API (control_relay, device_status, list_devices) via httpx
- ✅ Apartment model heeft optioneel `shelly: {device_id, channel, label}` veld voor binding
- ✅ Endpoints (alle scope-filtered op company):
  - `GET /api/shelly/devices` → lijst van apparaten op het Shelly Cloud-account van het bedrijf
  - `PUT /api/apartments/{id}/shelly` body `{device_id, channel, label}` → koppel/ontkoppel (lege device_id ontkoppelt)
  - `GET /api/shelly/apartment/{id}/status` → relay state + power_w + energy_wh
  - `POST /api/shelly/apartment/{id}/control` body `{turn: on|off|toggle}` → flip relay
- ✅ Cross-company isolation: 404 zonder Shelly te lekken
- ✅ Frontend: nieuw `Zap` icoon-knop op elke appartement-kaart → `ShellyControlModal` met device binding, Cloud lijst-picker, AAN/UIT knoppen, status (vermogen + kWh)
- ✅ Tested: 11 nieuwe Shelly-tests (test_shelly.py) + 55 regressie-tests = **66/66 backend pass**

### Mobile dashboard nav (2026-05-21) ✅
- ✅ Hamburger drawer met alle 14 tabs vervangt de horizontale scrollende bottom-bar die functies verstopte
- ✅ `MobileHeader` (sticky top), `MobileTabBar` (4 primaire + Meer-knop), `MobileDrawer` (slide-in met alle tabs + actief bedrijf + uitloggen)
- ✅ Respecteert `safe-area-inset-top/bottom` voor iOS PWA (notch)
- ✅ SW cache → `surirent-v7`

### Kiosk volledige herbouw — oude ERP-stijl + Locaties (2026-05-21) ✅
- ✅ **Nieuwe collectie `locations`** (`{id, company_id, name, address, photo_url, created_at}`) met CRUD endpoints:
  - `GET/POST /api/locations`, `PUT/DELETE /api/locations/{id}` — scope-filtered op bedrijf
  - DELETE ontkoppelt appartementen (zet `location_id` op null)
- ✅ **Apartment.location_id** + **Tenant.internet_amount** + **PaymentIn category `internet`** + **method `uni5pay`** + **`received_by`/`approved_by`** velden
- ✅ **Kiosk endpoints**:
  - `GET /api/kiosk/locations` (incl. synthetische `_none` bucket voor losse appartementen)
  - `GET /api/kiosk/apartments?location_id=…` met filter
  - `GET /api/kiosk/tenants/{id}/overview` returnt nu ook `internet_amount`
  - `GET /api/kiosk/tenants/{id}/payments` — geschiedenis voor de modal
- ✅ **Admin UI**: nieuwe **Locaties tab** (CRUD met foto-preview), locatie-dropdown in `ApartmentForm`, internet-bedrag input in `TenantForm`
- ✅ **Kiosk redesign** (8 stappen, exact zoals oude ERP-screenshots):
  1. Welcome
  2. **LocationSelect** — grid met locatie-cards (foto/MapPin + appartementen-count)
  3. **ApartmentSelect** — grid met grote HUIS-cards + Bezet/Vacant badge, header "Locatie · Kies uw appartement"
  4. **TenantOverview** — split-screen: Financieel overzicht (Maandhuur, Openstaande huur, Servicekosten, Boetes, Internet) links + "Te betalen" + Volgende + Betalingsgeschiedenis rechts
  5. **PaymentHistoryModal** — kwitanties met Afdruk-knop
  6. **PaySelect** — split-screen: checklist (Huur/Service/Boetes/Internet) links + numeriek toetsenbord rechts (typing-mode wist auto-fill bij eerste druk)
  7. **MethodSelect** — 3 grote cards Contant / Mope / Uni5Pay
  8. **PaymentConfirm** + **Receipt** met `approved_by` regel
- ✅ **`KioskFooter`** sticky onderaan met bedrijfsnaam, appt info, Beheerder & Uit knoppen
- ✅ Auto-skip naar appartement-grid wanneer er ≤1 locatie is
- ✅ SW cache → `surirent-v8`
- ✅ Tested: **88/88 backend pass** (22 nieuwe location-tests + 66 regressie) + alle 8 kiosk-stappen + admin Locaties CRUD geverifieerd

### Impersonation UI fix + verification (2026-05-22) ✅
- ✅ **Bug fix**: backend crashte met `NameError: name 'app' is not defined` — `@app.on_event("shutdown")` en `@api.post("/superadmin/run-trial-reminders")` decorators stonden op regel 548/554, vóór `app = FastAPI(...)` op regel 561. Verplaatst: `app.on_event` (no-op) verwijderd, `run-trial-reminders` route nu vlak boven `app.include_router(api)` geplaatst zodat `api` al bestaat.
- ✅ **Impersonation flow geverifieerd via Playwright**: superadmin login → `/api/superadmin/companies/{id}/impersonate` → hard reload naar `/admin` → `ImpersonationBanner` ("Support modus actief · Terug naar SaaS dashboard") zichtbaar, geen lingering dark overlay, "Mijn Abonnement" tab beschikbaar in sidebar. Exit-knop reset cleanly terug naar SaaS dashboard.

### Online betalen voor SaaS-abonnement: Mope (SRD) + SumUp (EUR) (2026-05-22) ✅
- ✅ **Backend**: nieuw `payments_service.sumup_create_checkout/get_checkout` (SumUp v0.1/checkouts, Hosted Checkout) + FX helper die SRD→EUR live haalt van `open.er-api.com` (6h cache) met `manual` override.
- ✅ **Nieuwe endpoints**: `GET /api/billing/fx`, `GET /api/billing/me/checkout-options`, `POST /api/billing/me/checkout` (provider=mope|sumup), `POST /api/webhooks/mope-saas`, `POST /api/webhooks/sumup-saas` (CHECKOUT_STATUS_CHANGED + amount/currency-validatie tegen invoice).
- ✅ **Idempotent payment activation**: `_record_saas_payment_from_gateway()` markeert invoice paid, maakt subscription_payment, activeert bedrijf, past pending_plan toe, stuurt bevestigingsmail — herbruikt door beide gateways.
- ✅ **SaaS Instellingen UI** uitgebreid met aparte **SumUp (EUR)** sectie (merchant_code + API key + sandbox toggle + webhook URL) en **Wisselkoers SRD→EUR** sectie (Auto/Manual). Tijdens build verifieerd: PUT settings persistente, getoonde live koers `1 SRD = €0.0230`, manual override `0.025` werkt → €75,00 voor SRD 3.000.
- ✅ **Mijn Abonnement UI**: nieuwe donkere "Direct online betalen" sectie boven bankgegevens met groene Mope-knop en blauwe SumUp-knop. Knoppen zijn alleen zichtbaar als gateway enabled + credentials aanwezig zijn. Wisselkoersregel toont bron (live/cache/manual).
- ✅ Tested via Playwright: beide knoppen visible bij admin@vastgoed.sr met juiste bedragen, SaaS Settings secties operationeel, webhook URL automatisch afgeleid van window.location.origin.

### Country-aware currency display (NL→EUR, SR→SRD) (2026-05-22) ✅
- ✅ **Backend**: nieuwe helper `_detect_country_currency(phone)` — `+31`/`0031` → NL/EUR, default → SR/SRD. Registratie zet `country` + `currency` op de company.
- ✅ Plan-pricing helper `_plan_for_company()` converteert SRD-prijzen on-the-fly naar EUR via FX-koers voor NL bedrijven. Nieuwe endpoints: `/api/billing/me/plans` (auth, gefilterd op display_currency), `/api/billing/plans?phone=...` (publiek, voor registratiepagina).
- ✅ `/billing/me/checkout-options` filtert gateways op currency: NL → alleen SumUp, SR → alleen Mope. Bank-box wordt verborgen voor EUR-klanten.
- ✅ Invoice-aanmaak (`change_plan`, `_ensure_open_invoice_for_company`) gebruikt nu de display currency van het bedrijf — NL bedrijf krijgt EUR-facturen, SR bedrijf SRD-facturen.
- ✅ **Frontend**: MijnAbonnement & LoginPage tonen `€75,00` voor EUR-klanten, `SRD 3.000` voor SR-klanten. PlanCards en register-flow herladen plans wanneer telefoonnummer verandert.
- ✅ Tested via curl + Playwright: NL test-bedrijf ziet alleen SumUp €125,00, geen bank, plans in EUR. SR-bedrijf ziet alleen Mope, bank-box, plans in SRD.

### Expliciete valuta-controle: landing SRD/EUR toggle + landenkeuze bij registratie (2026-05-22) ✅
- ✅ **Marketing landing**: nieuwe `🇸🇷 SRD / 🇳🇱 EUR` pill-toggle in de Prijzen-sectie. Prijzen worden dynamisch herladen via `/api/billing/plans?currency=...`. Keuze persisteert in `localStorage.preferred_currency`.
- ✅ **Registratiepagina**: nieuwe `Land & valuta` sectie met drie tegels (Suriname SRD / Nederland EUR / Anders SRD). Pre-selectie via localStorage van de landing-toggle. Plan-prijzen verversen direct bij wisselen tussen tegels.
- ✅ **Backend**: `RegisterIn.country` (`SR`/`NL`/`OTHER`) overschrijft de phone-based detectie. `/billing/plans` accepteert nu zowel `?currency=` (expliciet) als `?phone=` (auto). Tested: SR-telefoon (+597) met `country=NL` → bedrijf krijgt `currency=EUR`. NL-telefoon zonder country override blijft EUR.
- ✅ Klanten met een SR-nummer in NL of vice versa kunnen nu expliciet hun valuta kiezen — flexibiliteit toegevoegd zonder de automatische detectie te breken.

### Landing Page Live Editor (CMS in SaaS Beheer) (2026-05-22) ✅
- ✅ **Backend**: nieuwe `landing_content.py` module met `LANDING_DEFAULTS` (volledige schema: brand, nav, hero, stats, features_header, features, pricing_header, pricing_starter, pricing_pro, cta_section, footer + links) en `deep_merge` helper. Twee MongoDB collecties: `landing_content` (`_draft` + `_published`) en `landing_assets` (base64 stored).
- ✅ **6 nieuwe endpoints**: `GET /api/landing/content` (publiek), `GET /api/superadmin/landing/content?mode=draft|published`, `PUT /api/superadmin/landing/content`, `POST /api/superadmin/landing/publish`, `POST /api/superadmin/landing/discard`, `POST /api/superadmin/landing/upload` (max 5 MB, alleen image/*), `GET /api/landing/asset/{id}` (publiek serve).
- ✅ **MarketingLanding gerefactored**: alle TopNav, Hero, StatsStrip, FeaturesSection, PricingSection (header+features), CTASection en Footer halen content van `/api/landing/content` met defaults fallback. Dynamische icon-resolver via `lucide-react` whitelist. Image URLs resolven `/api/landing/asset/*` automatisch via REACT_APP_BACKEND_URL.
- ✅ **LandingEditor.jsx** (730 regels): nieuwe superadmin tab "Landing Editor" met 8 sectie-tabs, form-based editor links + live iframe preview rechts. Wijzigingen worden direct in de iframe getoond via `postMessage` (zonder reload). Sticky action bar met `Concept`/`Gepubliceerd` status badge, "Opslaan concept", "Publiceer", "Reset" knoppen. Image upload met file + URL plak fallback. Repeatable lists voor menu-items, badges, stats, features, footer-links met add/remove/up-down sortering. Icon picker uit 27 allowed lucide icons.
- ✅ **Draft → Publish workflow**: concept wijzigingen zichtbaar in iframe preview maar pas live na expliciete "Publiceer" klik. "Reset" knop restored draft naar gepubliceerde versie. End-to-end getest via Playwright: superadmin → edit "De complete" → "De ultieme" → publish → public landing h1 toont "De ultieme huurbeheer..." direct.

### InstallSection (PWA) bewerkbaar (2026-05-22) ✅
- ✅ **Backend schema**: `install` toegevoegd aan `LANDING_DEFAULTS` met sub-velden `qr` (eyebrow/title/desc/qr_image_url), `ios` (label/title/badge/screenshot_url + steps[]), `android` (idem), `benefits[]`. Allowed icons uitgebreid met `Share`, `Plus`, `Download`, `Apple`, `ScanLine`.
- ✅ **Frontend**: `InstallSection` in MarketingLanding refactored om alle teksten, screenshots, QR-image en stappen uit `c.install` te lezen met defaults fallback. iOS + Android stappen worden gerenderd via `RepeatableList` (icoon + titel + omschrijving).
- ✅ **LandingEditor**: nieuwe sectie-tab "Installeer" met formulier voor alle install-velden. Three nested groep-cards (QR-paneel / iOS-kaart / Android-kaart) elk met eigen Image upload + Repeatable steps lijst + icon picker. Benefits-lijst met add/remove/sort.
- ✅ E2E getest: install eyebrow wijzigen → live preview updated direct via postMessage.

### PWA opent direct in login (geen landing page) (2026-05-22) ✅
- ✅ **Manifest aangepast**: `start_url` van `/` → `/login?source=pwa` en `id` naar `/?source=pwa`. Nieuwe PWA-installaties starten direct op login.
- ✅ **Runtime detectie in MarketingLanding**: detecteert `display-mode: standalone`, `navigator.standalone` (iOS), of `?source=pwa` query → redirect naar `/login`. Bestaande installaties met gecachte oude manifest worden ook automatisch gepatcht.
- ✅ **Escape hatch**: `?landing=1` query bypasst de redirect zodat marketing landing nog steeds bereikbaar is vanuit de PWA indien gewenst.
- ✅ Tested via Playwright: `/?source=pwa` → final URL `/login` met Kiosk PIN. `/?landing=1` → landing page met h1 zichtbaar.

### PWA onthoudt voorkeur-rol (kiosk/admin/huurder) (2026-05-22) ✅
- ✅ **Nieuwe `lib/pwaRole.js` helper**: `getPreferredRole`, `setPreferredRole`, `clearPreferredRole`, `isStandalonePWA`, `routeForRole`. localStorage key `pwa_preferred_role` met `kiosk | admin | tenant`.
- ✅ **Auto-save bij login**: kiosk PIN succes → `setPreferredRole('kiosk')`; admin login/register → `setPreferredRole('admin')`; tenant portal login → `setPreferredRole('tenant')`.
- ✅ **Auto-redirect in `/login`**: bij PWA standalone-modus + opgeslagen rol + bijbehorend token aanwezig → `replace` navigate naar `/kiosk` / `/admin` / `/huurder`. Token-check voorkomt redirect-loops bij verlopen tokens.
- ✅ **`PwaRoleBadge`** UI onderaan: toont actieve standaard-modus + "Wijzig" knop (RotateCcw icoon) die de localStorage clear-t. Verschijnt alleen als er een rol opgeslagen is.
- ✅ **Escape route**: `?pick=1` query parameter bypasst de auto-redirect zodat een gebruiker explicit kan kiezen.
- ✅ End-to-end getest: admin token → /login?source=pwa → /admin redirect; tenant role → /huurder; ?pick=1 toont badge met "Beheerder · Wijzig"; reset clear-t de localStorage.

### Per-bedrijf branding (logo + primaire kleur + naam) (2026-05-22) ✅
- ✅ **Backend**: company schema uitgebreid met `branding.{app_name, primary_color, logo_url, tagline}` (hex validatie + fallback naar `#FF5C00`). 4 nieuwe endpoints: publiek `GET /api/public/companies/{slug}/branding`, auth `GET /api/companies/me/branding`, `PUT /api/companies/me/branding`, `POST /api/companies/me/branding/upload` (hergebruikt `landing_assets` collection met `scope: company`).
- ✅ **`lib/branding.js`** helper: detecteert slug via URL `?c=`/`/c/...`, subdomain (`klant.app.surirent.sr`), of localStorage `pwa_company_slug`. Past primary color toe via CSS variable. Cached in localStorage voor instant render bij volgende load.
- ✅ **LoginPage geheel branding-aware**: header, PIN-kaart, PIN-input borders, en page-achtergrond gebruiken nu de primaire kleur. `CompanyCodePicker` verschijnt wanneer geen branding gedetecteerd → klant tikt eenmalig "surirent" → branding actief. `PwaRoleBadge` uitgebreid met "Bedrijf: X · Wijzig" sectie.
- ✅ **Admin Branding tab** (`Branding.jsx`): logo upload (max 5MB), preset color swatches + native color picker + hex input, app-naam + tagline veld, deelbare link `…/login?c=slug`, **live preview kaart** rechts toont exact wat klanten zien.
- ✅ **Fallback**: onbekende slug → standaard SuriRent oranje branding + automatisch picker tonen zodat gebruiker kan corrigeren.
- ✅ End-to-end getest via Playwright: `/login?c=surirent` met blauwe primary color (#1e88e5) renderde **complete blauwe achtergrond** + header "SuriRent Premium" + PIN-card "Welkom bij SuriRent Premium · Test branding live" + bedrijfs-badge onderaan. Unknown slug en picker-flow werken correct.

### "Mijn URL" kaart + welkomstemail met login-link (2026-05-22) ✅
- ✅ **Backend**: nieuw `GET /api/companies/me/url-info` endpoint dat slug, subdomein URL, universele query URL, en live DNS-status (`active | dns_missing | error | unknown`) teruggeeft via best-effort `/api/health` ping (3s timeout, faalt nooit). Respecteert `SAAS_APP_DOMAIN` env override.
- ✅ **Herbruikbaar `MyUrlCard` component**: donkere gradient-kaart met "Wildcard DNS actief" badge (groen/amber/rose tones), eigen subdomein + universele link, Kopieer-knoppen (clipboard API + "Gekopieerd" feedback), Open knop, Refresh knop voor handmatige re-check. Heeft `compact` mode (alleen subdomein) voor het dashboard overzicht.
- ✅ **Geplaatst op 2 locaties**: bovenaan op het Overzicht-dashboard (compact mode — meteen zichtbaar bij login) én bovenaan in de Branding tab (volledige versie met beide URLs).
- ✅ **Welkomstemail uitgebreid**: nieuwe registratie krijgt nu in de mail (1) een grote oranje "Open mijn omgeving" CTA-knop naar de universele query-URL, (2) de plain-text URL eronder voor kopiëren, (3) een aparte sectie met de subdomein-URL "Of gebruik later uw eigen subdomein (zodra DNS actief is)". Tip-regel onderaan over bookmark/install.
- ✅ E2E getest: card visible op zowel Overview als Branding tab, copy button werkt, DNS status badge toont "Wildcard DNS actief" correct (preview env accepteert wildcard hostnames).

### PDF-onboarding pakket + inline QR-code in welkomstemail (2026-05-22) ✅
- ✅ **Nieuwe `pdf_gen.onboarding_pdf()`** functie: 2-koloms layout met QR-code (gegenereerd via `qrcode` lib), login-info tabel (bedrijf/email/wachtwoord/PIN/pakket/prijs/trial), aparte "iOS — iPhone/iPad" en "Android — Chrome/Edge" install-stappen kaarten, oranje brand-accents (gebruikt company's `primary_color` voor headers). 23 KB per PDF.
- ✅ **`_make_qr_png()` helper** in pdf_gen.py: genereert PNG QR-codes (M error-correction, 360px default) — herbruikbaar voor zowel PDF als inline email image.
- ✅ **email_service uitgebreid**: `_build_message()` parseert nu `'image/png; cid=loginqr; inline'` content-type strings → voegt inline image met Content-ID toe (referencable via `src="cid:loginqr"` in HTML body). `send_platform_email` accepteert nu `attachments` parameter.
- ✅ **Welkomstemail aangepast**: bevat nu (1) een **inline gescande QR-code** in de e-mail HTML body voor mobile scanning, (2) een **PDF-bijlage** `SuriRent_welkomstpakket_<slug>.pdf` met complete onboarding info, (3) tekstuele tip "📎 Bijgevoegd: een PDF welkomstpakket met alle inloggegevens, QR-code en installatie-instructies".
- ✅ **Robuustheid**: try/except rond PDF + QR generatie zodat registratie nooit faalt door een email-issue. AI-quality check op generated PDF bevestigt: QR scannable, info tabel leesbaar, iOS/Android sectie gescheiden, branding accent zichtbaar.
- ✅ Tested via curl-registratie van een dummy bedrijf — geen errors, PDF wordt correct gegenereerd en aangehecht.

### PIN-pagina volledig viewport-responsive + Admin auto-lock (2026-05-22) ✅
- ✅ **`PinLanding` volledig herschreven met `clamp()` + `vh`/`vw`-units**: logo, titel, tagline, PIN-slots, keypad-knoppen, footer en header schalen nu proportioneel mee met de viewport. Min-waarden zorgen voor leesbaarheid op de kleinste telefoons (iPhone-SE1 320×568), max-waarden voorkomen dat het te groot wordt op tablets.
- ✅ **Container** gebruikt nu `h-[100dvh] w-full flex flex-col` + `env(safe-area-inset-*)` padding zodat de pagina exact past op alle phones (320–768px breed, 568–1366px hoog), inclusief PWA-standalone met notch/home indicator.
- ✅ **Geverifieerd**: bij viewport 320×568 (iPhone SE), 375×667, 390×844 (iPhone 12+) → `document.height === viewport.height` (geen scroll). Card en DEL-knop blijven volledig binnen het scherm.
- ✅ **Auto-lock (15 min idle)** in `/admin`: nieuw `lib/useIdleLock.js` hook luistert naar mouse/key/touch/scroll events. Bij inactiviteit → `admin_token` verwijderen → `window.location.assign('/login?locked=1')`. Niet actief voor superadmin (langere SaaS-sessies).
- ✅ **Locked-banner** verschijnt op `/login?locked=1` met merkkleur: "Sessie vergrendeld door inactiviteit — voer uw PIN in om verder te gaan". Verdwijnt zodra de gebruiker een toets indrukt. Kiosk_token blijft behouden → PIN-invoer herstelt direct de admin-toegang (één tik PIN i.p.v. wachtwoord).
- ✅ E2E getest via Playwright: PIN-pagina past op alle telefoonschermen, locked-banner toont correct.

### AI Assistent + Online betalen code/endpoints volledig verwijderd (2026-05-22) ✅
- ✅ **Frontend bestanden verwijderd**: `admin/AIChat.jsx`, `admin/PaymentRequests.jsx`
- ✅ **AdminDashboard**: imports + tab-render cases voor `ai` en `paylinks` weggehaald
- ✅ **Invoices.jsx**: per-factuur "betaallink"-knop + `PaymentLinkDialog` verwijderd
- ✅ **Backend**: `/api/ai/chat`, `/api/ai/sessions/{id}`, `AIChatIn`, `_collect_context()`, `ai_service.py` (bestand weg), `ai_sessions` uit `TENANT_SCOPED_COLLECTIONS`
- ✅ **Backend**: `/api/payment-requests/*` + `/api/webhooks/mope` + helpers weggehaald (per-invoice online betalen flow)
- ✅ **SaaS-billing intact**: `saas_payment_requests`, `/api/billing/...`, `/api/webhooks/mope-saas` ongewijzigd — platform-abonnement betalingen werken
- ✅ Smoke-test: `/api/ai/chat` → 404, `/api/payment-requests` → 404, `/api/invoices` → 200, facturen-tabel toont geen betaallink-knop meer

### PWA shortcuts: aparte "Beheer" + "Kiosk" icoon — beide met PIN (2026-05-22) ✅
- ✅ **Manifest.json**: `shortcuts.kiosk.url` → `/login?source=pwa&target=kiosk`, `shortcuts.beheer.url` → `/login?source=pwa&target=admin`. Beide gaan eerst door PIN-scherm, niet meer direct naar `/kiosk` of `/admin` zonder authenticatie.
- ✅ **LoginPage** detecteert `?target=admin` query → na PIN-success: `setPreferredRole('admin')` + hard navigate naar `/admin` (admin_token is al door backend meegegeven sinds eerdere fix). `target=kiosk` (default) → naar `/kiosk` met `preferredRole='kiosk'`.
- ✅ **Visuele hint** in PIN-kaart bij Beheer-target: titel toont "Beheer · {appName}" + oranje sub-tekst "Voer uw PIN in om naar het Beheer-dashboard te gaan", zodat de gebruiker weet wat hij geopend heeft.
- ✅ **PWA auto-redirect** respecteert nu de `target` query — als de Beheer-shortcut wordt geopend met geldig admin_token, springt het direct naar `/admin` (geen kiosk-redirect meer).
- ✅ Service worker cache bumped naar `surirent-v15` zodat het nieuwe manifest direct doorkomt op bestaande installaties.
- ✅ E2E getest via Playwright: beide shortcuts werken; PIN 1234 → juiste surface met juiste tokens + preferred_role gezet.


- ✅ **Verwijderd uit Sidebar én MobileDrawer**: bedrijfsbadge ("Bedrijf SuriRent N.V. /surirent • pro"), Snel-acties blok (Open Kiosk + Vergrendel nu).
- ✅ **`useIdleLock` hook + bestand verwijderd** + auto-lock call uit AdminDashboard weggehaald. Geen onbedoelde sessie-vergrendeling meer.
- ✅ **`locked` banner en `?locked=1` afhandeling uit LoginPage gehaald** — niet meer relevant zonder auto-lock.
- ✅ Sidebar bevat nu: logo + tab-lijst (direct in beeld) + admin e-mail + Uitloggen. Beheerder kan direct alle tabs zien zonder afleiding.
- ✅ "Open Kiosk" blijft beschikbaar als grote CTA-kaart op het Overzicht-scherm.

### Session 2026-05-23 — Bulk WhatsApp + iOS PWA + Auto-update ✅
- ✅ **Bulk WhatsApp Wizard** in Facturen (Invoices.jsx): één klop per huurder, opent `wa.me` met vooringevulde achterstandstekst, progress-balk, skip-knop, waarschuwt voor huurders zonder telefoonnummer. Browser-veilig (geen popup-block).
- ✅ **iOS PWA edge-to-edge oranje achtergrond** — PinLanding + PasswordView + RegisterSuccess wrappers herschreven naar `position: fixed; inset: 0` met safe-area-padding INSIDE. Geen `h-[100dvh]` of `min-h-screen` meer → witte strook onder home-indicator en notch-overlap zijn weg.
- ✅ **First-paint bg fix v2** — inline `<script>` in `index.html` zet BOTH `documentElement.style.backgroundColor` ÉN `document.body.style.backgroundColor` op `#FF5C00` voor `/login`, `/kiosk`, `/` routes vóór React mount. Drie-laagse bescherming (html + body + wrapper) zodat geen witte strook of flits meer op iOS PWA, ook tijdens reload.
- ✅ **PWA stille auto-update** — `controllerchange` reload wacht nu tot `document.visibilityState === 'hidden'` (gebruiker schakelt naar andere app). Geen UpdateToast meer, geen flikker meer mid-page. Bij volgende open van de PWA draait automatisch de nieuwe versie. Cache-versie bumped naar `surirent-v22`.
- ✅ Smoke tested via Playwright: login + admin + Bulk WhatsApp modal werkend; html/body bg = rgb(255,92,0) op `/login`.

### Session 2026-05-23 — Huurder Kiosk (Tenant Kiosk) ✅
- ✅ **Nieuwe route `/kiosk/huurder`** (+ legacy redirect `/vastgoed/kiosk/huurder`) → `TenantKioskLayout` — een fysiek-stijl kiosk voor huurders zelf (los van de bestaande reception/admin kiosk).
- ✅ **Flow**: e-mailadres invoeren → 4-cijferige PIN-pad → dashboard met 4 grote actie-tegels (Betalen, Onderhoud, Mijn gegevens, Contact) + saldo-strook. Idle auto-logout na 90s.
- ✅ **2 nieuwe backend endpoints** (huurder-scoped, body kan NIET tenant_id/company_id overrulen):
  - `GET /api/tenant-portal/invoices` — alle facturen van de ingelogde huurder
  - `POST /api/tenant-portal/payments` — registreert een betaling (auto-link aan factuur, marks paid bij ≥95%, push naar admins). Cross-tenant invoice_id → 404.
- ✅ **Login body** verschoven naar `{identifier, pin}` (komt overeen met backend `TenantLoginIn`).
- ✅ Geverifieerd: 16/16 nieuwe pytest tests (`test_tenant_kiosk.py`) + frontend e2e via Playwright (email → PIN → dashboard → Pay/Onderhoud flows). Iteration 10 report.

### Session 2026-05-23 — QR-sticker per appartement (deur-tot-kiosk) ✅
- ✅ **Publieke lookup**: `GET /api/tenant-portal/lookup-apartment/{apt_id}` → `{apartment, tenant: {name, email, first_name}, company}`. Zonder auth. 404 voor onbekende of nog-niet-PIN-toegewezen appartementen. **PII-guard**: geen `pin_hash`, geen telefoon, geen saldo in respons.
- ✅ **Print-poster**: `GET /api/apartments/{apt_id}/kiosk-sticker.pdf` (publiek) — A4 PDF met grote QR-code → `/kiosk/huurder?apt=<id>`, appartement-nummer + adres + bedrijfsnaam, gekleurd met de bedrijfsbranding (`primary_color`).
- ✅ **PDF helper** `kiosk_sticker_pdf()` in `pdf_gen.py` (gebruikt `_make_qr_png` op 600px) — 43 KB per poster.
- ✅ **Frontend `TenantKioskLayout`**: leest `?apt=...` query-param → roept lookup aan → slaat de e-mail-stap over → toont direct PIN-pad met "Welkom &lt;Voornaam&gt;" + "Appartement &lt;nummer&gt;". In QR-mode is de "Andere e-mail"-link verborgen (locked-flag).
- ✅ **Fallback**: onbekend/ongeldig `?apt=...` → valt netjes terug op de normale e-mail+PIN-flow zonder crash.
- ✅ **Admin UI**: nieuwe `QrCode`-icon-knop op elke appartement-kaart in Appartementen-tab — opent de sticker-PDF direct in een nieuw tabblad. Branded oranje (`bg-[#FFE6D3] text-[#C74600]`).
- ✅ Geverifieerd: 9 nieuwe pytest cases (`test_kiosk_qr_sticker.py`) + frontend Playwright e2e (Welkom-prefill, geen email-input, fallback bij ongeldige apt-id, admin-knoppen aanwezig). Iteration 11 report.

### Session 2026-05-23 — Huurder Kiosk: PIN-only + admin-kiosk redesign ✅
- ✅ **Per-bedrijf PIN-uniqueness** afgedwongen op `POST /api/auth/tenant-set-pin`: wanneer admin een PIN instelt die al in gebruik is door een andere huurder van hetzelfde bedrijf → `409` met `detail` die de naam van de conflicterende huurder bevat. Zelfde-tenant idempotent (geen vals 409 tegen zichzelf). Cross-company isolation behouden — PIN `5678` kan in bedrijf A én bedrijf B bestaan.
- ✅ **Nieuwe endpoint** `POST /api/tenant-portal/pin-login` body `{pin, company_slug?, company_id?}` → één unieke huurder zoeken binnen het bedrijf, token uitgeven. 401 bij verkeerde PIN, 400 zonder bedrijfscontext. Brute-force throttle (8 fails → 429) per IP+company.
- ✅ **Frontend volledig herontworpen** (`TenantKioskLayout.jsx`) in admin-kiosk-stijl:
  - **PIN-only login** — geen e-mail-stap meer (de QR-sticker geeft `apt=<id>` mee voor "Welkom &lt;Voornaam&gt;", standalone modus haalt `company_id` uit branding).
  - **Branded oranje gradient** achtergrond (volgt `branding.primary_color`).
  - **Hero-stijl welkom**: groot logo (of huis-icon), "HUURDER KIOSK" eyebrow, "Welkom &lt;naam&gt;", appartement-badge bij QR-mode.
  - **Groot PIN-pad** met framer-motion: PinDots met shake-animatie bij fouten, knoppen met depth-shadow + active translate-Y, haptic feedback via `navigator.vibrate`.
  - **Dashboard** met saldo-banner (rood bij achterstand, groen bij volledig bij) + 4 actie-tegels (Betalen/Onderhoud/Mijn gegevens/Contact), elk met eigen accent (oranje/sky/emerald/violet) + hover lift.
  - **`framer-motion` AnimatePresence** voor view transities (slide-in/out).
  - **Sticky witte footer** met bedrijfsnaam + huurder-naam + "Uit"-knop (matched admin-kiosk pattern).
  - Idle auto-logout na 90s blijft behouden.
- ✅ Geverifieerd: **15 nieuwe pytest cases + 24 regressie + frontend Playwright e2e (iteration 12)**. Wrong PIN → shake + auto-clear, juiste PIN → dashboard, alle 4 tegels navigeerbaar, QR-mode prefill, no-context graceful error. Zero issues.

### Session 2026-05-23 — Huurder Kiosk polish v2 ✅
- ✅ **PIN dots zichtbaarheid**: dots vergroot naar 24px (w-6/h-6), 3px massieve witte rand. Gevulde staat = donker slate-900 (was wit op oranje, nu donker op wit-met-rand → enorme contrast). Error-state in rood. Resultaat: huurders zien meteen hoeveel cijfers ze al getypt hebben.
- ✅ **Dashboard volledig herbouwd in admin-kiosk split-screen stijl** (i.p.v. eerdere "balance banner + tile grid"):
  - **LEFT card (3/5 breed)** — "Financieel overzicht" met line-items voor Maandhuur / (Openstaande huur, hoogtepunt) / Servicekosten / Boetes / Internet + grote "Totaal openstaand" footer-regel.
  - **RIGHT card (2/5 breed)** — grote "Te betalen" amount + primary CTA-knop. Wisselt naar emerald-groen "Saldo SRD 0,00 · U bent volledig bij. Bedankt!" + "Bekijk facturen" wanneer er geen achterstand is.
  - **3 secondary tiles** onder de CTA: Onderhoud / Gegevens / Contact (compacte iconenrij i.p.v. de eerdere 4 grote tegels).
- ✅ **CompanyPicker fallback** — `/kiosk/huurder` zonder `?c=` en zonder QR-link → toont "Welk bedrijf?" kaart met text-input (`tk-slug-input`) en doorgaan-knop. Onbekende slug → inline foutmelding. Probeert eerst `/api/public/branding-default` (single-tenant systemen): geeft 200 als er exact 1 bedrijf is, anders 404 → picker.
- ✅ **Nieuw publiek endpoint** `GET /api/public/branding-default` voor single-tenant deployments. 4 nieuwe pytest tests.
- ✅ **Admin TenantPinModal verbeterd**: na opslaan toont de modal een groen succesblok met "PIN &lt;X&gt; is ingesteld voor &lt;Naam&gt;", de complete Huurder-Kiosk URL (`window.location.origin/kiosk/huurder?c=&lt;slug&gt;`) met "Kopieer"-knop, een "Open Huurder Kiosk" anchor (opens new tab) én een "Sluiten" knop. Admin weet nu direct waar de huurder kan inloggen.
- ✅ Geverifieerd: **4 nieuwe pytest + 43 regressie + frontend Playwright e2e (iteration 13)** — alle groen. PIN dots visueel duidelijk, dashboard 1-op-1 admin-kiosk stijl, picker werkt, modal-flow met copy/open knoppen volledig functioneel.

### Session 2026-05-23 — Klantenscherm (Customer Display) ✅
- ✅ **Live-mirror display** voor de admin Kiosk — een aparte read-only pagina op `/kiosk/klant?c=<slug>` die toont wat de receptie/admin op dat moment doet. Werkt op een 2e monitor, tablet of TV in de wachtruimte.
- ✅ **Backend (3 nieuwe endpoints)**:
  - `PUT /api/kiosk/customer-display` — admin Kiosk pusht state (kiosk_token vereist). Body: `{step, apartment?, tenant?, overview?, payload?, payment?}`. Upserts naar nieuwe collection `customer_display` per `company_id`.
  - `DELETE /api/kiosk/customer-display` — reset naar idle bij uitloggen (kiosk_token).
  - `GET /api/public/customer-display/{slug}` — publiek polling endpoint (1.5s cadence). Geeft `{branding, state}` terug. Stale state (>5 min geen update) → auto-reset naar idle.
- ✅ **Admin Kiosk wijziging**: `KioskLayout` heeft een nieuwe `useEffect` die op elke state-verandering automatisch `PUT /api/kiosk/customer-display` doet. Geen kostbare info gestuurd — alleen wat de klant mag zien (geen pin_hash, geen company_id).
- ✅ **6 phases op het klantenscherm** met framer-motion transitions:
  - `idle/check` → **IdleScreen**: groot bedrijfslogo, "WELKOM BIJ &lt;naam&gt;", subtitel "Een medewerker helpt u zo", pulse-animatie op logo.
  - `select` → **GreetScreen**: "WELKOM &lt;voornaam&gt;" + appartement-badge.
  - `overview` → **OverviewScreen**: zelfde split-screen layout als de admin Kiosk's TenantOverview — links specificatie (Maandhuur / Openstaande huur / Servicekosten / Boetes / Internet), rechts groot "Te betalen" bedrag.
  - `pay` → **PayScreen**: checklist van geselecteerde categorieën + groot lopend totaal in oranje.
  - `method / confirm` → **MethodScreen**: betaalmethode icoon (Banknote/CreditCard/Smartphone) + bedrag in mega-letters.
  - `receipt` → **ReceiptScreen**: groene CheckCircle spring-bounce + bedrag + kwitantienummer + "Bedankt voor uw betaling!".
- ✅ **Slug picker fallback** wanneer `/kiosk/klant` zonder `?c=` geopend wordt — eenmalige bedrijfscode-invoer, daarna start het scherm.
- ✅ **Branded oranje gradient** achtergrond volgt `branding.primary_color`. Footer rechtsonder toont "KLANTENSCHERM" + bedrijfsnaam.
- ✅ Geverifieerd: **10 nieuwe pytest cases (`test_customer_display.py`) + 43 regressie + frontend Playwright e2e live-sync (iteration 14)** — admin tab selecteert appartement → klant tab toont GreetScreen binnen 2s. Polling cadence 1.5s werkend.

### Per-bedrijf Branded Routes (uitgebreid — 2026-05-24)
- ✅ **`/c/:slug/*` URL-prefix** met `BrandedShell` die per bedrijf branding (kleur, logo, naam) ophaalt en de CSS-vars zet vóór de child rendert.
- ✅ **Branded sub-routes**: `/c/<slug>/`, `/c/<slug>/login`, `/c/<slug>/kiosk`, `/c/<slug>/kiosk/huurder`, `/c/<slug>/kiosk/klant`, `/c/<slug>/admin`, `/c/<slug>/huurder`, `/c/<slug>/huurder/portaal`.
- ✅ **404 voor onbekende slug** — toont nette "Bedrijf niet gevonden" kaart i.p.v. door te lopen op default branding.
- ✅ **`useBrandedNavigate()` hook** (`/app/frontend/src/lib/branded-nav.js`) — drop-in replacement voor `useNavigate()` die alle absolute navigations (`/login`, `/admin`, `/kiosk`, `/huurder`) automatisch prefixt met `/c/<slug>` wanneer de gebruiker binnen branded context zit. Toegepast in: LoginPage, KioskLayout, TenantKioskLayout, AdminDashboard, TenantLoginPage, TenantDashboard.
- ✅ **Subdomain branding** blijft werken via bestaande `detectCompanySlug()` + `/api/public/branding-by-host` (klant.app.surirent.sr → slug=klant).


### QR-codes voor branded URLs (uitgebreid — 2026-05-24)
- ✅ **Backend endpoint** `GET /api/companies/me/qr.png?kind=<login|kiosk|tenant_kiosk|customer_display|tenant_portal|query>&size=160-800` — auth-required; bouwt URL server-side via `_QR_KIND_PATHS` (phishing-safe); levert PNG via `qrcode[pil]`.
- ✅ **`QrCodeModal` component** (`/app/frontend/src/components/QrCodeModal.jsx`) — fetcht PNG als blob via axios met Bearer-auth, toont in modal met kopieer-URL + Download PNG + Open knoppen. Clipboard fallback via `document.execCommand('copy')` voor browsers zonder Clipboard API.
- ✅ **`MyUrlCard` integratie** — QR-iconen op alle 5 URL-rijen (subdomein, branded pad, admin kiosk, huurder kiosk, klantenscherm) in de Branding tab van de Admin Dashboard.
- ✅ Geverifieerd: **20 nieuwe pytest cases (`test_qr_endpoint.py`) — alle kinds, auth, size-clamp, pyzbar-decode** + frontend e2e modal-open / download / kopieer (iteration_16 100% pass). Bonus: refactor-miss in AdminDashboard.jsx (3 vergeten `useNavigate` → `useBrandedNavigate`) opgelost.

### Mobile-only POS-stijl Betalingen (uitgebreid — 2026-05-25)
- ✅ **Telefoon-specifieke Betalingen pagina** (`md:hidden`, < 768px) — POS-terminal look gebaseerd op gebruikersmockup: grote "Betalingen" titel + "Vandaag" stat-kaart rechtsboven, gradient "Nieuwe betaling" pill, tab-pills (Alle/Vandaag/Week/Maand) met oranje underline, vierkante filter-icoon, soft-cream payment cards met avatar + naam + adres + CONTANT pill + groot groen bedrag.
- ✅ **Inline expand-detail** — tikken op een kaart toont Kwitantie/Datum/Categorie/Notitie + PDF/Verstuur/QR knoppen in een emerald-tint paneel.
- ✅ **Tablet + desktop ongewijzigd** (>= 768px): bestaande KPI cards + tabelweergave blijft werken (verified op 1440px viewport).
- ✅ State + handlers gedeeld met bestaande Payments component (zelfde load/filter/expand logica) — geen DRY-schending.


### PWA fix (2026-02-26)
- ✅ **iOS PWA install-naam + start_url bug FIXED** — Het inline `<head>`-script in `index.html` controleerde `/kiosk` vóór `/kiosk/huurder`, waardoor de tenant kiosk route werd herkend als de algemene `kiosk` rol. Resultaat: PWA werd geïnstalleerd met de kiosk-naam/manifest, en startte bij `/kiosk?source=pwa` (vastgoed kiosk) in plaats van `/kiosk/huurder?source=pwa` (huurder kiosk). Volgorde aangepast: specifieke routes (`/kiosk/klant`, `/kiosk/huurder`) eerst, daarna pas algemene `/kiosk`.
- ✅ Static `<title>` van "SuriRent" → "App" zodat fallback niet brand-naam toont vóór script runt.
- ✅ Service Worker cache versie gebumpt v49 → v50 om oude cache van iOS/Safari te invalideren.
- Verified via screenshot tool: `/kiosk/huurder` → manifest-huurder.json + title "Huurder" + theme #10B981 ✅

## Prioritized Backlog (Fases E-F)
- 📧 **Email notificaties** — wacht op SendGrid / Resend credentials van user
- 📱 **WhatsApp/SMS herinneringen** — wacht op Twilio credentials

### Huurportaal-poster · Share Feature (2026-02-26)
- ✅ **Algemene huurportaal A6 poster** — `GET /api/companies/me/portal-poster.pdf` genereert printbare A6-kaart (105×148mm) met grote QR, bedrijfsnaam, "Scan voor mijn huurportaal" — QR linkt naar `/c/<slug>/huurder` (branded).
- ✅ **Per-huurder A6 poster** — `GET /api/tenants/{id}/portal-poster.pdf` met QR die de identifier (email/telefoon) vooringevuld geeft via `?identifier=…`. Huurder hoeft alleen PIN te tikken.
- ✅ **TenantLoginPage prefill** — `/huurder?identifier=jan@example.sr` slaat identifier-stap over en gaat direct naar PIN keypad, met identifier in back-button.
- ✅ **Branding / "Uw login-URL" card** uitgebreid met "Mijn Huurportaal · deel met huurders" rij — QR + Print poster + Kopieer + Open knoppen.
- ✅ **Huurders tabel** uitgebreid met groene Printer-knop per rij voor per-huurder A6 poster.
- ✅ Nieuwe helper `portal_poster_pdf()` in `pdf_gen.py` + `_build_a6()` voor A6 paginagrootte.
- ✅ Nieuwe veld `tenant_portal_url` in `/companies/me/url-info` response.
- Verified via curl: beide endpoints HTTP 200, PDF 35–44KB. Frontend smoke test: pill zichtbaar op Branding, 2 printer-knoppen op Huurders tabel, prefill werkt op `/huurder?identifier=…`.

- 💳 **Payment gateways** (SumUp/Mope/Uni5Pay) — wacht op credentials

### Refactor: /huurder route afgeschaft → kiosk/huurder is enige tenant login (2026-02-26)
- ✅ **Routes verwijderd**: `/huurder` en `/huurder/portaal` (TenantLoginPage + TenantDashboard pagina's verwijderd).
- ✅ **Legacy redirects**: `/huurder` → `/kiosk/huurder` (zowel root als branded `/c/<slug>/huurder`).
- ✅ **QR-codes ompunten**: zowel algemene als per-huurder poster linkt nu naar `/c/<slug>/kiosk/huurder` (PIN-only via QR).
- ✅ **Backend `_QR_KIND_PATHS.tenant_portal`** verwijst naar `kiosk/huurder` (legacy field gehandhaafd voor compat).
- ✅ **`tenant_portal_url`** in `/companies/me/url-info` is nu identiek aan `tenant_kiosk_url`.
- ✅ **Per-huurder poster**: identifier-prefill verwijderd (niet meer nodig, PIN identificeert). Toont nog wel naam + appartement op de poster zelf.
- ✅ **pwa-manifest.js + index.html inline script**: `/huurder` rol-detectie verwijderd (route bestaat niet meer).
- ✅ **pwaRole.js**: `routeForRole('tenant')` → `/kiosk/huurder`.
- ✅ **MarketingLanding footer**: tenant_portal link → `/kiosk/huurder`.
- Verified: /huurder, /huurder/portaal en /c/surirent/huurder redirecten allemaal naar `/kiosk/huurder` (eventueel branded). Branded `/c/surirent/kiosk/huurder` toont meteen "HUURDER KIOSK · SuriRent" PIN keypad met juiste branding.

- 🤖 **AI assistent Nederlandse chat** — via Emergent LLM key
- 🔔 **PWA push notificaties** — geen externe key, VAPID generen
- 🔐 **AES-256 versleutelde PDFs** + QR verificatie


### QR-code URL + Auth Fixes (2026-02-26)
**Drie bugs gevonden bij testen van de QR-functionaliteit:**

- ✅ **Apartement kiosk-sticker QR onleesbaar** — `_public_url("/kiosk/huurder?apt=…")` gaf alleen het relatieve pad terug omdat backend geen `APP_PUBLIC_URL` env var heeft. **Fix:** endpoint accepteert nu `Request`, gebruikt `_company_base_url()` voor absolute URL + branded `/c/<slug>/` pad.

- ✅ **Company/Tenant poster QR miste subdomein** — `_company_base_url` knipte de eerste DNS-component af zodra de host >= 4 delen had ("vastgoed-app.preview.emergentagent.com" → "preview.emergentagent.com"). Dit was bedoeld voor "slug.app.surirent.sr" → "app.surirent.sr" recovery, maar brak elke preview-omgeving. **Fix:** strip-logica volledig verwijderd; path bevat al `/c/<slug>/…` dus branding werkt op elk (sub)domein.

- ✅ **Per-tenant poster gaf 401 "Niet ingelogd"** — `window.open(url)` stuurt geen `Authorization: Bearer` header en de cookie was niet altijd beschikbaar in nieuwe tabs. **Fix:** nieuwe `openAuthedPdf(path)` helper in `lib/api.js` — fetch met `responseType:'blob'` (inclusief Bearer header) + opent blob URL in nieuw tabblad. Toegepast op company poster + tenant poster knoppen.

- ✅ **Bonus:** legacy duplicaat code (dood) onderaan `server.py` opgeruimd (12 regels indentatie-fout die backend voorkwam te starten).

**Verified via QR decode (pyzbar):**
- APT_STICKER: `https://vastgoed-app.preview.emergentagent.com/c/surirent/kiosk/huurder?apt=…`
- COMPANY_POSTER + TENANT_POSTER: `https://vastgoed-app.preview.emergentagent.com/c/surirent/kiosk/huurder`
- Frontend network test: Tenant poster fetch → HTTP 200 application/pdf

### Fase 3 (multi-bedrijf)
- Multi-bedrijf SaaS (companies, subscription, superadmin)
- Tenant portal (huurder login + betalingsgeschiedenis)
- Custom domein per bedrijf

### Fase 4 (hardware)
- Shelly smart breakers per appartement
- Tenda router koppeling (internet plannen)
- Eigen domein + SSL deployment

### Mobile PWA Beheerder polish (2026-02-26)
Zes UI-verbeteringen voor de mobiele Beheer-PWA om premium/iOS-native te voelen:

1. ✅ **Achtergrond**: van beige `#FFF7F0` → licht grijs `#F7F8FA` (mobile only, desktop houdt cream). Witte cards komen nu duidelijker naar voren.
2. ✅ **Bedragen donkerblauw**: `text-emerald-600` → `text-slate-900` in MobilePaymentCard, MobileTenantCard, "Vandaag" stat-card, "Open" stat-card. Rood/oranje blijft voor achterstand. Status badges behouden hun groene "Op tijd" pill.
3. ✅ **Cards compacter**: padding `clamp(14,4vw,20)` → `clamp(11,3.4vw,16)`, avatars `48-60px` → `42-52px`, ruimte tussen cards `space-y-3` → `space-y-2.5`, `rounded-3xl` → `rounded-2xl`, shadow lichter.
4. ✅ **Status badges distinct**: nieuwe `METHOD_PILL_CLASSES` map — CONTANT=oranje, BANK=slate, MOPE=paars, SUMUP=roze, UNI5PAY=blauw (was allemaal groen).
5. ✅ **Header polish**: subtitle "BEHEER · PRO" naar `slate-400` (subtieler), bell-icoon 14→12 op mobile, logo-shadow zachter (`0.55` → `0.45`).
6. ✅ **Bottom nav polish**: FAB `w-11 h-11` → `w-10 h-10` op mobile, shadow van `0.65` opacity → `0.45`, ring `3px` → `[3px]`, border kleur subtieler.

Files: `AdminDashboard.jsx`, `OverdueBell.jsx`, `Payments.jsx`, `Invoices.jsx`.
Verified via mobile screenshot (393×852): alle wijzigingen zichtbaar en consistent.


### Tech debt (van code review)
- Splits `server.py` (~1460 regels) in routers per resource

### Overzicht polish + Desktop consistentie (2026-02-26)
- ✅ **Root background**: van `#FFF7F0` (beige) → `#F7F8FA` (licht grijs) op **alle viewports** (was eerder alleen mobile).
- ✅ **Sidebar**: cream gradient + oranje shadow → strak wit met slate-100 border + minimale shadow.
- ✅ **Overzicht stat-cards**: padding `p-6` → `p-5`, iconen `w-11→w-10`, `text-4xl` → `text-3xl`, borders `orange-100` → `slate-100`, subtiele shadow toegevoegd.
- ✅ **Income/Outstanding hero**: oranje gradient verwijderd → strakke witte card met slate-100 border en oranje iconen.
- ✅ **Status Overzicht + Laatste Activiteiten**: borders `orange-100` → `slate-100`, kleinere padding.
- ✅ **Donut-percentage**: 50% nu in `slate-900` ipv emerald-600.
- ✅ **CTA's onderaan**: padding `p-6` → `p-5`, iconen kleiner.
- ✅ **Desktop Payments row**: bedrag `text-emerald-600` → `text-slate-900`, "Vandaag" total ook slate, "Betaald bedrag" detail-panel amount ook slate (panel-bg blijft groen als BETAALD-indicator).
- Verified via screenshot tool (1440×900 desktop + 393×852 mobile): alle wijzigingen consistent zichtbaar.

- PDF endpoints zijn public via UUID — voor productie: signed/expiring tokens
- Deposit `deduction <= amount` validatie strenger maken

### Appartementen + Huurders pagina polish (2026-02-26)
- ✅ **Appartementen kaarten**: oranje borders → slate-100 + subtiele shadow, padding `p-5` → `p-4`, oranje gradient Maandhuur-blok → strakke slate-50 met slate-100 border, gap `gap-4` → `gap-3`.
- ✅ **Appartementen actie-knoppen**: QR-knop `bg-[#FFE6D3]` → `bg-orange-50` (subtieler, alleen accent), Shelly-knop ook subtieler.
- ✅ **Appartementen empty state**: oranje strepen → slate-200 dashed, icoon-kleur slate-300.
- ✅ **Huurders tabel container**: oranje borders → slate-100 + subtiele shadow.
- ✅ **Huurders tabel-header**: `bg-orange-50/50` → `bg-slate-50/70`, tekst `slate-500` → `slate-400`.
- ✅ **Huurders rij-borders**: oranje-50 → slate-100, hover slate-50/60 (was orange-50/30).
- ✅ **Huurders maandhuur kolom**: `text-slate-700 semibold` → `text-slate-900 bold`.
- ✅ **Huurders empty state**: oranje icon → slate-300.
- Verified via screenshot (1440×900): beide pagina's consistent met Overzicht/Betalingen/Facturen — uniform premium SaaS look.

- Maintenance reopen `resolved_at` clearen


### Locaties, Contracten, Onderhoud, Borg, Kasgeld polish (2026-02-26)
Zelfde patroon toegepast op de laatste 5 admin-pagina's voor volledige Beheer-suite uniformiteit:

- ✅ **Locaties** (`Locations.jsx`): card border `orange-100` → `slate-100` + shadow, empty-state icoon → `slate-300`.
- ✅ **Contracten** (`Contracts.jsx`): tabel-container `orange-100` → `slate-100`, header `bg-orange-50/50` → `bg-slate-50/70`, row-borders `orange-50` → `slate-100`, hover `slate-50/60`.
- ✅ **Onderhoud** (`Maintenance.jsx`): ticket-cards `orange-100` → `slate-100` + subtiele shadow.
- ✅ **Borg/Deposits** (`Deposits.jsx`): tabel-container + header + row-borders → slate.
- ✅ **Kasgeld** (`Kasgeld.jsx`): balance-cards (positief) `orange-100` → `slate-100` + shadow, tabel idem. Rode (negatief) balance behoudt rode styling als waarschuwing.

Lint clean. Verified via desktop screenshots (1440×900): élke admin-pagina (Overzicht, Locaties, Appartementen, Huurders, Contracten, Betalingen, Facturen, Borg, Kasgeld, Onderhoud) gebruikt nu hetzelfde patroon — uniform premium SaaS look.


### Mobile Payment expand + Bottom-nav FAB curve (2026-02-26)
- ✅ **Mobile Betaling-detail uitgebreid**: van 4 naar 6+ rijen (Kwitantie, Factuur, Datum, Categorie, **Methode**, Periode, **Goedgekeurd door**, Notitie) — matcht nu de desktop view. Detail-paneel ook van `bg-emerald-50/70` → `bg-slate-50` + slate-100 border (consistent).

### Approval Workflow voor Kiosk-medewerker betalingen (2026-02-26)
**Doel:** Betalingen van kiosk-medewerkers vereisen eerst beheerder-goedkeuring met handtekening voordat ze als "ontvangen" tellen.

**Backend (`server.py`):**
- Nieuwe velden op Payment: `status` (approved | pending_approval | rejected), `kiosk_employee_id`, `kiosk_employee_name`, `approved_at`, `approved_by_user_id`, `signature_data_url`, `rejected_reason`.
- Nieuwe velden op Employee: `app_role` ("admin" | "boekhouder" | "kiosk"), `kiosk_pin_hash`, `has_kiosk_pin`.
- `_create_payment_doc()` accepteert nu `status` + kiosk metadata. Pending betalingen koppelen GEEN factuur (pas bij approval).
- `GET /api/payments?status=approved|pending_approval|all` — default sluit pending uit (totalen kloppen).
- `GET /api/payments/pending-count` — lichte counter voor bell-badge.
- `POST /api/payments/{id}/approve` — beheerder zet handtekening (`signature_data_url` data URL), factuur wordt alsnog gekoppeld + gesloten.
- `POST /api/payments/{id}/reject` — beheerder wijst af met reden.
- `POST /api/employees/{id}/kiosk-pin` — beheerder zet 4-6 cijferige PIN, employee krijgt `app_role=kiosk`.
- `POST /api/kiosk/employee-verify` — kiosk verifieert medewerker-PIN, returnt id+naam.
- `POST /api/kiosk/payments?employee_id=X&employee_pin=Y` — bestaand endpoint uitgebreid: met employee_id → status=`pending_approval` + push naar admins; zonder employee_id → legacy direct approved.

**Frontend:**
- Nieuwe `<SignaturePad>` component — canvas met touch/muis support, retina-correct, "Wissen" button, geeft PNG data URL terug via onChange.
- `Payments.jsx` laadt nu pending parallel met approved + tonen ze in aparte "⏳ Wacht op goedkeuring · N" amber sectie bovenaan.
- `<PendingPaymentCard>` met avatar, "Door Maria K. · Contant", amber bedrag, groene "Goedkeuren" knop.
- `<ApprovePaymentSheet>` bottom sheet met betaling-info paneel, SignaturePad, en zowel "Goedkeuren" als "Afwijzen" met optionele reden.

**Verified ✅:**
- End-to-end backend test: pending creation → list filter → approve → factuur gekoppeld + gesloten → pending count terug naar 0
- Legacy `/kiosk/payments` zonder employee_id blijft direct approved (backward compat)
- Mobile screenshots tonen: pending sectie bovenaan, goedkeur sheet met handtekening canvas werkend
- Lint clean (Python + JavaScript)

**Nog te bouwen (P1 vervolg):**
- Beheer UI om kiosk-medewerker PIN te kunnen instellen (Employees pagina)
- Receptie Kiosk UI: "Medewerker kiezen + PIN" stap vóór betaling registreren
- Bell-badge in admin header met `/payments/pending-count`

### Session 2026-02-26 — Approval Workflow afronden ✅
- ✅ **Kiosk Employee Bar — mobile**: floating badge linksonder in `/kiosk` (md:hidden, gebruikt safe-area-inset-bottom). Toont actieve medewerker of "Medewerker login" CTA. Tikken → opent `KioskEmployeeLoginSheet` met PIN-pad. Auto-trigger op stap='pay' indien geen sessie.
- ✅ **Desktop Pending Section**: `Wacht op goedkeuring` amber sectie nu OOK in desktop layout (`hidden md:block` branch) van `/admin/payments`. Voorheen alleen `md:hidden`. Beheerder kan nu betalingen goedkeuren zonder mobiel viewport.
- ✅ **ESLint fix**: `react-hooks/exhaustive-deps` rule disable comment vervangen door `eslint-disable-next-line` (rule was niet geconfigureerd in deze codebase).
- ✅ **Backend pytest** `/app/backend/tests/test_payment_approval_workflow.py` — 12/12 PASS covering: kiosk PIN, employee-verify, pending payment creation, pending-count, approve+signature, invoice link, reject reason, legacy direct-approve fallback (no employee_id).
- ✅ **Frontend e2e** (iteration_17): mobile kiosk flow PIN → apt → Volgende → auto Employee Login Sheet (PIN 9999) → Huur → Contant → Bevestig → Receipt. Admin flow: Bell badge increments → desktop pending sectie → ApprovePaymentSheet → SignaturePad draw → Goedkeuren → badge decrements + payment moves to approved list.

### Session 2026-02-26 — 3 follow-up fixes: receipt naam, admin skip, mobile PWA reset ✅
- ✅ **Medewerker NAAM op kwitantie**: `_create_payment_doc()` populeert `received_by` automatisch met `kiosk_employee_name` als geen expliciete value gegeven. PDF kwitantie (`pdf_gen.receipt_pdf`) toont "Ontvangen door" row direct boven het bedrag + apart "Goedgekeurd door" als verschillend. Kiosk receipt UI toont nu een oranje banner met avatar-initials boven het bedrag (`data-testid="receipt-received-by-banner"`).
- ✅ **Admin skipt medewerker-prompt**: in `KioskLayout` controleert het `step==='pay'`-effect nu eerst `admin_token` — admins krijgen de `KioskEmployeeLoginSheet` niet meer (legacy directe approval flow). De mobile floating bar en desktop bottom-bar `KioskEmployeeBar` zijn ook verborgen voor admins (`!hasAdminAccess`).
- ✅ **Mobile PWA login fix** (Android + iPhone): 
  - Nieuwe 401-response-interceptor in `lib/api.js` ruimt stale tokens op (`admin_token`, `kiosk_token`, `tenant_token`) + sessionStorage employee-keys, en hard-redirecten naar `/login?stale=1`. Voorkomt redirect-loops bij verlopen tokens op PWA.
  - `KioskLayout.exit()` doet nu een **volledige reset**: alle localStorage-tokens (admin + kiosk + company + active_company_id), `pwa_preferred_role`, sessionStorage employee, en hard-navigate naar `/login?pick=1`. Een volgende medewerker krijgt direct de PIN-keypad.
  - `AuthProvider.logout()` ruimt ook `pwa_preferred_role`, `kiosk_company` en sessionStorage emp-keys op.
  - SW cache bumped naar `surirent-v51`.
- ✅ **Tested (iteration_19)**: 25/25 backend (5 new + 20 regression) + frontend met stale-token reproductie (admin_token='invalid-xyz' → /admin → automatic redirect naar /login?stale=1 → token cleared, PIN keypad zichtbaar).

### Session 2026-02-26 — Pending-approval push notificaties ✅
- ✅ **Backend** `kiosk_create_payment` differentieert nu de push-melding:
  - Pending: title `"Goedkeuring nodig · SRD 7.000"`, body `"Door Maria K. · Bharat · Appt. 7B"`, `data.kind='payment_pending_approval'`, `data.url='/admin/payments?filter=pending'`, `data.require_approval=true`
  - Approved (legacy/admin): originele `"Betaling X"` title behouden
- ✅ **Service Worker** (`sw.js` v52): `require_approval=true` triggert **sticky banner** (`requireInteraction=true`), langere vibratie, **unieke tag per payment_id** zodat meerdere pending betalingen niet elkaar overschrijven, en `Bekijk + goedkeuren` actie-knop. NotificationClick voor `payment_pending_approval` → `/admin/payments?filter=pending`.
- ✅ **Frontend** Payments.jsx: `?filter=pending` query → auto-scroll naar pending sectie + amber ring-highlight (2.4s). PendingApprovalBell + Payments luisteren beide naar `BADGE_CHANGED` SW-message voor instant refresh (ipv 8s/30s polling).
- ✅ **Tested (iteration_20)**: 27/27 backend (7 new + 20 regression). Push delivery infra verified: `/api/push/test` sent=11/failed=0 op 11 geabonneerde admin-devices. End-to-end pending → notification → click → scroll-to-pending → approve werkt volledig.

### Session 2026-02-27 — Globale tik-geluiden ✅
- ✅ **`lib/tap-sounds.js`**: WebAudio-based tik-systeem (geen audio-files nodig). Triangle wave 20-25ms met snelle attack+decay = klassieke "klik". Twee varianten:
  - `playClickTick()` — 2400Hz voor knoppen/links/checkboxes
  - `playKeyTick()` — 1800Hz voor text/numeric inputs + keypad
- ✅ **`installGlobalTapSounds()`**: globale `pointerdown` (capture, passive) listener voor alle interactieve elementen (`button`, `a[href]`, `[role="button"]`, `input[type=checkbox|radio|submit|button]`, `label`, `select`, `[data-tap-sound]`). Globale `keydown` listener voor printable keys + Backspace/Enter/Space op text-inputs en `contentEditable`. Escape: voeg `data-no-tap-sound` toe.
- ✅ **iOS unlock**: bij eerste touch/pointerdown wordt de AudioContext "geprimed" (`resume()`) zodat iPhone PWA + Safari direct geluid geven. Anti-machinegun: minimaal 25ms tussen ticks (bij snelle keypad-spam).
- ✅ **App-root integratie**: `useEffect(() => installGlobalTapSounds(), [])` in `App.js`. Werkt direct op kiosk, admin, huurder kiosk, klantenscherm — overal in de app.
- ✅ **Toggle UI** in `/admin/notifications` boven het apparaten-blok: groene/grijze switch met Volume2/VolumeX icon + uitleg. Voorkeur in `localStorage.tap_sounds_enabled` (default ON).
- ✅ Smoke-test bevestigd op /login: AudioContext beschikbaar, PIN-tap registreert correct, geen crashes.

### Session 2026-02-27 — iOS Guided Access workaround: in-app foreground notificaties ✅
- ✅ **Probleem**: Apple blokkeert ALLE system-level push notificaties tijdens iOS Guided Access — geen enkele app (web of native) krijgt iets binnen. Push-flow uit iteration_20 werkt buiten Guided Access wel.
- ✅ **Oplossing**: in-app foreground polling. `lib/foreground-notify.js` `useForegroundPendingNotify` hook pollt elke 5s `/api/payments/pending-count`. Bij detectie van een NIEUWE pending (latest.id verschilt van localStorage `last_pending_id_seen`) toont het:
  - Vanilla DOM banner bovenaan (oranje left-border, safe-area-inset-top respecteren, 8s auto-dismiss), data-testid `foreground-pending-banner`
  - Ding-ding geluid (`playPendingApprovalDing` uit `notify-sound.js`)
  - Tap → `/admin/payments?filter=pending`
- ✅ Warm-up tick: bij eerste poll geen toast voor pendings die al bestonden vóór open. Page refresh re-triggert niet (LS dedup).
- ✅ **Backend uitbreiding** `GET /api/payments/pending-count` retourneert nu naast `count` ook `latest: {id, amount, currency, tenant_name, apartment_number, received_by, category, created_at}`. Backward-compatible voor bestaande callers (lezen alleen `count`).
- ✅ **2 bugs gefixed na testing_agent_v3 (iteration_25)**:
  - sort key `created_at` → `paid_at` (payment docs hebben geen `created_at` veld, gevolg: sort werkte niet → latest gaf willekeurige order met meerdere pendings)
  - tenant_name + apartment_number niet persistent op payment doc → on-the-fly lookup uit tenants + apartments collecties zodat banner echte naam toont i.p.v. "Onbekende huurder"
- ✅ Verified: 2 pendings 2s uit elkaar → latest = juiste id + "Bharat Kewalbansing · HUIS 7B · door Maria K."
- ✅ **AdminDashboard** mount `useForegroundPendingNotify({enabled:true})` (na useBadge). `/admin/notificaties` heeft een nieuwe amber info-card (`guided-access-info`) die de workaround uitlegt aan de gebruiker.
- ✅ **Tested (iteration_25)**: 19/19 regression backend + 11/11 frontend e2e PASS. Backend bug-fixes geverifieerd met handmatige curl-test (P2 == latest.id, tenant_name + apt_number populated).

### Session 2026-02-27 — Premium action sounds (swoosh / success / error / approve / pen) ✅
- ✅ **`lib/tap-sounds.js` uitgebreid** met 5 nieuwe sound-generators (WebAudio, geen audio-files):
  - `playSwoosh()` — sawtooth filter-sweep 220→660Hz · 220ms (bottom sheets / modals openen)
  - `playSuccessPing()` — twee oplopende sine tonen B5 → E6 (succesvolle betaling)
  - `playErrorBuzz()` — twee dalende square tonen G3 → D3 (API errors)
  - `playApproveConfirm()` — drie oplopende triangle tonen E5 → A5 → E6 (admin approval/reject)
  - `playPenTick()` — random 2400-3000Hz korte triangle (handtekening tekenen)
- ✅ **Wiring**:
  - `ApprovePaymentSheet.submit/reject` → `playApproveConfirm()` op succes, `playErrorBuzz()` bij fout, `playSwoosh()` bij sheet-open
  - `SignaturePad.move` → `playPenTick()` tijdens tekenen (max 1/60ms anti-spam)
  - `TenantPayConfirm.submit` → `playSuccessPing()` op gelukte betaling, `playErrorBuzz()` bij fout
  - `KioskLayout.PaymentConfirm.submit` (inclusief Mope-flow) → `playSuccessPing()` / `playErrorBuzz()`
  - `ForgotPinSheet` mount → `playSwoosh()`
- ✅ **Voorbeluister-knoppen** in `/admin/notificaties` onder de "Tik-geluiden" toggle: 5 chips (Tik/Swoosh/Succes/Goedkeuring/Fout) zodat admin de geluiden kan horen voordat ze in actie komen.

### Session 2026-02-27 — Huurder Kiosk volledig herontworpen (kiosk-look + history + multi-step pay) ✅
- ✅ **Dashboard look 1:1 zoals operator kiosk**: links "Financieel overzicht" met Maandhuur / Openstaande huur / Servicekosten / Boetes / Internet rows + "Totaal openstaand" footer. Rechts groot Saldo-paneel met Wallet/CheckCircle2 icon en "Volgende"-knop. Onderaan 3 SecondaryTiles (Onderhoud / Gegevens / Contact).
- ✅ **Betalingsgeschiedenis** toegevoegd via `TenantHistoryView`: fetch `/tenant-portal/payments`, lijst met badges (categorie + methode), datum, kwitantienummer, "Ontvangen door" / "Goedgekeurd door" + per-rij PDF-download knop (blob fetch met tenant_token). Trigger: knop onder "Volgende".
- ✅ **Multi-step pay flow** (vervangt oude single-tap-auto-pay bug):
  - **TenantPaySelect**: checkbox-lijst (Huur / Servicekosten / Boete / Internet) + "Alles betalen" + custom-bedrag keypad (mobile toggle + desktop side-keypad), exact dezelfde UX als operator kiosk's PaySelect
  - **TenantPayMethod**: 3 tegels — Contant / Mope / Uni5Pay
  - **TenantPayConfirm**: overzicht-card + Bevestig-knop met loading state
  - **PaidView**: success scherm + Klaar-knop terug naar dashboard
- ✅ Back-navigatie tussen alle stappen werkt zonder crashes.
- ✅ **Tested (iteration_24)**: 14/14 frontend scenarios (mobile + desktop) + 21/21 backend regression PASS. Een echte 1 SRD testbetaling end-to-end uitgevoerd, kwitantie auto-gegenereerd. Oude `/tk-pay-{id}` per-factuur knop is volledig verwijderd.


### Session 2026-02-27 — PIN vergeten? feature voor Huurder Kiosk ✅
- ✅ **Backend** `POST /api/tenant-portal/forgot-pin` (body `{identifier, company_id|slug}`):
  - Zoekt huurder via email (case-insensitive) of telefoon-suffix (laatste 4-12 cijfers van `phone_digits`)
  - Genereert nieuwe 4-cijferige PIN, garandeert uniciteit binnen company via `_generate_unique_pin()` (bcrypt-verify tegen alle andere actieve PINs)
  - Stuurt naar **Email** (SMTP via `get_company_section(cid,'smtp')`) **+ WhatsApp** (Twilio) of **SMS-fallback**
  - Anti-enumeratie: 200 `{ok:true, via:[]}` voor onbekende identifiers (geen leak)
  - Anti-misbruik: shared throttle bucket `forgot-pin:<ip>` (bumped op tenant-not-found + send-failure)
- ✅ **Frontend** TenantKioskLayout LoginScreen:
  - Telt foute PIN-pogingen (`failedAttempts`). Na 3× verschijnt "PIN vergeten? Vraag nieuwe code" knop (`data-testid="tk-forgot-pin-btn"`)
  - Tap → `ForgotPinSheet` bottom-sheet met input (`tk-forgot-identifier`) + Verstuur-knop
  - Success state met groen check-icon + "Verstuurd via Email + WhatsApp" bericht
  - Close → reset failedAttempts naar 0
- ✅ **Tested (iteration_23)**: 7/7 backend (POST tests + PIN-invalidation regression + phone-suffix lookup) + 7/7 frontend (hidden voor 3 fails → visible → sheet open → submit → success → close reset). Backend regression 40/42 (2 pre-existing throttle-bleed tussen modules, niet door deze feature).

### Session 2026-02-27 — Bugfix: Tenant + Klant login niet meer hard-redirect ✅
- ✅ **Probleem**: het 401-interceptor uit iteration_19 (`api.js`) redirecteerde élke 401 op een non-public endpoint naar `/login?stale=1`, óók als de huurder een verkeerde PIN intikte op `/c/{slug}/kiosk/huurder` of de klant kiosk. Dit brak alle niet-admin login flows.
- ✅ **Fix**: hard-redirect naar `/login?stale=1` gebeurt nu ALLEEN als `path.startsWith('/admin')`. Tenant 401 → clear `tenant_token` + sessionStorage, blijf op pagina. Kiosk 401 → clear `kiosk_token` + emp-session, blijf op pagina. De lokale UI handelt de re-login zelf af.
- ✅ **Tested (iteration_22)**: 6/6 frontend scenarios PASS (tenant wrong PIN, tenant stale token, kiosk stale token, admin stale token, public /auth/login 401, public /tenant-portal/pin-login 401).

### Session 2026-02-26 — Ding-ding geluid + device-management ✅
- ✅ **Distinctive ding-ding** (`/app/frontend/src/lib/notify-sound.js`): WebAudio 2-tone bell (E6 → G6, 180ms gap, sine wave + exponential decay) speelt automatisch zodra een pending-approval push binnenkomt terwijl de app open is. Anti-spam: 800ms minimum tussen plays. Service Worker (v53) broadcastet `BADGE_CHANGED` met `require_approval` + `kind` velden zodat alleen pending-approvals het geluid triggeren.
- ✅ **AdminDashboard** installeert de listener via `installPendingApprovalDingListener()` op mount (idempotent).
- ✅ **Notificaties pagina** heeft een nieuwe "Test geluid" knop (`data-testid="ding-test"`) zodat de admin het geluid kan voorbeluisteren.
- ✅ **Device management**: nieuwe endpoints `GET /api/push/devices` + `DELETE /api/push/devices/{device_id}`. Backend bewaart nu `user_agent` op subscribe en vertaalt het naar een leesbaar label via `_device_label_from_ua()` ("iPhone · Safari", "Windows · Chrome", "Mac · Safari" etc.). `$setOnInsert` zorgt dat re-subscribes hetzelfde id + created_at behouden.
- ✅ **Notificaties UI** toont een "Gekoppelde apparaten" sectie met label, "Dit toestel" badge voor het huidige device, gekoppel-datum en een Verwijder-knop per device. Verwijderen van het HUIDIGE apparaat doet óók een lokale `pushManager.unsubscribe()` zodat de browser-staat synchroon blijft.
- ✅ **Tested (iteration_21)**: 14 nieuwe pytest cases + 28 regression = 42/42 backend PASS. Frontend code-review verified (testids, handlers, SW routing — alles aanwezig). Headless Playwright crashed bij /admin/notifications render — alleen test-infra OOM, niet product-bug (user heeft 10 actieve devices die pushes correct ontvangen).


### Session 2026-02-26 — Medewerker-PIN direct login op /login ✅
- ✅ **Backend** `POST /api/auth/kiosk-pin` uitgebreid: probeert eerst company-shared PIN, daarna `employees.kiosk_pin_hash` (alle bedrijven). Medewerker-match → returnt `kiosk_token + employee:{id,name,pin}`, **`admin_token=null`**. Company-match → ongewijzigd (kiosk_token + admin_token).
- ✅ **PIN-uniqueness afgedwongen**:
  - `POST /api/employees/{id}/kiosk-pin` → 409 als PIN gelijk is aan een company-PIN of een andere medewerker-PIN (naam in detail)
  - `POST /api/auth/kiosk-set-pin` → 409 als de gekozen company-PIN gelijk is aan een actieve medewerker-PIN
- ✅ **Frontend `/login`**: bij PIN-match met `data.employee` aanwezig → `setKioskEmployee()` + `localStorage.removeItem('admin_token')` + navigate naar `/kiosk`. Shared-PIN gedrag (admin_token + clearKioskEmployee) blijft behouden.
- ✅ **Kiosk Beheerder-knop verborgen** voor medewerkers: nieuwe `hasAdminAccess` state in `KioskLayout` luistert naar `kiosk-employee-changed` + `storage` events; ApartmentSelect krijgt `onAdmin=null` als geen admin_token → mobile knop verdwijnt; desktop knop krijgt `hidden` class.
- ✅ **Uit-knop** ruimt nu ook `sessionStorage.kiosk_emp_*` op (clean logout per dienst).
- ✅ **Tested (iteration_18)**: 9/9 nieuwe pytest cases + 12/12 regressie (approval workflow) + frontend e2e (mobile employee 9999 → /kiosk zonder admin → no Beheerder; mobile company 1234 → /kiosk MET admin → Beheerder zichtbaar → directe /admin). 21/21 backend + 100% frontend.


- ✅ **Bottom-nav FAB curved indent**: iOS-stijl holle boog rond de + knop. Een `#F7F8FA` (page-bg) gekleurde cirkel-puck (60×60 mobile, 80×80 tablet) absolute-positioned achter de FAB doorbreekt de witte nav-top → simuleert een uitgesneden boog waar de FAB "doorheen steekt". FAB iets groter (w-10→w-12), ring matcht nu page-bg ipv wit, shadow iets sterker voor diepte.


### Session 2026-02-28 — Betalingsregeling & Morning Briefing afgerond ✅
- ✅ **Admin UI**: Tab `Betalingsregelingen` (`payment_plans`) volledig aangesloten in `AdminDashboard.jsx` — Calendar icon + PaymentPlans component imports gefixt, render-conditie toegevoegd.
- ✅ **Morning Briefing**: `useMorningBriefing()` hook fetcht `/api/admin/morning-briefing` + opent automatisch een modal 06:00-12:00 lokale tijd, 1×/dag (LS_KEY tracking). Vertraging van 1.2s voorkomt race-condities met sidebar clicks na inloggen.
- ✅ **Tenant Kiosk integratie**: `TenantPaySelect` toont actieve betalingsregeling-termijnen als extra rijen onder een 'Betalingsregeling' divider — selecteerbaar in dezelfde lijst als Huur/Internet. `TenantPayConfirm.submit` itereert plan_items via nieuw endpoint en plain_items via klassieke /tenant-portal/payments.
- ✅ **Operator Kiosk integratie**: `PaySelect` + `PaymentConfirm` (Cash + Mope flow) ondersteunen plan_items. Plain amount vs. plan amount gescheiden in payload zodat /kiosk/payments alleen plain items boekt en plan items via /kiosk/payment-plans endpoints (pending_approval indien employee_id meegegeven).
- ✅ **Nieuwe backend endpoints**:
  - `GET /api/tenant-portal/payment-plans` (tenant auth) — lijst actieve regelingen huurder
  - `POST /api/tenant-portal/payment-plans/{plan_id}/installments/{seq}/pay` — huurder betaalt zelf
  - `GET /api/kiosk/tenants/{tenant_id}/payment-plans` (kiosk auth) — operator haalt regelingen op
  - `POST /api/kiosk/payment-plans/{plan_id}/installments/{seq}/pay` — operator betaalt termijn (optioneel pending_approval met employee PIN)
- ✅ **Achtergrond-loop voor herinneringen**: `_installment_reminder_loop` draait elke 30 min en stuurt 1× per dag (09:00-10:00 lokaal) WhatsApp/Email naar huurders met achterstallige termijnen. Tracking via `payment_plan_reminders` collectie. Configurabel via `DISABLE_INSTALLMENT_REMINDERS=1`.
- ✅ **Refactor van payment_plans.py**: shared `_build_pay_core(db, helpers)` exporteert `enrich_plan`, `pay_installment_for`, `list_plans_for_tenant` helpers — admin endpoint én tenant + kiosk endpoints in server.py delen dezelfde logica.
- ✅ **Tested (iteration_26)**: 12/12 backend tests PASS. Frontend admin list/detail/sheet flows + morning briefing modal visueel geverifieerd. Race-condition gefixt met setTimeout vertraging in useMorningBriefing.


### Session 2026-02-28 — Huis-logo Rollout afgerond ✅
- ✅ **Nieuw logo design**: Wit huis met schoorsteen, driehoekig dak, en deur op oranje rounded-square achtergrond (gebruikersgeschetste sketch). SVG bron: `/app/frontend/public/kiosk-icons/logo.svg` (volle achtergrond) + `mark.svg` (transparant, gebruikt `currentColor` voor header tinting).
- ✅ **Geometrie-fix**: Schoorsteen valt achter het dak (h=120 i.p.v. doorlopend), eindigt op y=240 zodat er geen "poot" onder het dak uitsteekt.
- ✅ **Alle PWA iconen herrenderd** via `/tmp/render_icons.py` (cairosvg + Pillow):
  - kiosk-{72,144,192,512}.png, beheer-*.png, huurder-*.png, klant-*.png, kioskpwa-*.png
  - mark-{white,orange,dark}.png voor header gebruik
  - kiosk-favicon.ico (multi-resolution 16-256)
  - /app-icon.png voor og:image
- ✅ **iOS splash screens** (20 stuks): iPhone 8/X/XR/13/15-Pro/15-ProMax + iPad/iPad-Pro-11/iPad-Pro-12 in zowel portrait als landscape — alle gegenereerd met gecentreerd huis-icoon op vlak oranje (#FF5C00).
- ✅ **Service Worker CACHE_VERSION** gebumpt v55 → v56 in `/app/frontend/public/sw.js` zodat browsers de nieuwe iconen ophalen.
- ✅ **UI Headers geverifieerd**: `mark-white.png` wordt gebruikt in `pwa.jsx`, `AdminDashboard.jsx` (3 plekken), `ContractSignPage.jsx`. Screenshot toont nette weergave op `/vastgoed/admin/login` — top-left header icoon + centrale Kiosk welkomstkaart tonen beide het correcte huis-logo.


### Session 2026-02 — AI-powered Luxury Gold Plaque ✅
- ✅ **Gemini Nano Banana integratie** (`gemini-3.1-flash-image-preview`) voor de huurders QR-plaquette. Nieuwe async functie `luxury_plate_pdf_ai()` in `pdf_gen.py` stuurt het template-bestand (`qr-plate-template.png`) + edit-prompt naar Nano Banana om alleen de tekst (bedrijfsnaam, huisnummer, adres) te vervangen met behoud van het 3D-embossed gouden effect, lederen textuur, schroeven en gouden buitenrand.
- ✅ **Hybride QR-aanpak**: AI bewerkt alleen de tekst; daarna wordt een echte scanbare QR-code via `qrcode` lib over het AI-gegenereerde QR-frame geplakt (AI kan geen pixel-perfecte QR garanderen).
- ✅ **MongoDB cache** (`db.qr_plate_cache`) keyt op `sha256(tenant_id|company|apt|address|kiosk_url|v2)` — eerste call ~19s (AI render), cache-hit ~334ms. Bypass via `?refresh=1` query param.
- ✅ **PIL fallback** automatisch als AI faalt (offline/quota). PIL-maskers ook verbeterd: extended mask boundaries (`[540, 130, ...]` + `[260, 640, ...]`) zodat geen template-tekst meer doorheen bleedt.
- ✅ **End-to-end getest** met echte tenant data (SuriRent N.V., HUIS 7B, Kewalbansingweg 7) — output ziet er identiek uit aan het originele design met behoud van alle 3D-effecten en luxe uitstraling.


### Session 2026-02 — Bedrijfsgegevens editor + plate logo preservation ✅
- ✅ **Nieuwe endpoint** `PUT /api/companies/me/profile` (admin role) — laat admins zelf hun bedrijfsnaam, contact-email, telefoon en adres aanpassen. Slug en plan/billing blijven superadmin-only.
- ✅ **Branding GET response uitgebreid** met `contact_email`, `contact_phone`, `address` velden.
- ✅ **Branding.jsx UI** — nieuwe "Bedrijfsgegevens" sectie bovenaan met 4 input-velden (Building2/Mail/Phone/MapPin icons). Save knop slaat zowel branding als profiel in 1 klik op.
- ✅ **QR plaat cache invalidatie** — bij wijziging van bedrijfsnaam of adres wordt `db.qr_plate_cache` geleegd zodat nieuwe waardes direct in toekomstige plaquette-downloads verschijnen.
- ✅ **AI prompt versterkt** voor de Gold Plaque — expliciete instructie om het 3D embossed S-house logo te behouden ("MUST remain fully intact, do not shrink/move/replace/remove").
- ✅ **3x retry op Nano Banana** — Nano Banana faalt soms zonder fout (lege response). Nieuwe loop probeert tot 3x met unieke session ids voor robuustere generatie. Reduceert PIL-fallbacks aanzienlijk.
- ✅ **Backend tests via curl**: GET branding incl. nieuwe velden ✓, PUT profile full update ✓, PUT profile partial (alleen name) ✓, empty name → 400 ✓.


### Session 2026-02 — Onderhoud-melding fix + Mobile responsive ✅
- ✅ **BUG FIX (P0)**: `POST /api/tenant-portal/maintenance` zette geen `company_id` op het document → admin's `GET /maintenance` (filtert via `scope(user)` op company_id) zag de melding niet. Nu wordt `company_id` correct gezet (uit tenant of fallback via apartment) zodat tenant-meldingen direct in de admin lijst verschijnen.
- ✅ **Notificatie toegevoegd**: tenant-onderhoudsmelding triggert nu `_notify_company_admins()` → push-melding + SSE-broadcast naar alle admin/owner/boekhouder users met titel "Nieuwe onderhoudsmelding · HUIS X" en body inclusief urgentie + huurder naam + probleem-titel. URL-data wijst naar `/admin/maintenance`.
- ✅ **Mobile responsive fix** (`TenantKioskLayout.jsx`): authed kiosk-wrapper had `overflowY: hidden` waardoor inhoud op kleine viewports werd weggeknipt. Nu `overflowY: auto` + `flex-none` op stacked dashboard panels → financieel overzicht + balans-kaart + secundaire tegels (Onderhoud/Gegevens/Contact) zijn nu volledig zichtbaar en scrollbaar op iPhone-formaat (390×844).
- ✅ **End-to-end getest**: tenant pin-login → maintenance create (HTTP 200, company_id gezet) → admin list-maintenance (record verschijnt) → fingerprint check via screenshots op 390×844 viewport.


### Session 2026-02 — Bankoverschrijving flow (SR + NL) ✅
- ✅ **Backend**: `TenantPaymentIn` uitgebreid met `bank_country` (SR/NL) en `bank_statement_id`. Nieuwe endpoint `POST /api/tenant-portal/bank-statement-upload` (PDF/JPG/PNG/WEBP, max 5MB) slaat afschrift op in `db.bank_statements` collectie. Nieuwe endpoint `GET /api/bank-statements/{id}` (admin auth) levert het bestand met juiste content-type. Bij `method=bank` wordt status forceerd op `pending_approval` en factuur blijft openstaan tot admin op `/payments/{id}/approve` klikt.
- ✅ **PaymentOut model** uitgebreid met `bank_country`, `bank_statement_id`, `bank_statement_filename`, `bank_statement_size`, `bank_statement_content_type` zodat admin de info ziet.
- ✅ **Bedrijfsgegevens (Branding pagina)** — twee nieuwe velden `bank_account_sr` (Suriname bank) en `bank_account_nl` (Nederlands IBAN). Branding GET response uitgebreid; CompanyProfileIn model verwerkt beide velden.
- ✅ **Tenant Kiosk UI** — "Contant" verwijderd uit huurder betaalmethoden, vervangen door "Bankoverschrijving" met sky-blauwe accent en Landmark icoon. Nieuwe `TenantPayBank` view tussen method-selectie en bevestiging: huurder kiest land (🇸🇷/🇳🇱), ziet correcte bankgegevens uit branding, uploadt verplicht bankafschrift (PDF/JPG/PNG max 5MB), krijgt visuele feedback (groene confirmatie met filename + KB).
- ✅ **Bevestigingsscherm** toont 2 extra rijen ("Land", "Bankafschrift") + amber waarschuwing "Uw betaling wordt pas goedgekeurd zodra het bedrag op onze rekening staat". Submit-knop label wijzigt naar "Verstuur ter goedkeuring".
- ✅ **Admin Payments — Goedkeuren modal**: toont land 🇸🇷/🇳🇱 + download-knop voor bankafschrift (auth-aware fetch via blob met admin_token), opent in nieuw tabblad.
- ✅ **Push/SSE notificatie**: bankoverschrijving stuurt `kind=payment_pending` met titel "Bankoverschrijving wacht op goedkeuring · SRD X". URL wijst naar `/admin/payments`.
- ✅ **End-to-end backend getest**: PUT profile met bank velden ✓, tenant pin-login ✓, missing statement → 400 ✓, upload PDF (34 bytes) ✓, payment create met bank+statement → status=pending_approval ✓, admin list pending → ziet record incl. country=SR + statement_id ✓, admin download statement → 200 application/pdf ✓.
- ✅ **Smoke screenshot 390×844**: methode-picker toont 3 opties (Bankoverschrijving/Mope/Uni5Pay), bank-flow toont land-keuze + uploader perfect responsive.


### Session 2026-02 — OCR auto-approve bankafschriften (Gemini 2.5 Flash) ✅
- ✅ **`_ocr_bank_statement()`** helper in `server.py` gebruikt `emergentintegrations` LlmChat met `gemini-2.5-flash` model + `FileContentWithMimeType` om PDF/PNG/JPG/WEBP bankafschriften te analyseren. Strict JSON output schema: `{amount, currency, date_iso, payer_name, beneficiary, reference, confidence, raw_text}`. Markdown-codeblock stripping voor robust parsing.
- ✅ **`_ocr_match_ok()`** vergelijkings-logica: confidence ≥0.7, bedrag binnen 1% of 1.0 tolerantie, exact currency match, datum ≤21 dagen oud (geen toekomst datums). Geeft `(ok, reasons[])` terug zodat mismatch-reden zichtbaar is.
- ✅ **`_ocr_and_auto_approve_payment()`** achtergrond-task via `asyncio.create_task` direct na payment create — huurder krijgt instant feedback ("Verstuurd ter goedkeuring") terwijl OCR async draait. Bij match → auto-approve met `approved_by="OCR auto-approve"`, `auto_approved=True` + factuur-allocatie (zelfde FIFO overflow als manual approve). Bij mismatch → blijft `pending_approval` + push naar admin met mismatch-reden(en).
- ✅ **PaymentOut model** uitgebreid met 11 OCR velden: `ocr_status` (matched/mismatch/failed), `ocr_amount`, `ocr_currency`, `ocr_date_iso`, `ocr_payer_name`, `ocr_beneficiary`, `ocr_reference`, `ocr_confidence`, `ocr_mismatch_reasons[]`, `auto_approved`. Wordt zichtbaar in admin Payments lijst.
- ✅ **Admin Payments — Goedkeuren modal**: nieuwe groene/amber/rose OCR-controle box met confidence % + iconen, mismatch-redenen als bullet-lijst, extra grid met OCR data (bedrag/datum/van/naar/kenmerk). Admin ziet in één oogopslag of AI-controle akkoord is.
- ✅ **End-to-end getest** met 3 scenario's:
  - Match scenario (test image van 7000 SRD met huidige datum): `status=approved, auto_approved=True, approved_by="OCR auto-approve"` ✓
  - Mismatch bedrag (claim 9999, afschrift toont 7000): `status=pending_approval, ocr_status=mismatch, reasons=["bedrag 7000 ≠ claim 9999 (verschil 2999)"]` ✓
  - Mismatch datum (oud afschrift 103 dagen): `status=pending_approval, reasons=["afschrift 103 dagen oud (>21)"]` ✓
- ✅ **OCR-tijd**: ~6-10 sec per afschrift (Gemini 2.5 Flash latency). Vuur-en-vergeet zodat de huurder geen vertraging ervaart.
- ✅ **Audit-trail**: alle OCR resultaten worden permanent opgeslagen op het payment record (zowel bij approve als mismatch) zodat back-tracing en compliance-controle altijd mogelijk is.


### Session 2026-02 — Mope + Uni5Pay flow (QR + bewijs upload + OCR) ✅
- ✅ **Backend**: `needs_proof = method in (bank, mope, uni5pay)` — alle 3 bewijs-vereiste methoden hebben dezelfde behandeling: verplichte upload via `/bank-statement-upload`, status `pending_approval`, OCR auto-approve via Gemini 2.5 Flash. Foutmeldingen geleidelijk naargelang methode ("Mope betaalbewijs verplicht" / "Uni5Pay betaalbewijs verplicht" / "Bankafschrift verplicht").
- ✅ **CompanyProfileIn + _company_branding_response** uitgebreid met `mope_account` en `uni5pay_account` (Mope ID/telefoonnummer en Uni5Pay merchant code).
- ✅ **Branding pagina** ("Mobile wallets" sectie): admins kunnen Mope rekening en Uni5Pay rekening invullen, met emoji 📱 + uitleg.
- ✅ **Tenant Kiosk — TenantPayMobile component**: nieuw scherm voor mope/uni5pay met:
  - QR-code (kleurgecodeerd groen Mope / rose Uni5Pay) via `qrcode.react` library
  - Info-blok: naar / bedrag / kenmerk
  - "Open Mope/Uni5Pay app" knop met deep-link (`mope://pay?to=...` / `uni5pay://pay?to=...`)
  - Verplichte schermafdruk upload (zelfde uploader als bank flow)
- ✅ **Pay-confirm scherm**: amber waarschuwing en knop-label nu universeel voor alle 3 methodes ("Verstuur ter controle"). ConfirmRow toont "Betaalbewijs" voor mope/uni5pay; Land alleen voor bank.
- ✅ **Backend tests E2E**: Mope zonder bewijs → 400 ✓; Uni5Pay zonder bewijs → 400 ✓; Mope met PNG bewijs (7000 SRD) → OCR detecteert bedrag 7000.0, confidence 1.0, status=approved, auto_approved=True ✓.
- ✅ **Smoke screenshot 390×844**: Mope flow toont groene QR + bedrijfsinfo (NAAR/BEDRAG/KENMERK) + groene "Open Mope app" knop + upload zone.

## 2026-02-05 — Registratie popup modal (i.p.v. separate pagina)
- ✅ Nieuwe component `RegisterModal.jsx` in `/app/frontend/src/components/`.
- ✅ Klik op "Registreren" knop in topbar van landing page opent nu een modale popup met **transparante donkere overlay + backdrop-blur (14px)** in plaats van te navigeren naar `/login?register=1`.
- ✅ Modal: split panel (branded oranje LEFT met "Start uw eigen vastgoed portaal" + 3 voordelen, en form RIGHT met alle velden + plan/land keuze).
- ✅ Sluiten via: X knop rechtsboven, ESC toets, of klik op de blur-overlay.
- ✅ Body scroll lock terwijl modal open is.
- ✅ Success scherm getoond IN dezelfde modal na succesvolle registratie (welkom + bankgegevens + "Naar mijn dashboard" knop).
- ✅ De oude `/login?register=1` route blijft beschikbaar als fallback (LoginPage register mode is niet verwijderd).

## 2026-02-05 — `/login?register=1` redirect naar landing-modal
- ✅ `LoginPage.jsx` detecteert nu `?register=1` of `?view=register` op de generieke `/login` route en redirect direct naar `/?register=1` (via `window.location.replace`, geen history-spam).
- ✅ `MarketingLandingV2.jsx` opent de RegisterModal automatisch wanneer `?register=1` in de URL aanwezig is, en haalt de query parameter daarna weg via `history.replaceState` zodat een reload de popup niet opnieuw triggert.
- ✅ Branded `/<slug>/login?register=1` routes worden NIET geredirect — klanten in een specifiek bedrijfsportaal kunnen geen nieuw bedrijf aanmaken, dus de oude register-view gedraagt zich daar correct (al wordt deze in praktijk niet gebruikt).
- ✅ Geverifieerd: `/login?register=1` → final URL `/`, modal open.

