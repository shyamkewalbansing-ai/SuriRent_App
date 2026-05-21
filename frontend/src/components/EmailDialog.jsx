import { useState } from 'react';
import { Mail, X, Loader2, Send, AlertCircle, Check } from 'lucide-react';
import { api, formatError } from '../lib/api';

/**
 * Reusable e-mail dialog for sending receipts / invoices / contracts.
 *
 * Props:
 *  - endpoint: backend path, e.g. `/email/payment/{id}` (will be POSTed to)
 *  - subject: shown in the modal title
 *  - defaultTo: prefilled recipient (tenant.email)
 *  - tenantName: shown in the message preview
 *  - documentLabel: e.g. "kwitantie", "factuur", "contract"
 *  - onClose: () => void
 *  - onSent: ({sent_to}) => void  (optional)
 */
export function EmailDialog({ endpoint, subject, defaultTo = '', tenantName = '', documentLabel, onClose, onSent }) {
  const [to, setTo] = useState(defaultTo);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const send = async () => {
    setErr(''); setOk('');
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setErr('Voer een geldig e-mailadres in');
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post(endpoint, { to: to.trim(), message: msg.trim() });
      setOk(`Verzonden naar ${data.sent_to}`);
      if (onSent) onSent(data);
      // Auto-close after 1.5s success
      setTimeout(() => onClose?.(), 1500);
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="email-dialog">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#FF8A3D] to-[#C74600] flex items-center justify-center">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">{subject}</h2>
              {tenantName && <p className="text-[11px] text-slate-500">Voor: {tenantName}</p>}
            </div>
          </div>
          <button onClick={onClose} data-testid="email-dialog-close"
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Ontvanger</label>
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)}
              placeholder="huurder@voorbeeld.com" data-testid="email-to"
              className="w-full mt-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            {!defaultTo && (
              <p className="text-[11px] text-amber-700 mt-1">⚠️ Huurder heeft geen e-mailadres in profiel — voer handmatig in.</p>
            )}
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Extra bericht (optioneel)</label>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3}
              data-testid="email-msg"
              placeholder={`Bijvoorbeeld: "Hierbij je ${documentLabel} voor deze maand. Bedankt voor de betaling!"`}
              className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none resize-none" />
          </div>
          {err && (
            <div className="flex gap-2 items-start text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {err}
            </div>
          )}
          {ok && (
            <div className="flex gap-2 items-start text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <Check className="w-4 h-4 mt-0.5 shrink-0" /> {ok}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} data-testid="email-cancel"
              className="flex-1 h-11 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:bg-slate-50">
              Annuleren
            </button>
            <button onClick={send} disabled={sending || !to} data-testid="email-send"
              className="flex-1 h-11 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Verzenden
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Small Mail button that opens the EmailDialog. Use as a slot in row actions.
 */
export function MailButton({ onClick, label = 'E-mail', testid }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-100 transition-colors"
      title={label}>
      <Mail className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
