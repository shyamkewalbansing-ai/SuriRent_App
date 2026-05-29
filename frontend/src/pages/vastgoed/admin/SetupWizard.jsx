import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Landmark, Smartphone, Home, User, CheckCircle2, ArrowRight, ArrowLeft,
  Loader2, Mail, Phone, MapPin, Sparkles, AlertCircle, Check, PartyPopper,
  MessageCircle, CreditCard, Zap, Globe, KeySquare, FileText, Settings as SettingsIcon,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';

const STEPS = [
  { id: 'profile', label: 'Bedrijfsgegevens', icon: Building2, color: 'sky' },
  { id: 'bank', label: 'Bankrekening', icon: Landmark, color: 'emerald' },
  { id: 'wallet', label: 'Mobile wallet', icon: Smartphone, color: 'violet' },
  { id: 'apartment', label: 'Appartement', icon: Home, color: 'orange' },
  { id: 'tenant', label: 'Huurder', icon: User, color: 'rose' },
  { id: 'integrations', label: 'Integraties', icon: SettingsIcon, color: 'slate' },
];

const INTEGRATIONS = [
  { id: 'smtp', label: 'E-mail (SMTP)', icon: Mail, desc: 'Verstuur kwitanties en facturen via je eigen SMTP server.' },
  { id: 'twilio', label: 'WhatsApp & SMS', icon: MessageCircle, desc: 'Twilio integratie voor WhatsApp- en SMS-meldingen.' },
  { id: 'mope', label: 'Mope betalingen', icon: CreditCard, desc: 'Online betalingen via Mope (Suriname).' },
  { id: 'uni5pay', label: 'Uni5Pay betalingen', icon: CreditCard, desc: 'Online betalingen via Uni5Pay.' },
  { id: 'shelly', label: 'Shelly elektriciteit', icon: Zap, desc: 'Smart breakers per appartement (Shelly Cloud).' },
  { id: 'invoicing', label: 'Facturen automatisering', icon: FileText, desc: 'Automatische maand-facturen na grace periode.' },
  { id: 'domain', label: 'Eigen domein', icon: Globe, desc: 'Koppel een eigen domein aan dit bedrijf.' },
  { id: 'kiosk', label: 'Kiosk PIN', icon: KeySquare, desc: 'Stel de 4-cijferige toegangs-PIN voor de Kiosk in.' },
];

export default function SetupWizard({ onJumpToSettings }) {
  const [status, setStatus] = useState(null);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // Form state for each step
  const [profile, setProfile] = useState({});
  const [apartment, setApartment] = useState({ number: '', address: '', rent_amount: '', currency: 'SRD' });
  const [tenant, setTenant] = useState({ name: '', phone: '', email: '', apartment_id: '', internet_amount: 0 });
  const [apts, setApts] = useState([]);

  const loadStatus = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [{ data: st }, { data: prof }, { data: aptList }] = await Promise.all([
        api.get('/companies/me/setup-status'),
        api.get('/companies/me/branding'),
        api.get('/apartments').catch(() => ({ data: [] })),
      ]);
      setStatus(st);
      setProfile(prof || {});
      setApts(aptList || []);
      // Auto-jump to first undone step
      const firstUndone = (st.steps || []).findIndex((s) => !s.done);
      if (firstUndone >= 0) setIdx(firstUndone);
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

  const isLast = idx === STEPS.length - 1;
  const currentStep = STEPS[idx];

  const nextStep = () => setIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const prevStep = () => setIdx((i) => Math.max(i - 1, 0));

  const showOk = (txt) => { setMsg(txt); setTimeout(() => setMsg(''), 2500); };

  const saveProfile = async (extraFields = {}) => {
    setSaving(true); setErr('');
    try {
      const payload = {
        name: profile.name || '',
        contact_email: profile.contact_email || '',
        contact_phone: profile.contact_phone || '',
        address: profile.address || '',
        bank_account_sr: profile.bank_account_sr || '',
        bank_account_nl: profile.bank_account_nl || '',
        mope_account: profile.mope_account || '',
        uni5pay_account: profile.uni5pay_account || '',
        ...extraFields,
      };
      await api.put('/companies/me/profile', payload);
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

  // Progress bar derived from latest status
  const completed = status?.completed || 0;
  const total = status?.total || STEPS.length;
  const percent = status?.percent || 0;
  const stepDone = (id) => {
    // Integraties is een informatieve stap (optioneel) — toon altijd als "klaar"
    // zodat het wizard-paneel niet onnodig oranje is.
    if (id === 'integrations') return true;
    return (status?.steps || []).find((s) => s.id === id)?.done;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4" data-testid="setup-wizard">
      <div className="bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-500 text-white rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-12 -left-8 w-32 h-32 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5" />
            <p className="text-[11px] uppercase tracking-[0.2em] font-black opacity-90">Setup Wizard</p>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black mb-1">
            {status?.complete ? 'Alles klaar 🎉' : 'Maak je platform in 5 stappen klaar'}
          </h2>
          <p className="text-sm opacity-90 mb-3">
            {status?.complete
              ? 'Je platform is volledig geconfigureerd. Je kunt deze pagina sluiten.'
              : `${completed} van ${total} stappen voltooid. Nog ${total - completed} te gaan.`}
          </p>
          <div className="h-2 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      {/* Step tabs */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1" data-testid="wizard-steps">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = stepDone(s.id);
          const active = i === idx;
          return (
            <button key={s.id} onClick={() => setIdx(i)}
              data-testid={`wizard-step-${s.id}`}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex-shrink-0
                ${active ? 'bg-slate-900 text-white' : done ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-white text-slate-500 border border-slate-200'}`}>
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

        {currentStep.id === 'profile' && (
          <StepProfile profile={profile} setProfile={setProfile} />
        )}
        {currentStep.id === 'bank' && (
          <StepBank profile={profile} setProfile={setProfile} />
        )}
        {currentStep.id === 'wallet' && (
          <StepWallet profile={profile} setProfile={setProfile} />
        )}
        {currentStep.id === 'apartment' && (
          <StepApartment apartment={apartment} setApartment={setApartment} apts={apts} />
        )}
        {currentStep.id === 'tenant' && (
          <StepTenant tenant={tenant} setTenant={setTenant} apts={apts} status={status} />
        )}
        {currentStep.id === 'integrations' && (
          <StepIntegrations onJumpToSettings={onJumpToSettings} />
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
          <button onClick={prevStep} disabled={idx === 0}
            data-testid="wizard-prev"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
            <ArrowLeft className="w-4 h-4" /> Vorige
          </button>

          {currentStep.id === 'apartment' && !stepDone('apartment') && (
            <button onClick={async () => { if (await createApartment()) nextStep(); }} disabled={saving}
              data-testid="wizard-save-apartment"
              className="flex items-center gap-1.5 px-5 h-11 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-black shadow-md active:scale-95 transition disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aanmaken & volgende'}
              {!saving && <ArrowRight className="w-4 h-4" />}
            </button>
          )}
          {currentStep.id === 'tenant' && !stepDone('tenant') && (
            <button onClick={async () => { if (await createTenant()) nextStep(); }} disabled={saving}
              data-testid="wizard-save-tenant"
              className="flex items-center gap-1.5 px-5 h-11 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-black shadow-md active:scale-95 transition disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aanmaken & afronden'}
              {!saving && <ArrowRight className="w-4 h-4" />}
            </button>
          )}
          {currentStep.id === 'integrations' && (
            <button onClick={nextStep} data-testid="wizard-int-finish"
              className="flex items-center gap-1.5 px-5 h-11 rounded-xl bg-slate-900 text-white font-black shadow-md active:scale-95 transition">
              Klaar <Check className="w-4 h-4" />
            </button>
          )}
          {['profile', 'bank', 'wallet'].includes(currentStep.id) && (
            <div className="flex items-center gap-2">
              <button onClick={async () => { if (await saveProfile()) nextStep(); }} disabled={saving}
                data-testid="wizard-save-and-next"
                className="flex items-center gap-1.5 px-5 h-11 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-black shadow-md active:scale-95 transition disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Opslaan & volgende'}
                {!saving && <ArrowRight className="w-4 h-4" />}
              </button>
              {!isLast && (currentStep.id === 'bank' || currentStep.id === 'wallet') && (
                <button onClick={nextStep} data-testid="wizard-skip"
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-1">
                  Overslaan
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {status?.complete && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-5 text-center" data-testid="wizard-complete">
          <PartyPopper className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
          <h3 className="text-lg font-extrabold text-emerald-800 mb-1">Alles is ingesteld!</h3>
          <p className="text-sm text-emerald-700">
            Je platform is klaar voor huurder-betalingen via bank, Mope en Uni5Pay.
          </p>
        </div>
      )}
    </div>
  );
}

// ====================================================================
// STEP COMPONENTS
// ====================================================================

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
    </div>
  );
}

function StepBank({ profile, setProfile }) {
  const upd = (k, v) => setProfile((p) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-3" data-testid="wizard-bank">
      <div className="mb-2">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><Landmark className="w-5 h-5" /> Bankrekening</h3>
        <p className="text-xs text-slate-500">Huurders kiezen bij bankoverschrijving uit welk land ze betalen. Vul minimaal één bank in.</p>
      </div>
      <FormField label="🇸🇷 Suriname bank" value={profile.bank_account_sr || ''}
        onChange={(e) => upd('bank_account_sr', e.target.value)}
        placeholder="bv. DSB Bank — 12.34.56.789 (Bedrijfsnaam)" data-testid="wizard-bank-sr" />
      <FormField label="🇳🇱 Nederlandse IBAN" value={profile.bank_account_nl || ''}
        onChange={(e) => upd('bank_account_nl', e.target.value)}
        placeholder="bv. NL12RABO0123456789 (Bedrijfsnaam)" data-testid="wizard-bank-nl" />
    </div>
  );
}

function StepWallet({ profile, setProfile }) {
  const upd = (k, v) => setProfile((p) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-3" data-testid="wizard-wallet">
      <div className="mb-2">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><Smartphone className="w-5 h-5" /> Mobile wallet</h3>
        <p className="text-xs text-slate-500">Mope en Uni5Pay tonen een QR-code zodat huurders direct vanuit hun telefoon kunnen betalen.</p>
      </div>
      <FormField label="Mope rekening" value={profile.mope_account || ''}
        onChange={(e) => upd('mope_account', e.target.value)}
        placeholder="bv. Mope ID of +597 ..." data-testid="wizard-mope" />
      <FormField label="Uni5Pay rekening" value={profile.uni5pay_account || ''}
        onChange={(e) => upd('uni5pay_account', e.target.value)}
        placeholder="bv. Uni5Pay merchant code" data-testid="wizard-uni5pay" />
    </div>
  );
}

function StepApartment({ apartment, setApartment, apts }) {
  const upd = (k, v) => setApartment((a) => ({ ...a, [k]: v }));
  return (
    <div className="space-y-3" data-testid="wizard-apartment">
      <div className="mb-2">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><Home className="w-5 h-5" /> Eerste appartement</h3>
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
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><User className="w-5 h-5" /> Eerste huurder</h3>
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



function StepIntegrations({ onJumpToSettings }) {
  return (
    <div className="space-y-3" data-testid="wizard-integrations">
      <div className="mb-2">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
          <SettingsIcon className="w-5 h-5" /> Integraties (optioneel)
        </h3>
        <p className="text-xs text-slate-500">
          Configureer extra integraties zoals e-mail, WhatsApp/SMS, Shelly smart breakers en meer. Klik op een tegel om direct die instelling te openen.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {INTEGRATIONS.map((it) => {
          const Icon = it.icon;
          return (
            <button key={it.id} type="button"
              onClick={() => onJumpToSettings && onJumpToSettings(it.id)}
              data-testid={`wizard-int-${it.id}`}
              className="text-left p-3 rounded-2xl border-2 border-slate-200 hover:border-slate-900 hover:bg-slate-50 transition active:scale-[0.98]">
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4.5 h-4.5 text-slate-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-extrabold text-slate-900">{it.label}</p>
                    <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{it.desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
        💡 Deze integraties zijn allemaal optioneel. Het platform werkt prima zonder, maar ze voegen handige automatisering toe.
      </div>
    </div>
  );
}
