import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Check, KeySquare, Mail, MessageCircle, CreditCard, Zap, Globe,
  AlertCircle, ChevronRight, Shield, Power, PowerOff, FileText,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';

const SECTIONS = [
  { id: 'smtp', label: 'E-mail (SMTP)', icon: Mail, desc: 'Verstuur kwitanties en facturen via je eigen SMTP server.' },
  { id: 'twilio', label: 'WhatsApp & SMS', icon: MessageCircle, desc: 'Twilio integratie voor WhatsApp- en SMS-meldingen.' },
  { id: 'mope', label: 'Uni5Pay betalingen', icon: CreditCard, desc: 'Online betalingen via Uni5Pay (Suriname).' },
  { id: 'uni5pay', label: 'Uni5Pay betalingen', icon: CreditCard, desc: 'Online betalingen via Uni5Pay.' },
  { id: 'shelly', label: 'Shelly elektriciteit', icon: Zap, desc: 'Smart breakers per appartement (Shelly Cloud).' },
  { id: 'invoicing', label: 'Facturen automatisering', icon: FileText, desc: 'Automatische maand-facturen na grace periode.' },
  { id: 'domain', label: 'Eigen domein', icon: Globe, desc: 'Koppel een eigen domein aan dit bedrijf.' },
  { id: 'kiosk', label: 'Kiosk PIN', icon: KeySquare, desc: 'Stel de 4-cijferige toegangs-PIN voor de Kiosk in.' },
];

function FieldLabel({ children }) {
  return <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{children}</label>;
}

function TextField({ label, value, onChange, type = 'text', placeholder, disabled, testid, helper }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled} data-testid={testid}
        className="w-full mt-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none disabled:bg-slate-50 disabled:text-slate-400" />
      {helper && <p className="text-[11px] text-slate-400 mt-1">{helper}</p>}
    </div>
  );
}

function SwitchField({ label, value, onChange, testid, desc }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
      <div>
        <p className="text-sm font-bold text-slate-900">{label}</p>
        {desc && <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>}
      </div>
      <button onClick={() => onChange(!value)} data-testid={testid}
        className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-[#FF5C00]' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${value ? 'left-[1.4rem]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function SectionShell({ children, msg, err }) {
  return (
    <div className="bg-white rounded-2xl border border-orange-100 p-5 md:p-6 space-y-4">
      {err && <div className="flex gap-2 items-start text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{err}</div>}
      {msg && <div className="flex gap-2 items-start text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2"><Check className="w-4 h-4 mt-0.5 shrink-0" />{msg}</div>}
      {children}
    </div>
  );
}

function ActionRow({ onSave, onTest, saving, testing, canTest }) {
  return (
    <div className="flex flex-wrap gap-3 pt-2">
      <button onClick={onSave} disabled={saving} data-testid="settings-save"
        className="h-11 px-5 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center gap-2 disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Bewaar
      </button>
      {onTest && (
        <button onClick={onTest} disabled={testing || !canTest} data-testid="settings-test"
          className="h-11 px-5 rounded-xl border-2 border-[#FF5C00] text-[#FF5C00] hover:bg-orange-50 font-bold flex items-center gap-2 disabled:opacity-50">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />} Test verbinding
        </button>
      )}
    </div>
  );
}

function useSection(section, initial) {
  const [data, setData] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const onField = (k, v) => setData((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setErr(''); setMsg(''); setSaving(true);
    try {
      const { data: res } = await api.put(`/settings/${section}`, data);
      setData(res.data);
      setMsg('Instellingen opgeslagen.');
    } catch (e) { setErr(formatError(e)); }
    finally { setSaving(false); }
  };
  const test = async () => {
    setErr(''); setMsg(''); setTesting(true);
    try {
      const { data: res } = await api.post(`/settings/${section}/test`);
      if (res.ok) setMsg(res.detail || 'Test geslaagd.');
      else setErr(res.detail || 'Test mislukt.');
    } catch (e) { setErr(formatError(e)); }
    finally { setTesting(false); }
  };
  return { data, setData, onField, save, test, saving, testing, msg, err };
}

// ============== Per-section forms ==============
export function SmtpForm({ initial }) {
  const s = useSection('smtp', initial);
  const d = s.data;
  return (
    <SectionShell msg={s.msg} err={s.err}>
      <SwitchField label="Ingeschakeld" testid="smtp-enabled"
        desc="Wanneer aan kun je via e-mail kwitanties, facturen en herinneringen versturen."
        value={d.enabled} onChange={(v) => s.onField('enabled', v)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="SMTP host" testid="smtp-host" value={d.host} onChange={(v) => s.onField('host', v)} placeholder="smtp.gmail.com" />
        <TextField label="Poort" testid="smtp-port" type="number" value={d.port} onChange={(v) => s.onField('port', parseInt(v, 10) || 587)} placeholder="587" helper="465 voor SSL, 587 voor STARTTLS" />
        <TextField label="Gebruikersnaam" testid="smtp-username" value={d.username} onChange={(v) => s.onField('username', v)} placeholder="info@bedrijf.sr" />
        <TextField label="Wachtwoord" testid="smtp-password" type="password" value={d.password ?? ''} onChange={(v) => s.onField('password', v)} placeholder="••••• (laat leeg om huidige te behouden)" />
        <TextField label="Afzender naam" testid="smtp-from-name" value={d.from_name} onChange={(v) => s.onField('from_name', v)} placeholder="SuriRent N.V." />
        <TextField label="Afzender e-mail" testid="smtp-from-email" value={d.from_email} onChange={(v) => s.onField('from_email', v)} placeholder="info@surirent.sr" />
      </div>
      <SwitchField label="TLS gebruiken (STARTTLS)" testid="smtp-tls"
        value={d.use_tls} onChange={(v) => s.onField('use_tls', v)}
        desc="Aan voor poort 587. Uit voor poort 465 (impliciete SSL)." />
      <ActionRow onSave={s.save} onTest={s.test} saving={s.saving} testing={s.testing} canTest={d.enabled} />
    </SectionShell>
  );
}

export function TwilioForm({ initial }) {
  const s = useSection('twilio', initial);
  const d = s.data;
  return (
    <SectionShell msg={s.msg} err={s.err}>
      <SwitchField label="Ingeschakeld" testid="twilio-enabled"
        value={d.enabled} onChange={(v) => s.onField('enabled', v)}
        desc="Wanneer aan kun je WhatsApp- en SMS-berichten naar huurders sturen." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Account SID" testid="twilio-sid" value={d.account_sid} onChange={(v) => s.onField('account_sid', v)} placeholder="ACxxxxxxxx..." />
        <TextField label="Auth Token" testid="twilio-token" type="password" value={d.auth_token ?? ''} onChange={(v) => s.onField('auth_token', v)} placeholder="••••• (laat leeg om huidige te behouden)" />
        <TextField label="WhatsApp afzender" testid="twilio-wa-from" value={d.whatsapp_from} onChange={(v) => s.onField('whatsapp_from', v)} placeholder="whatsapp:+14155238886" helper="Inclusief 'whatsapp:' prefix" />
        <TextField label="SMS afzender" testid="twilio-sms-from" value={d.sms_from} onChange={(v) => s.onField('sms_from', v)} placeholder="+597 xxx xxxx" />
      </div>
      <ActionRow onSave={s.save} onTest={s.test} saving={s.saving} testing={s.testing} canTest={d.enabled} />
    </SectionShell>
  );
}

export function PaymentGatewayForm({ section, initial }) {
  const s = useSection(section, initial);
  const d = s.data;
  return (
    <SectionShell msg={s.msg} err={s.err}>
      <SwitchField label="Ingeschakeld" testid={`${section}-enabled`}
        value={d.enabled} onChange={(v) => s.onField('enabled', v)}
        desc="Wanneer aan kunnen huurders facturen online betalen." />
      {section === 'mope' && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-slate-700">
          <p className="font-black text-[#FF5C00] mb-1">Uni5Pay test/live-token aanvragen</p>
          <p className="mb-2">
            Voor een werkende QR-code (die de echte Uni5Pay-app herkent) heeft u een
            API-token nodig van Mopé. Stuur een mail naar{' '}
            <a href="mailto:info@mope.sr" className="text-[#FF5C00] font-bold underline">info@mope.sr</a>{' '}
            of bezoek <a href="https://mope.sr/contact" target="_blank" rel="noreferrer"
              className="text-[#FF5C00] font-bold underline">mope.sr/contact</a> en vraag een
            webshop-token aan voor uw bedrijf (vereist business-account en bankbezoek).
          </p>
          <p className="text-xs text-slate-500">
            Tokens met prefix <code className="bg-white px-1 rounded">test_</code> zijn voor testen
            (bedrag 1,00 = open · 2,00 = gescand · 3,00 = niet bevestigd · ander = direct betaald).
            Zonder token werkt het systeem in lokale mock-modus.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Merchant ID" testid={`${section}-merchant`} value={d.merchant_id} onChange={(v) => s.onField('merchant_id', v)} placeholder="MERCH-xxxx" />
        <div>
          <FieldLabel>Omgeving</FieldLabel>
          <select value={d.env} onChange={(e) => s.onField('env', e.target.value)} data-testid={`${section}-env`}
            className="w-full mt-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
            <option value="sandbox">Sandbox (test)</option>
            <option value="production">Productie (live)</option>
          </select>
        </div>
        <TextField label="API key" testid={`${section}-apikey`} type="password" value={d.api_key ?? ''} onChange={(v) => s.onField('api_key', v)}
          placeholder={section === 'mope' ? 'test_xxx... of live token van Mopé' : '••••• (laat leeg om huidige te behouden)'}
          helper={section === 'mope' ? 'Plak hier het token dat u van Mopé heeft ontvangen.' : ''} />
        <TextField label="Webhook secret" testid={`${section}-webhook`} type="password" value={d.webhook_secret ?? ''} onChange={(v) => s.onField('webhook_secret', v)} placeholder="••••• (laat leeg om huidige te behouden)" />
        <TextField label="Callback URL" testid={`${section}-callback`} value={d.callback_url} onChange={(v) => s.onField('callback_url', v)} placeholder="https://jouw-bedrijf.com/payment-return" helper="Waar de gebruiker terugkeert na betalen" />
      </div>
      <ActionRow onSave={s.save} onTest={s.test} saving={s.saving} testing={s.testing} canTest={d.enabled} />
    </SectionShell>
  );
}

export function ShellyForm({ initial }) {
  const s = useSection('shelly', initial);
  const d = s.data;
  return (
    <SectionShell msg={s.msg} err={s.err}>
      <SwitchField label="Ingeschakeld" testid="shelly-enabled"
        value={d.enabled} onChange={(v) => s.onField('enabled', v)}
        desc="Wanneer aan kun je Shelly smart breakers per appartement aan/uit zetten en verbruik aflezen." />
      <TextField label="Shelly Cloud token" testid="shelly-token" type="password" value={d.cloud_token ?? ''} onChange={(v) => s.onField('cloud_token', v)} placeholder="••••• (laat leeg om huidige te behouden)" helper="Te vinden in je Shelly Cloud account onder Gebruikersinstellingen > Authorization key" />
      <TextField label="Server (regionaal)" testid="shelly-server" value={d.server} onChange={(v) => s.onField('server', v)} placeholder="shelly-cloud.shelly.cloud" helper="Standaard: shelly-cloud.shelly.cloud" />
      <ActionRow onSave={s.save} onTest={s.test} saving={s.saving} testing={s.testing} canTest={d.enabled} />
    </SectionShell>
  );
}

export function DomainForm({ initial }) {
  const s = useSection('domain', initial);
  const d = s.data;
  // Haal het echte productie target-host + IP op van de backend zodat de
  // DNS instructie exacte waarden toont (i.p.v. placeholders). Deze
  // env-vars worden op de productie server geconfigureerd door Emergent.
  const [target, setTarget] = useState({ host: '', ip: '', configured: false, error: '' });
  useEffect(() => {
    let alive = true;
    api.get('/settings/domain/target')
      .then((r) => { if (alive) setTarget(r.data || {}); })
      .catch(() => { /* stil — fallback naar placeholder */ });
    return () => { alive = false; };
  }, []);
  const exampleTarget = target.host || 'app.surirent.sr';
  const exampleIp = target.ip || '<IP van je productie server>';
  return (
    <SectionShell msg={s.msg} err={s.err}>
      <SwitchField label="Ingeschakeld" testid="domain-enabled"
        value={d.enabled} onChange={(v) => s.onField('enabled', v)}
        desc="Wanneer aan, herkent het platform inkomende requests op jouw domein." />
      <TextField label="Custom domein" testid="domain-custom" value={d.custom_domain} onChange={(v) => s.onField('custom_domain', v.trim().toLowerCase())} placeholder="vastgoed.mijnbedrijf.com" helper="Zonder https:// en zonder pad." />
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
        <p className="font-bold flex items-center gap-2 text-slate-900"><Shield className="w-4 h-4 text-[#FF5C00]" /> DNS configuratie</p>
        {!target.configured && target.error && (
          <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            <b>Let op:</b> {target.error} — De onderstaande waarden zijn placeholders totdat dit door Emergent support is ingesteld.
          </p>
        )}
        <p>Maak bij je domeinregistrar één van deze records aan:</p>
        <pre className="bg-white border border-slate-200 rounded-lg p-2 font-mono text-[11px] overflow-x-auto">
{`Type:   CNAME
Naam:   ${d.custom_domain || 'vastgoed'}
Waarde: ${exampleTarget}
TTL:    3600

OF (als CNAME niet kan op root):

Type:   A
Naam:   ${d.custom_domain || '@'}
Waarde: ${exampleIp}
TTL:    3600`}
        </pre>
        <p className="text-slate-500">Na DNS-propagatie (max 24u): klik <b>Test verbinding</b> om te verifiëren, en voeg het domein als alias toe in CloudPanel met Let&apos;s Encrypt SSL.</p>
        {d.dns_verified && (
          <p className="text-emerald-700 font-bold flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> DNS geverifieerd</p>
        )}
      </div>
      <ActionRow onSave={s.save} onTest={s.test} saving={s.saving} testing={s.testing} canTest={d.enabled && !!d.custom_domain} />
    </SectionShell>
  );
}

export function InvoicingForm({ initial }) {
  const s = useSection('invoicing', initial);
  const d = s.data;
  return (
    <SectionShell msg={s.msg} err={s.err}>
      <SwitchField label="Ingeschakeld" testid="invoicing-enabled"
        value={d.enabled} onChange={(v) => s.onField('enabled', v)}
        desc="Wanneer aan, kan het systeem automatisch maandelijkse huur-facturen aanmaken." />
      <SwitchField label="Automatisch genereren" testid="invoicing-auto"
        value={d.auto_generate} onChange={(v) => s.onField('auto_generate', v)}
        desc="Genereer facturen automatisch voor elke bewoonde woning na het verlopen van de grace-periode." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Grace periode (werkdagen)" testid="invoicing-grace"
          type="number"
          value={d.grace_workdays} onChange={(v) => s.onField('grace_workdays', parseInt(v, 10) || 0)}
          placeholder="10"
          helper="Aantal werkdagen na einde van de maand voordat de volgende factuur automatisch wordt aangemaakt." />
        <div>
          <FieldLabel>Laatst uitgevoerd</FieldLabel>
          <input type="text" value={d.last_auto_run || '—'} disabled
            data-testid="invoicing-last-run"
            className="w-full mt-1 h-11 px-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-400" />
          <p className="text-[11px] text-slate-400 mt-1">Read-only: laatste keer dat de auto-generatie liep.</p>
        </div>
      </div>
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-slate-700">
        <p className="font-bold text-emerald-800 mb-1">Hoe werkt het?</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Aan het einde van elke maand wordt de huidige huur als verlopen beschouwd.</li>
          <li>De huurder krijgt <b>{d.grace_workdays || 10}</b> werkdagen om alsnog te betalen.</li>
          <li>Daarna genereert het systeem automatisch de volgende factuur voor elke bewoonde woning.</li>
          <li>Eventueel vooruitbetaald saldo (positief saldo van de huurder) wordt automatisch verrekend.</li>
        </ol>
        <p className="mt-2 text-slate-500">De achtergrond-taak loopt elke 6 uur — meestal binnen 1 dag na de deadline staat alles klaar.</p>
      </div>
      <ActionRow onSave={s.save} saving={s.saving} canTest={false} />
    </SectionShell>
  );
}


export function KioskPinForm() {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    setErr(''); setMsg('');
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { setErr('PIN moet exact 4 cijfers zijn'); return; }
    if (pin !== confirm) { setErr('PINs komen niet overeen'); return; }
    setLoading(true);
    try {
      await api.post('/auth/kiosk-set-pin', { pin });
      setMsg('Kiosk PIN bijgewerkt.'); setPin(''); setConfirm('');
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <SectionShell msg={msg} err={err}>
      <p className="text-xs text-slate-500">De PIN moet uniek zijn binnen het platform — geen ander bedrijf kan dezelfde PIN hebben.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Nieuwe PIN</FieldLabel>
          <input type="password" inputMode="numeric" maxLength={4} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            data-testid="kiosk-pin"
            className="w-full mt-1 h-14 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-2xl tracking-[0.5em] text-center font-bold" />
        </div>
        <div>
          <FieldLabel>Bevestig PIN</FieldLabel>
          <input type="password" inputMode="numeric" maxLength={4} value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
            data-testid="kiosk-pin-confirm"
            className="w-full mt-1 h-14 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-2xl tracking-[0.5em] text-center font-bold" />
        </div>
      </div>
      <button onClick={save} disabled={loading || !pin || !confirm} data-testid="settings-save"
        className="h-11 px-5 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center gap-2 disabled:opacity-50">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Opslaan
      </button>
    </SectionShell>
  );
}

// ============== Main ==============
export default function SettingsPage({ initialSection }) {
  const [section, setSection] = useState(initialSection || 'smtp');
  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const { data } = await api.get('/settings');
      setSettings(data);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Instellingen</h1>
        <p className="text-sm text-slate-500 mt-1">Configureer integraties per bedrijf. Wachtwoorden worden versleuteld opgeslagen.</p>
      </div>

      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">{err}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
        {/* Sub-nav */}
        <aside className="lg:sticky lg:top-4 self-start">
          <div className="bg-white rounded-2xl border border-orange-100 p-2 space-y-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = section === s.id;
              const enabled = s.id !== 'kiosk' && settings?.[s.id]?.enabled;
              return (
                <button key={s.id} onClick={() => setSection(s.id)}
                  data-testid={`settings-tab-${s.id}`}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left ${
                    isActive ? 'bg-[#FF5C00] text-white shadow-[0_8px_20px_-5px_rgba(255,92,0,0.55)]'
                      : 'text-slate-700 hover:bg-orange-50 hover:text-[#FF5C00]'
                  }`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate">{s.label}</span>
                  {enabled ? (
                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : 'bg-emerald-500'}`} title="Ingeschakeld" />
                  ) : s.id !== 'kiosk' && (
                    <PowerOff className={`w-3 h-3 ${isActive ? 'text-white/60' : 'text-slate-300'}`} />
                  )}
                  <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-white/70' : 'text-slate-300'}`} />
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0">
          {loading || !settings ? (
            <div className="bg-white rounded-2xl border border-orange-100 p-10 flex items-center justify-center text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Laden...
            </div>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{SECTIONS.find((s) => s.id === section)?.label}</p>
                <p className="text-sm text-slate-600 mt-0.5">{SECTIONS.find((s) => s.id === section)?.desc}</p>
              </div>
              {section === 'smtp' && <SmtpForm initial={settings.smtp} />}
              {section === 'twilio' && <TwilioForm initial={settings.twilio} />}
              {section === 'mope' && <PaymentGatewayForm section="mope" initial={settings.mope} />}
              {section === 'uni5pay' && <PaymentGatewayForm section="uni5pay" initial={settings.uni5pay} />}
              {section === 'shelly' && <ShellyForm initial={settings.shelly} />}
              {section === 'invoicing' && <InvoicingForm initial={settings.invoicing} />}
              {section === 'domain' && <DomainForm initial={settings.domain} />}
              {section === 'kiosk' && <KioskPinForm />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
