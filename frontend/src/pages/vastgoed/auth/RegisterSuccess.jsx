import { Check } from 'lucide-react';
import Header from './LoginHeader';

function RegisterSuccess({ plan, company, bankDetails, onContinue }) {
  const ref = `ABONNEMENT — ${company || ''} — ${new Date().toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`;
  return (
    <div className="flex flex-col" style={{
      position: 'fixed', inset: 0, backgroundColor: '#F97316',
      overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>
      <Header />
      <div className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-2xl p-6 sm:p-10" data-testid="register-success">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Check className="w-10 h-10 text-emerald-600" strokeWidth={3} />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Welkom bij SuriRent!</h2>
            <p className="text-sm text-slate-500 mt-1">Uw eigen omgeving is aangemaakt voor <span className="font-bold text-slate-900">{company}</span>.</p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-200 p-4 mb-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-orange-700">14 dagen proefperiode</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">Volledige toegang tot {plan.name}</p>
              </div>
              <p className="text-xl font-extrabold text-[#FF5C00] whitespace-nowrap">
                {plan.currency} {Number(plan.amount).toLocaleString('nl-NL')}
                <span className="text-[10px] font-medium text-slate-500 ml-1">/maand</span>
              </p>
            </div>
            <p className="text-xs text-slate-600">Na 14 dagen ontvangt u een factuur per e-mail. Annuleer vrijblijvend via uw beheerder-dashboard.</p>
          </div>

          {bankDetails && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 mb-5" data-testid="success-bank-details">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Bankoverschrijving</p>
              <div className="space-y-1.5 text-sm">
                <Bank label="Bank" value={bankDetails.bank_name} />
                <Bank label="Tenaamstelling" value={bankDetails.account_name} />
                <Bank label="Rekeningnummer" value={bankDetails.account_number} mono />
                {bankDetails.swift && <Bank label="SWIFT" value={bankDetails.swift} mono />}
                <Bank label="Omschrijving" value={ref} mono />
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Vragen? {bankDetails.whatsapp && <>WhatsApp <a href={`https://wa.me/${bankDetails.whatsapp.replace(/\D/g, '')}`} className="text-orange-600 font-bold">{bankDetails.whatsapp}</a> · </>}
                {bankDetails.support_email && <>E-mail <a href={`mailto:${bankDetails.support_email}`} className="text-orange-600 font-bold">{bankDetails.support_email}</a></>}
              </p>
            </div>
          )}

          <button onClick={onContinue} data-testid="success-continue"
            className="w-full h-14 bg-[#FF5C00] hover:bg-[#E05200] text-white rounded-xl text-lg font-extrabold transition shadow-lg shadow-orange-500/20">
            Naar mijn dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function Bank({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`font-bold text-slate-900 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}


export default RegisterSuccess;
export { Bank };
