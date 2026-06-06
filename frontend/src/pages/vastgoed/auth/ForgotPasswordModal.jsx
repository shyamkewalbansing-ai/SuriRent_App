import { useState } from 'react';
import { Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { api, formatError } from '../../../lib/api';

function ForgotPasswordModal({ initialEmail, onClose }) {
  const [stage, setStage] = useState('request');  // 'request' | 'verify' | 'done'
  const [email, setEmail] = useState(initialEmail || '');
  const [channel, setChannel] = useState('email');  // 'email' | 'whatsapp'
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const requestCode = async (e) => {
    e?.preventDefault();
    setLoading(true); setErr(''); setInfo('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email, channel });
      setInfo(data?.message || `Code verzonden via ${channel === 'email' ? 'e-mail' : 'WhatsApp'}.`);
      setStage('verify');
    } catch (e) {
      setErr(formatError(e, 'Kon code niet versturen'));
    } finally { setLoading(false); }
  };

  const submitReset = async (e) => {
    e?.preventDefault();
    setLoading(true); setErr('');
    try {
      await api.post('/auth/reset-password', { email, code: code.trim(), new_password: newPassword });
      setStage('done');
    } catch (e) {
      setErr(formatError(e, 'Reset mislukt'));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      data-testid="forgot-password-modal" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 bg-[#FF5C00] text-white">
          <p className="text-lg font-extrabold">Wachtwoord vergeten</p>
          <p className="text-xs opacity-90 mt-0.5">
            {stage === 'request' && 'Kies hoe je de herstelcode wilt ontvangen'}
            {stage === 'verify' && 'Voer de ontvangen code in en kies een nieuw wachtwoord'}
            {stage === 'done' && 'Wachtwoord succesvol gewijzigd'}
          </p>
        </div>

        {stage === 'request' && (
          <form onSubmit={requestCode} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">E-mailadres</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                data-testid="forgot-email"
                className="w-full h-12 text-base px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Verstuur code via</label>
              <div className="grid grid-cols-2 gap-2">
                {[{ id: 'email', label: 'E-mail' }, { id: 'whatsapp', label: 'WhatsApp' }].map((c) => (
                  <button key={c.id} type="button" onClick={() => setChannel(c.id)}
                    data-testid={`forgot-channel-${c.id}`}
                    className={`py-3 rounded-xl font-bold text-sm transition ${
                      channel === c.id ? 'bg-[#FF5C00] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{err}</p>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} disabled={loading}
                className="flex-1 py-2.5 rounded-lg bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm">
                Annuleren
              </button>
              <button type="submit" disabled={loading || !email}
                data-testid="forgot-send-btn"
                className="flex-[2] py-2.5 rounded-lg bg-[#FF5C00] text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Verstuur code
              </button>
            </div>
          </form>
        )}

        {stage === 'verify' && (
          <form onSubmit={submitReset} className="p-6 space-y-4">
            {info && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{info}</p>}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Herstelcode (6 cijfers)</label>
              <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required data-testid="forgot-code"
                className="w-full h-14 text-center text-2xl font-mono tracking-[0.5em] px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Nieuw wachtwoord</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  required minLength={6} data-testid="forgot-new-password"
                  className="w-full h-12 text-base px-4 pr-11 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{err}</p>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setStage('request')} disabled={loading}
                className="flex-1 py-2.5 rounded-lg bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm">
                Terug
              </button>
              <button type="submit" disabled={loading || code.length !== 6 || newPassword.length < 6}
                data-testid="forgot-reset-btn"
                className="flex-[2] py-2.5 rounded-lg bg-[#FF5C00] text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Reset wachtwoord
              </button>
            </div>
          </form>
        )}

        {stage === 'done' && (
          <div className="p-6 text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-emerald-500" />
            </div>
            <p className="text-base font-bold text-slate-900">Wachtwoord gewijzigd</p>
            <p className="text-sm text-slate-500">Je kunt nu inloggen met je nieuwe wachtwoord.</p>
            <button onClick={onClose} data-testid="forgot-done-close"
              className="w-full py-2.5 rounded-lg bg-[#FF5C00] text-white font-bold text-sm">
              Sluiten
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


export default ForgotPasswordModal;
