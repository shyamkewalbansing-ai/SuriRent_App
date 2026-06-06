import { useState, useEffect, useCallback } from 'react';
import {
  Save, Loader2, Check, AlertCircle, Building2, Mail, Phone, MapPin, Landmark,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';

export default function BusinessInfo() {
  const [b, setB] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/companies/me/branding');
      setB(data || {});
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const upd = (k, v) => setB((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      const { data } = await api.put('/companies/me/profile', {
        name: b.name || '',
        contact_email: b.contact_email || '',
        contact_phone: b.contact_phone || '',
        address: b.address || '',
        bank_account_sr: b.bank_account_sr || '',
        bank_account_nl: b.bank_account_nl || '',
        mope_account: b.mope_account || '',
        uni5pay_account: b.uni5pay_account || '',
      });
      setB((prev) => ({ ...prev, ...data }));
      setMsg('Opgeslagen! Bedrijfsgegevens zijn direct actief.');
      setTimeout(() => setMsg(''), 4000);
    } catch (e) { setErr(formatError(e)); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4" data-testid="business-info-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6" /> Bedrijfsgegevens
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Contact, bankrekeningen en mobile wallets voor huurder-betalingen.</p>
        </div>
        <button onClick={save} disabled={saving} data-testid="business-info-save"
          className="px-5 h-11 rounded-xl bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white font-bold shadow-md disabled:opacity-50 flex items-center gap-2 active:scale-95 transition">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Opslaan
        </button>
      </div>
      {msg && <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-bold"><Check className="w-4 h-4" />{msg}</div>}
      {err && <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-bold"><AlertCircle className="w-4 h-4" />{err}</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Contact */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <h3 className="text-sm font-extrabold text-slate-900 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Contact & Adres
          </h3>
          <label className="block mb-3">
            <span className="block text-xs font-bold text-slate-700 mb-1">Bedrijfsnaam</span>
            <input type="text" value={b.name || ''} onChange={(e) => upd('name', e.target.value)}
              placeholder="bv. SuriRent N.V." data-testid="bi-name"
              className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none" />
            <p className="text-[11px] text-slate-400 mt-0.5">Verschijnt op kwitanties, contracten en de gouden QR-plaquette.</p>
          </label>
          <label className="block mb-3">
            <span className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Contact e-mail</span>
            <input type="email" value={b.contact_email || ''} onChange={(e) => upd('contact_email', e.target.value)}
              placeholder="info@bedrijf.sr" data-testid="bi-email"
              className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none" />
          </label>
          <label className="block mb-3">
            <span className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Telefoonnummer</span>
            <input type="tel" value={b.contact_phone || ''} onChange={(e) => upd('contact_phone', e.target.value)}
              placeholder="+597 ..." data-testid="bi-phone"
              className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Adres</span>
            <input type="text" value={b.address || ''} onChange={(e) => upd('address', e.target.value)}
              placeholder="Straat 123, Paramaribo" data-testid="bi-address"
              className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none" />
          </label>
        </div>

        {/* Bankrekeningen */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <h3 className="text-sm font-extrabold text-slate-900 mb-1 flex items-center gap-2">
            <Landmark className="w-4 h-4" /> Bankrekeningen
          </h3>
          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
            Huurders kiezen in de kiosk uit welk land ze betalen — de juiste rekening wordt automatisch getoond.
          </p>
          <label className="block mb-3">
            <span className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">🇸🇷 Suriname</span>
            <input type="text" value={b.bank_account_sr || ''} onChange={(e) => upd('bank_account_sr', e.target.value)}
              placeholder="bv. DSB Bank — 12.34.56.789 (Bedrijfsnaam)" data-testid="bi-bank-sr"
              className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none" />
            <p className="text-[10px] text-slate-400 mt-0.5">Bank + rekeningnummer + tenaamstelling</p>
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">🇳🇱 Nederland</span>
            <input type="text" value={b.bank_account_nl || ''} onChange={(e) => upd('bank_account_nl', e.target.value)}
              placeholder="bv. NL12RABO0123456789 (Bedrijfsnaam)" data-testid="bi-bank-nl"
              className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none" />
            <p className="text-[10px] text-slate-400 mt-0.5">IBAN + tenaamstelling</p>
          </label>
        </div>

        {/* Mobile wallets */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 lg:col-span-2">
          <h3 className="text-sm font-extrabold text-slate-900 mb-1 flex items-center gap-2">
            📱 Mobile wallets (Uni5Pay & Uni5Pay)
          </h3>
          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
            Huurders scannen een QR-code in hun Uni5Pay of Uni5Pay app, betalen, en uploaden een schermafdruk als bewijs. Het systeem controleert automatisch via OCR.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-bold text-slate-700 mb-1">Uni5Pay rekening</span>
              <input type="text" value={b.mope_account || ''} onChange={(e) => upd('mope_account', e.target.value)}
                placeholder="bv. Uni5Pay ID of telefoonnummer +597 ..."
                data-testid="bi-mope"
                className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none" />
              <p className="text-[10px] text-slate-400 mt-0.5">Uni5Pay ID, merchant-code of telefoonnummer waarmee huurders kunnen betalen</p>
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-slate-700 mb-1">Uni5Pay rekening</span>
              <input type="text" value={b.uni5pay_account || ''} onChange={(e) => upd('uni5pay_account', e.target.value)}
                placeholder="bv. Uni5Pay ID of merchant code"
                data-testid="bi-uni5pay"
                className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none" />
              <p className="text-[10px] text-slate-400 mt-0.5">Uni5Pay ID of merchant-code</p>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
