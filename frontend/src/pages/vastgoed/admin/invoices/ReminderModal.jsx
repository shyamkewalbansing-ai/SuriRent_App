import { useState } from 'react';
import { X, Check, Loader2, MessageCircle, Mail } from 'lucide-react';
import { api, formatError, fmtMoney } from '../../../../lib/api';

// =====================================================================
// Reminder modal — WhatsApp / SMS / E-mail betalingsherinnering
// =====================================================================
export default function ReminderModal({ group, initialChannel = 'whatsapp', onClose, onSent }) {
  const [channel, setChannel] = useState(initialChannel);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setLoading(true); setError('');
    try {
      await api.post(`/tenants/${group.tenant_id}/reminder`, { channel, message });
      onSent(channel);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  const channels = [
    { v: 'whatsapp', l: 'WhatsApp', icon: MessageCircle, color: 'emerald' },
    { v: 'sms', l: 'SMS', icon: MessageCircle, color: 'slate' },
    { v: 'email', l: 'E-mail', icon: Mail, color: 'orange' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-open modal-sheet-auto"
      onClick={onClose} data-testid="reminder-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xl font-black text-slate-900">Betalingsherinnering</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-5">Naar <b className="text-slate-900">{group.tenant_name}</b> · {group.openCount} openstaande maand{group.openCount !== 1 ? 'en' : ''} · {fmtMoney(group.totalOpen, group.currency)}</p>

        {error && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}

        <div className="space-y-3 mb-4">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Kanaal</label>
          <div className="grid grid-cols-3 gap-2">
            {channels.map((c) => {
              const sel = channel === c.v;
              return (
                <button key={c.v} onClick={() => setChannel(c.v)}
                  data-testid={`reminder-channel-${c.v}`}
                  className={`py-3 rounded-xl border-2 font-bold text-sm flex flex-col items-center gap-1 transition ${
                    sel ? 'border-[#FF5C00] bg-orange-50 text-[#FF5C00]' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300'
                  }`}>
                  <c.icon className="w-4 h-4" /> {c.l}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 mb-5">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Extra bericht (optioneel)</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)}
            data-testid="reminder-message"
            placeholder="Bijv. 'Heeft u de huur van vorige maand al overgemaakt?'"
            className="w-full h-24 px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-sm resize-none" />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={send} disabled={loading} data-testid="reminder-send"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Versturen
          </button>
        </div>
      </div>
    </div>
  );
}
