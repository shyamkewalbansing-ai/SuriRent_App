import { useState, useEffect } from 'react';
import { Clock, ArrowRight, X, Sparkles } from 'lucide-react';
import { api } from '../lib/api';

export default function TrialBanner() {
  const [info, setInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [bank, setBank] = useState(null);

  useEffect(() => {
    api.get('/billing/me').then((r) => setInfo(r.data)).catch(() => setInfo(null));
  }, []);

  if (!info || dismissed) return null;
  if (info.status !== 'trial' && info.status !== 'expired') return null;

  const isExpired = info.status === 'expired' || (info.days_left ?? 1) <= 0;
  const days = Math.max(0, info.days_left ?? 0);

  const openDetails = async () => {
    if (!bank) {
      try { const r = await api.get('/billing/bank-details'); setBank(r.data); }
      catch { setBank({}); }
    }
    setShowDetails(true);
  };

  return (
    <>
      <div
        data-testid="trial-banner"
        className={`relative w-full px-3 sm:px-5 py-2.5 flex items-center gap-3 ${
          isExpired
            ? 'bg-gradient-to-r from-red-500 to-red-600 text-white'
            : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
        }`}
      >
        <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
          {isExpired ? <Clock className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-sm sm:text-base leading-tight">
            {isExpired ? 'Proefperiode verlopen' : `Nog ${days} ${days === 1 ? 'dag' : 'dagen'} proefperiode`}
          </p>
          <p className="text-[11px] sm:text-xs text-white/90 truncate">
            {info.plan?.name} pakket · {info.currency} {Number(info.monthly_amount || 0).toLocaleString('nl-NL')}/maand · betaal per bankoverschrijving
          </p>
        </div>
        <button onClick={openDetails} data-testid="trial-upgrade-btn"
          className="px-3 sm:px-4 h-9 rounded-lg bg-white text-orange-600 hover:bg-orange-50 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap">
          {isExpired ? 'Activeer' : 'Upgrade'} <ArrowRight className="w-3.5 h-3.5" />
        </button>
        {!isExpired && (
          <button onClick={() => setDismissed(true)} data-testid="trial-dismiss"
            className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showDetails && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="trial-modal">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-extrabold text-slate-900">Abonnement activeren</h3>
              <button onClick={() => setShowDetails(false)} data-testid="trial-modal-close"
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-200 p-4 mb-4">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-orange-700">Pakket {info.plan?.name}</p>
              <p className="text-2xl font-extrabold text-[#FF5C00] mt-1">
                {info.currency} {Number(info.monthly_amount || 0).toLocaleString('nl-NL')}
                <span className="text-xs font-medium text-slate-500 ml-1">/maand</span>
              </p>
              {(info.plan?.features || []).length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {info.plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-orange-500" />{f}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {bank && (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 mb-4">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Bankoverschrijving</p>
                <div className="space-y-1.5 text-sm">
                  <Row label="Bank" value={bank.bank_name} />
                  <Row label="Tenaamstelling" value={bank.account_name} />
                  <Row label="Rekeningnummer" value={bank.account_number} mono />
                  {bank.swift && <Row label="SWIFT" value={bank.swift} mono />}
                  <Row label="Bedrag" value={`${info.currency} ${Number(info.monthly_amount || 0).toLocaleString('nl-NL')}`} mono />
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Vermeld bij betaling: <span className="font-mono font-bold text-slate-600">ABONNEMENT — {info.plan?.name}</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-2">
                  Vragen? {bank.whatsapp && <>WhatsApp <a href={`https://wa.me/${(bank.whatsapp || '').replace(/\D/g, '')}`} className="text-orange-600 font-bold">{bank.whatsapp}</a> · </>}
                  {bank.support_email && <>E-mail <a href={`mailto:${bank.support_email}`} className="text-orange-600 font-bold">{bank.support_email}</a></>}
                </p>
              </div>
            )}

            <button onClick={() => setShowDetails(false)}
              className="w-full h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm">
              Sluiten
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`font-bold text-slate-900 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
