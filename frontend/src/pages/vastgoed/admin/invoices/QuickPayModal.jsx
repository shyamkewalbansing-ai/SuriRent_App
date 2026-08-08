import { useState, useMemo } from 'react';
import { X, Check, Loader2, Banknote, CreditCard, Smartphone, FileText } from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../../../lib/api';

// =====================================================================
// QuickPayModal — één-klik betaling registreren vanuit de Facturen-detail
// zonder eerst naar Betalingen te navigeren. Prefilled met openstaand
// bedrag; toont direct de kwitantie na succes.
// =====================================================================
const METHODS = [
  { v: 'contant', l: 'Contant', icon: Banknote,   color: 'emerald' },
  { v: 'bank',    l: 'Bank',    icon: FileText,   color: 'blue' },
  { v: 'mope',    l: 'MoPe',    icon: Smartphone, color: 'orange' },
  { v: 'sumup',   l: 'SumUp',   icon: CreditCard, color: 'slate' },
  { v: 'uni5pay', l: 'Uni5Pay', icon: CreditCard, color: 'purple' },
];

export default function QuickPayModal({ invoice, tenantName, onClose, onSuccess }) {
  const remaining = useMemo(() => {
    const paid = Number(invoice.paid_amount || 0);
    const total = Number(invoice.amount || 0);
    return Math.max(0, total - paid);
  }, [invoice]);

  const [amount, setAmount] = useState(remaining > 0 ? String(remaining) : String(invoice.amount || 0));
  const [method, setMethod] = useState('contant');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);   // succes-view

  const parsedAmount = Number(String(amount).replace(',', '.'));
  const isValid = parsedAmount > 0 && !Number.isNaN(parsedAmount);
  const overpaying = parsedAmount > remaining + 0.001;

  const submit = async () => {
    if (!isValid) return;
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/payments', {
        tenant_id: invoice.tenant_id,
        apartment_id: invoice.apartment_id || null,
        amount: parsedAmount,
        currency: invoice.currency || 'SRD',
        method,
        category: 'huur',
        period_month: invoice.period_month,
        period_year: invoice.period_year,
        invoice_ids: [invoice.id],
        note: note || '',
      });
      setReceipt(data);
    } catch (e) {
      setError(formatError(e) || 'Kon betaling niet registreren');
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    // Als er een kwitantie is aangemaakt geven we altijd terug aan de
    // parent, ook wanneer de gebruiker sluit via de X of buiten-klik.
    if (receipt && onSuccess) onSuccess(receipt);
    onClose();
  };

  if (receipt) {
    // Succes-scherm met kwitantienummer en PDF-download
    return (
      <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-open modal-sheet-auto"
        onClick={close} data-testid="quickpay-success">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
              <Check className="w-8 h-8 text-emerald-600" strokeWidth={3} />
            </div>
            <h3 className="text-xl font-black text-slate-900">Betaling geregistreerd</h3>
            <p className="text-sm text-slate-500 mt-1">
              {receipt.currency} {Number(receipt.amount).toLocaleString('nl-NL', { minimumFractionDigits: 2 })} van <b className="text-slate-900">{tenantName || receipt.tenant_name}</b>
            </p>
            <div className="mt-4 bg-slate-50 rounded-2xl px-4 py-3 w-full">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Kwitantienummer</p>
              <p className="font-mono text-lg font-black text-slate-900" data-testid="quickpay-receipt-nr">{receipt.receipt_number}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-5">
            <a href={`${process.env.REACT_APP_BACKEND_URL}/api/payments/${receipt.id}/pdf`}
              target="_blank" rel="noreferrer"
              data-testid="quickpay-download-pdf"
              className="h-11 rounded-xl bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold inline-flex items-center justify-center gap-2 text-sm">
              <FileText className="w-4 h-4" /> Kwitantie PDF
            </a>
            <button onClick={close} data-testid="quickpay-close"
              className="h-11 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold text-sm">
              Klaar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-open modal-sheet-auto"
      onClick={close} data-testid="quickpay-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xl font-black text-slate-900">Snelle betaling</h3>
          <button onClick={close} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          <b className="text-slate-900">{tenantName || invoice.tenant_name}</b>
          {' · '}
          {MONTHS_NL[invoice.period_month - 1]} {invoice.period_year}
          {' · '}
          <span className="text-slate-400">{invoice.invoice_number}</span>
        </p>

        {/* Openstaand overzicht */}
        <div className="bg-slate-50 rounded-2xl p-4 mb-4 text-sm">
          <div className="flex justify-between mb-1">
            <span className="text-slate-500">Totaal factuur</span>
            <span className="font-bold text-slate-700">{fmtMoney(invoice.amount, invoice.currency)}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-slate-500">Reeds betaald</span>
            <span className="font-bold text-slate-700">{fmtMoney(invoice.paid_amount || 0, invoice.currency)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-slate-200">
            <span className="text-slate-900 font-bold">Nog te betalen</span>
            <span className="font-black text-[#FF5C00]" data-testid="quickpay-remaining">{fmtMoney(remaining, invoice.currency)}</span>
          </div>
        </div>

        {error && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm" data-testid="quickpay-error">{error}</div>}

        {/* Bedrag */}
        <div className="mb-4">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Bedrag *</label>
          <div className="mt-1 relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">{invoice.currency}</span>
            <input type="number" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="quickpay-amount"
              className="w-full h-12 pl-16 pr-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-lg font-black" />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <button type="button" onClick={() => setAmount(String(remaining))}
              data-testid="quickpay-set-remaining"
              className="text-[11px] font-bold text-[#FF5C00] hover:underline">
              Volledig openstaand ({fmtMoney(remaining, invoice.currency)})
            </button>
            {overpaying && (
              <span className="text-[11px] font-bold text-amber-700" data-testid="quickpay-overpay-warn">
                Overschot wordt vooruitbetaling
              </span>
            )}
          </div>
        </div>

        {/* Methode */}
        <div className="mb-4">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Methode</label>
          <div className="grid grid-cols-3 gap-1.5 mt-1.5">
            {METHODS.map((m) => {
              const sel = method === m.v;
              return (
                <button key={m.v} type="button" onClick={() => setMethod(m.v)}
                  data-testid={`quickpay-method-${m.v}`}
                  className={`py-2.5 rounded-xl border-2 font-bold text-xs flex flex-col items-center gap-0.5 transition ${
                    sel ? 'border-[#FF5C00] bg-orange-50 text-[#FF5C00]' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300'
                  }`}>
                  <m.icon className="w-4 h-4" /> {m.l}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notitie */}
        <div className="mb-5">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Notitie (optioneel)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
            data-testid="quickpay-note"
            placeholder="Bijv. 'Contant ontvangen aan balie'"
            className="w-full mt-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-sm" />
        </div>

        <div className="flex gap-3">
          <button onClick={close} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={submit} disabled={loading || !isValid} data-testid="quickpay-submit"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Registreer
          </button>
        </div>
      </div>
    </div>
  );
}
