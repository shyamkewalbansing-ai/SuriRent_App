import { useState } from 'react';
import { Mail, X, Loader2, Send, AlertCircle, Check, MessageCircle, Phone } from 'lucide-react';
import { api, formatError } from '../lib/api';

const CHANNELS = [
  { id: 'email', label: 'E-mail', icon: Mail, contact: 'email', endpointKey: 'email' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, contact: 'phone', endpointKey: 'message' },
  { id: 'sms', label: 'SMS', icon: Phone, contact: 'phone', endpointKey: 'message' },
];

/**
 * Reusable send dialog supporting e-mail, WhatsApp, and SMS.
 *
 * Props:
 *  - documentType: 'payment' | 'invoice' | 'contract' | 'overdue-reminder'
 *  - documentId: the id used in the API URL
 *  - documentLabel: e.g. "kwitantie", "factuur", "contract", "herinnering"
 *  - title: shown in modal header (e.g. "Kwitantie KW2026-001 verzenden")
 *  - tenantEmail / tenantPhone: prefilled contact
 *  - tenantName: shown subtitle
 *  - availableChannels: list of channel ids to show, default all 3
 *  - onClose, onSent
 */
export function SendDialog({
  documentType, documentId, documentLabel, title,
  tenantEmail = '', tenantPhone = '', tenantName = '',
  availableChannels = ['email', 'whatsapp', 'sms'],
  onClose, onSent,
}) {
  const channels = CHANNELS.filter((c) => availableChannels.includes(c.id));
  const [channel, setChannel] = useState(channels[0]?.id || 'email');
  const cur = channels.find((c) => c.id === channel);
  const initialTo = cur?.contact === 'email' ? tenantEmail : tenantPhone;
  const [to, setTo] = useState(initialTo);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const switchChannel = (id) => {
    setChannel(id);
    const next = channels.find((c) => c.id === id);
    setTo(next?.contact === 'email' ? tenantEmail : tenantPhone);
    setErr(''); setOk('');
  };

  const validate = () => {
    if (cur.contact === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setErr('Voer een geldig e-mailadres in');
      return false;
    }
    if (cur.contact === 'phone' && to.replace(/\D/g, '').length < 7) {
      setErr('Voer een geldig telefoonnummer in (inclusief landcode)');
      return false;
    }
    return true;
  };

  const send = async () => {
    setErr(''); setOk('');
    if (!validate()) return;
    setSending(true);
    try {
      let endpoint;
      let body;
      if (channel === 'email') {
        endpoint = `/email/${documentType}/${documentId}`;
        body = { to: to.trim(), message: msg.trim() };
      } else {
        endpoint = `/message/${documentType}/${documentId}`;
        body = { to: to.trim(), message: msg.trim(), channel };
      }
      const { data } = await api.post(endpoint, body);
      setOk(`Verzonden naar ${data.sent_to} via ${cur.label}`);
      if (onSent) onSent(data);
      setTimeout(() => onClose?.(), 1500);
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="send-dialog">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#FF8A3D] to-[#C74600] flex items-center justify-center">
              <Send className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-slate-900 leading-tight truncate">{title}</h2>
              {tenantName && <p className="text-[11px] text-slate-500 truncate">Voor: {tenantName}</p>}
            </div>
          </div>
          <button onClick={onClose} data-testid="send-dialog-close"
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center shrink-0">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {channels.length > 1 && (
            <div className="grid grid-cols-3 gap-2" role="tablist">
              {channels.map((c) => {
                const Icon = c.icon;
                const isActive = channel === c.id;
                return (
                  <button key={c.id} onClick={() => switchChannel(c.id)}
                    data-testid={`send-channel-${c.id}`}
                    className={`flex items-center justify-center gap-1.5 h-10 rounded-xl text-xs font-bold transition-all ${
                      isActive ? 'bg-[#FF5C00] text-white shadow-[0_6px_15px_-3px_rgba(255,92,0,0.5)]'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    <Icon className="w-3.5 h-3.5" /> {c.label}
                  </button>
                );
              })}
            </div>
          )}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
              {cur.contact === 'email' ? 'Ontvanger e-mail' : 'Telefoonnummer (incl. landcode)'}
            </label>
            <input type={cur.contact === 'email' ? 'email' : 'tel'} value={to} onChange={(e) => setTo(e.target.value)}
              placeholder={cur.contact === 'email' ? 'huurder@voorbeeld.com' : '+597 8xx xxxx'}
              data-testid="send-to"
              className="w-full mt-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            {!initialTo && (
              <p className="text-[11px] text-amber-700 mt-1">
                ⚠️ Huurder heeft geen {cur.contact === 'email' ? 'e-mailadres' : 'telefoonnummer'} in profiel — voer handmatig in.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Extra bericht (optioneel)</label>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3}
              data-testid="send-msg"
              placeholder={`Bijvoorbeeld: "Hierbij je ${documentLabel} voor deze maand."`}
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
            <button onClick={onClose} data-testid="send-cancel"
              className="flex-1 h-11 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:bg-slate-50">
              Annuleren
            </button>
            <button onClick={send} disabled={sending || !to} data-testid="send-submit"
              className="flex-1 h-11 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Verzenden
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== Backwards-compat: keep EmailDialog signature ==============
export function EmailDialog({ endpoint, subject, defaultTo, tenantName, documentLabel, onClose, onSent }) {
  // Derive documentType + id from endpoint like "/email/payment/{id}"
  const m = (endpoint || '').match(/\/email\/([^/]+)\/(.+)/);
  if (!m) return null;
  return (
    <SendDialog
      documentType={m[1]}
      documentId={m[2]}
      documentLabel={documentLabel}
      title={subject}
      tenantEmail={defaultTo || ''}
      tenantName={tenantName}
      availableChannels={['email']}
      onClose={onClose}
      onSent={onSent}
    />
  );
}
