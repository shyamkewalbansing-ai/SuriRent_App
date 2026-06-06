import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Smartphone, Home, User, CheckCircle2, ArrowRight, ArrowLeft,
  Loader2, Mail, Phone, MapPin, Sparkles, AlertCircle, Check, PartyPopper,
  MessageCircle, CreditCard, Zap, Globe, KeySquare, FileText,
  Palette, UsersRound,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';
import {
  SmtpForm, TwilioForm, PaymentGatewayForm, ShellyForm, DomainForm,
  InvoicingForm, KioskPinForm,
} from './Settings';
import Branding from './Branding';
import Locations from './Locations';
import Employees from './Employees';

// Stap-definities in de exacte volgorde door de gebruiker gewenst.
// Alle stappen zijn inline bewerkbaar binnen de wizard.
const STEPS = [
  { id: 'profile', label: 'Bedrijfsgegevens', icon: Building2 },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'smtp', label: 'E-mail (SMTP)', icon: Mail, settings: true },
  { id: 'invoicing', label: 'Facturen automatisering', icon: FileText, settings: true },
  { id: 'domain', label: 'Eigen domein', icon: Globe, settings: true },
  { id: 'kiosk', label: 'Kiosk PIN', icon: KeySquare, settings: true },
  { id: 'twilio', label: 'WhatsApp & SMS', icon: MessageCircle, settings: true },
  { id: 'shelly', label: 'Shelly elektriciteit', icon: Zap, settings: true },
  { id: 'mope', label: 'Uni5Pay betalingen', icon: CreditCard, settings: true },
  { id: 'uni5pay', label: 'Uni5Pay betalingen', icon: CreditCard, settings: true },
  { id: 'locations', label: 'Locaties', icon: MapPin },
  { id: 'apartment', label: 'Appartementen', icon: Home },
  { id: 'tenant', label: 'Huurders', icon: User },
  { id: 'employees', label: 'Werknemers', icon: UsersRound },
];

export default function SetupWizard() {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const [profile, setProfile] = useState({});
  const [apartment, setApartment] = useState({ number: '', address: '', rent_amount: '', currency: 'SRD' });
  const [tenant, setTenant] = useState({ name: '', phone: '', email: '', apartment_id: '', internet_amount: 0 });
  const [apts, setApts] = useState([]);

  const loadStatus = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [{ data: st }, { data: prof }, { data: aptList }, { data: settingsData }] = await Promise.all([
        api.get('/companies/me/setup-status'),
        api.get('/companies/me/branding'),
        api.get('/apartments').catch(() => ({ data: [] })),
        api.get('/settings').catch(() => ({ data: null })),
      ]);
      setStatus(st);
      setProfile(prof || {});
      setApts(aptList || []);
      setSettings(settingsData);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const currentStep = STEPS[idx];
  const nextStep = () => setIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const prevStep = () => setIdx((i) => Math.max(i - 1, 0));
  const showOk = (txt) => { setMsg(txt); setTimeout(() => setMsg(''), 2500); };

  const formStepDone = (id) => (status?.steps || []).find((s) => s.id === id)?.done;
  const stepDone = (id) => {
    if (['profile', 'apartment', 'tenant'].includes(id)) return formStepDone(id);
    // Voor settings-secties: zichtbaar als "klaar" wanneer enabled in settings
    if (settings && settings[id]?.enabled) return true;
    return false;
  };

  const requiredIds = ['profile', 'apartment', 'tenant'];
  const completed = requiredIds.filter((id) => formStepDone(id)).length;
  const total = requiredIds.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total;

  const saveProfile = async () => {
    setSaving(true); setErr('');
    try {
      await api.put('/companies/me/profile', {
        name: profile.name || '',
        contact_email: profile.contact_email || '',
        contact_phone: profile.contact_phone || '',
        address: profile.address || '',
        bank_account_sr: profile.bank_account_sr || '',
        bank_account_nl: profile.bank_account_nl || '',
        mope_account: profile.mope_account || '',
        uni5pay_account: profile.uni5pay_account || '',
      });
      await loadStatus();
      showOk('Opgeslagen!');
      return true;
    } catch (e) { setErr(formatError(e)); return false; }
    finally { setSaving(false); }
  };

  const createApartment = async () => {
    setSaving(true); setErr('');
    try {
      if (!apartment.number?.trim()) { setErr('Huisnummer is verplicht'); return false; }
      if (!Number(apartment.rent_amount) || Number(apartment.rent_amount) <= 0) {
        setErr('Huurprijs moet > 0 zijn'); return false;
      }
      const { data } = await api.post('/apartments', {
        number: apartment.number.trim(),
        address: apartment.address || '',
        rent_amount: Number(apartment.rent_amount),
        currency: apartment.currency || 'SRD',
      });
      setApts((prev) => [...prev, data]);
      setTenant((t) => ({ ...t, apartment_id: data.id }));
      await loadStatus();
      showOk(`Appartement ${data.number} aangemaakt`);
      setApartment({ number: '', address: '', rent_amount: '', currency: 'SRD' });
      return true;
    } catch (e) { setErr(formatError(e)); return false; }
    finally { setSaving(false); }
  };

  const createTenant = async () => {
    setSaving(true); setErr('');
    try {
      if (!tenant.name?.trim()) { setErr('Naam is verplicht'); return false; }
      await api.post('/tenants', {
        name: tenant.name.trim(),
        phone: tenant.phone || '',
        email: tenant.email || '',
        apartment_id: tenant.apartment_id || null,
        internet_amount: Number(tenant.internet_amount) || 0,
      });
      await loadStatus();
      showOk(`Huurder ${tenant.name} aangemaakt`);
      setTenant({ name: '', phone: '', email: '', apartment_id: '', internet_amount: 0 });
      return true;
    } catch (e) { setErr(formatError(e)); return false; }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4" data-testid="setup-wizard">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-500 text-white rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-12 -left-8 w-32 h-32 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5" />
            <p className="text-[11px] uppercase tracking-[0.2em] font-black opacity-90">Setup Wizard</p>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black mb-1">
            {allDone ? 'Basis-setup klaar 🎉' : 'Stap voor stap je platform inrichten'}
          </h2>
          <p className="text-sm opacity-90 mb-3">
            Stap <strong>{idx + 1} van {STEPS.length}</strong> · {STEPS[idx].label}
          </p>
          <div className="h-2 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${Math.round(((idx + 1) / STEPS.length) * 100)}%` }} />
          </div>
          <p className="text-[11px] opacity-80 mt-2">
            Verplichte basis: <strong>{completed}/{total}</strong> ({percent}%) — overige stappen zijn optioneel.
          </p>
        </div>
      </div>

      {/* Step pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" data-testid="wizard-steps">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = stepDone(s.id);
          const active = i === idx;
          return (
            <button key={s.id} onClick={() => setIdx(i)}
              data-testid={`wizard-step-${s.id}`}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex-shrink-0
                ${active ? 'bg-slate-900 text-white' : done ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-400'}`}>
              {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              <span>{i + 1}. {s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-md p-5 sm:p-6">
        {err && (
          <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-bold">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
          </div>
        )}
        {msg && (
          <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-bold">
            <Check className="w-4 h-4 flex-shrink-0" /> {msg}
          </div>
        )}

        {currentStep.id === 'profile' && <StepProfile profile={profile} setProfile={setProfile} />}
        {currentStep.id === 'branding' && <Branding />}
        {currentStep.settings && settings && (
          <SettingsSectionWrapper step={currentStep} settings={settings} />
        )}
        {currentStep.id === 'locations' && <Locations />}
        {currentStep.id === 'apartment' && <StepApartment apartment={apartment} setApartment={setApartment} apts={apts} />}
        {currentStep.id === 'tenant' && <StepTenant tenant={tenant} setTenant={setTenant} apts={apts} status={status} />}
        {currentStep.id === 'employees' && <Employees />}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
          <button onClick={prevStep} disabled={idx === 0}
            data-testid="wizard-prev"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
            <ArrowLeft className="w-4 h-4" /> Vorige
          </button>

          {currentStep.id === 'profile' && (
            <button onClick={async () => { if (await saveProfile()) nextStep(); }} disabled={saving}
              data-testid="wizard-save-and-next"
              className="flex items-center gap-1.5 px-5 h-11 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-black shadow-md active:scale-95 transition disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Opslaan & volgende'}
              {!saving && <ArrowRight className="w-4 h-4" />}
            </button>
          )}
          {currentStep.id === 'apartment' && (
            <div className="flex items-center gap-2">
              {!formStepDone('apartment') && (
                <button onClick={async () => { if (await createApartment()) nextStep(); }} disabled={saving}
                  data-testid="wizard-save-apartment"
                  className="flex items-center gap-1.5 px-5 h-11 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-black shadow-md active:scale-95 transition disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aanmaken & volgende'}
                  {!saving && <ArrowRight className="w-4 h-4" />}
                </button>
              )}
              {formStepDone('apartment') && (
                <button onClick={nextStep} data-testid="wizard-next"
                  className="flex items-center gap-1.5 px-5 h-11 rounded-xl bg-slate-900 text-white font-black">
                  Volgende <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          {currentStep.id === 'tenant' && (
            <div className="flex items-center gap-2">
              {!formStepDone('tenant') && (
                <button onClick={async () => { if (await createTenant()) nextStep(); }} disabled={saving}
                  data-testid="wizard-save-tenant"
                  className="flex items-center gap-1.5 px-5 h-11 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-black shadow-md active:scale-95 transition disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aanmaken & volgende'}
                  {!saving && <ArrowRight className="w-4 h-4" />}
                </button>
              )}
              {formStepDone('tenant') && (
                <button onClick={nextStep} data-testid="wizard-next"
                  className="flex items-center gap-1.5 px-5 h-11 rounded-xl bg-slate-900 text-white font-black">
                  Volgende <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          {(currentStep.settings || ['branding', 'locations', 'employees'].includes(currentStep.id)) && (
            <button onClick={nextStep} data-testid="wizard-next"
              className="flex items-center gap-1.5 px-5 h-11 rounded-xl bg-slate-900 text-white font-black">
              {idx === STEPS.length - 1 ? 'Klaar' : 'Volgende'} <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {allDone && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-5 text-center" data-testid="wizard-complete">
          <PartyPopper className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
          <h3 className="text-lg font-extrabold text-emerald-800 mb-1">Basis-setup compleet!</h3>
          <p className="text-sm text-emerald-700">
            Bedrijfsgegevens, eerste appartement en eerste huurder zijn ingesteld. Optionele integraties (e-mail, WhatsApp, Shelly...) kun je elk moment instellen.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SETTINGS WRAPPER — embed Settings.jsx sub-forms inline
// ============================================================
function SettingsSectionWrapper({ step, settings }) {
  return (
    <div data-testid={`wizard-settings-${step.id}`}>
      <div className="mb-3">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
          <step.icon className="w-5 h-5" /> {step.label}
        </h3>
      </div>
      {step.id === 'smtp' && <SmtpForm initial={settings.smtp} />}
      {step.id === 'twilio' && <TwilioForm initial={settings.twilio} />}
      {step.id === 'mope' && <PaymentGatewayForm section="mope" initial={settings.mope} />}
      {step.id === 'uni5pay' && <PaymentGatewayForm section="uni5pay" initial={settings.uni5pay} />}
      {step.id === 'shelly' && <ShellyForm initial={settings.shelly} />}
      {step.id === 'invoicing' && <InvoicingForm initial={settings.invoicing} />}
      {step.id === 'domain' && <DomainForm initial={settings.domain} />}
      {step.id === 'kiosk' && <KioskPinForm />}
    </div>
  );
}

// ============================================================
// FORM-STAP COMPONENTS
// ============================================================
function FormField({ label, icon: Icon, ...inputProps }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />} {label}
      </span>
      <input {...inputProps}
        className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none" />
    </label>
  );
}

function StepProfile({ profile, setProfile }) {
  const upd = (k, v) => setProfile((p) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-3" data-testid="wizard-profile">
      <div className="mb-2">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><Building2 className="w-5 h-5" /> Bedrijfsgegevens</h3>
        <p className="text-xs text-slate-500">Deze info verschijnt op kwitanties, contracten en de gouden QR-plaquette.</p>
      </div>
      <FormField label="Bedrijfsnaam *" value={profile.name || ''} onChange={(e) => upd('name', e.target.value)}
        placeholder="bv. SuriRent N.V." data-testid="wizard-name" />
      <FormField icon={Mail} label="Contact e-mail" type="email" value={profile.contact_email || ''}
        onChange={(e) => upd('contact_email', e.target.value)} placeholder="info@bedrijf.sr" data-testid="wizard-email" />
      <FormField icon={Phone} label="Telefoonnummer" type="tel" value={profile.contact_phone || ''}
        onChange={(e) => upd('contact_phone', e.target.value)} placeholder="+597 ..." data-testid="wizard-phone" />
      <FormField icon={MapPin} label="Adres" value={profile.address || ''} onChange={(e) => upd('address', e.target.value)}
        placeholder="Straat 123, Paramaribo" data-testid="wizard-address" />
      <div className="grid grid-cols-2 gap-3 mt-3">
        <FormField label="🇸🇷 Suriname bank (optioneel)" value={profile.bank_account_sr || ''}
          onChange={(e) => upd('bank_account_sr', e.target.value)}
          placeholder="DSB Bank — 12.34.56.789" data-testid="wizard-bank-sr" />
        <FormField label="🇳🇱 Nederlandse IBAN (optioneel)" value={profile.bank_account_nl || ''}
          onChange={(e) => upd('bank_account_nl', e.target.value)}
          placeholder="NL12RABO0123456789" data-testid="wizard-bank-nl" />
      </div>
    </div>
  );
}

function StepApartment({ apartment, setApartment, apts }) {
  const upd = (k, v) => setApartment((a) => ({ ...a, [k]: v }));
  return (
    <div className="space-y-3" data-testid="wizard-apartment">
      <div className="mb-2">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><Home className="w-5 h-5" /> Appartementen</h3>
        <p className="text-xs text-slate-500">Voeg minimaal één appartement toe — daarna kun je een huurder eraan koppelen.</p>
      </div>
      {apts.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700">
          ✓ Je hebt al {apts.length} appartement{apts.length === 1 ? '' : 'en'}: {apts.slice(0, 5).map((a) => a.number).join(', ')}
          {apts.length > 5 ? ` en ${apts.length - 5} meer` : ''}.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Huisnummer *" value={apartment.number} onChange={(e) => upd('number', e.target.value)}
          placeholder="bv. 7B" data-testid="wizard-apt-number" />
        <FormField label="Huurprijs per maand *" type="number" value={apartment.rent_amount}
          onChange={(e) => upd('rent_amount', e.target.value)} placeholder="7000" data-testid="wizard-apt-rent" />
      </div>
      <label className="block">
        <span className="block text-xs font-bold text-slate-700 mb-1">Valuta</span>
        <select value={apartment.currency} onChange={(e) => upd('currency', e.target.value)}
          data-testid="wizard-apt-currency"
          className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none">
          <option value="SRD">SRD</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
      </label>
      <FormField label="Adres (optioneel)" value={apartment.address} onChange={(e) => upd('address', e.target.value)}
        placeholder="Kewalbansingweg 7B, Paramaribo" data-testid="wizard-apt-address" />
    </div>
  );
}

function StepTenant({ tenant, setTenant, apts, status }) {
  const upd = (k, v) => setTenant((t) => ({ ...t, [k]: v }));
  return (
    <div className="space-y-3" data-testid="wizard-tenant">
      <div className="mb-2">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><User className="w-5 h-5" /> Huurders</h3>
        <p className="text-xs text-slate-500">Koppel je eerste huurder aan een appartement. Hij/zij stelt straks bij eerste QR-scan een eigen PIN in.</p>
      </div>
      {(status?.counts?.tenants || 0) > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700">
          ✓ Je hebt al {status.counts.tenants} huurder{status.counts.tenants === 1 ? '' : 's'}.
        </div>
      )}
      <FormField label="Naam *" value={tenant.name} onChange={(e) => upd('name', e.target.value)}
        placeholder="bv. Jan Jansen" data-testid="wizard-tenant-name" />
      <div className="grid grid-cols-2 gap-3">
        <FormField icon={Phone} label="Telefoon" type="tel" value={tenant.phone}
          onChange={(e) => upd('phone', e.target.value)} placeholder="+597 ..." data-testid="wizard-tenant-phone" />
        <FormField icon={Mail} label="E-mail" type="email" value={tenant.email}
          onChange={(e) => upd('email', e.target.value)} placeholder="huurder@..." data-testid="wizard-tenant-email" />
      </div>
      <label className="block">
        <span className="block text-xs font-bold text-slate-700 mb-1">Appartement</span>
        <select value={tenant.apartment_id} onChange={(e) => upd('apartment_id', e.target.value)}
          data-testid="wizard-tenant-apt"
          className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none">
          <option value="">— Geen (kan later gekoppeld worden)</option>
          {apts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.number}{a.status === 'occupied' ? ' (bezet)' : ''}{a.rent_amount ? ` — ${a.currency} ${a.rent_amount}` : ''}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
