import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, Loader2, Check, AlertTriangle, Send, Shield, FileText, RotateCw, Smartphone, Trash2, Volume2, VolumeX } from 'lucide-react';
import { api, formatError } from '../../../lib/api';
import { useBadge } from '../../../lib/pwa';
import { playPendingApprovalDing } from '../../../lib/notify-sound';
import { isTapSoundsEnabled, setTapSoundsEnabled, playClickTick } from '../../../lib/tap-sounds';
import { playSuccessPing, playErrorBuzz, playSwoosh, playApproveConfirm } from '../../../lib/tap-sounds';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

export default function Notifications() {
  const { clearBadge } = useBadge();
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState('default');
  const [subscribed, setSubscribed] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [vapidKey, setVapidKey] = useState('');
  const [devices, setDevices] = useState([]);
  const [currentEndpoint, setCurrentEndpoint] = useState('');
  // Tik-geluiden zijn een client-side voorkeur, geen server-state.
  const [tapOn, setTapOn] = useState(() => isTapSoundsEnabled());
  const toggleTaps = () => {
    const next = !tapOn;
    setTapSoundsEnabled(next);
    setTapOn(next);
    if (next) playClickTick();
  };

  // Bij openen van de pagina: clear de app-icon badge — gebruiker heeft
  // alles gezien.
  useEffect(() => { clearBadge(); }, [clearBadge]);

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/push/status');
      setDeviceCount(data.devices || 0);
    } catch { /* noop */ }
    try {
      const { data } = await api.get('/push/devices');
      setDevices(Array.isArray(data) ? data : []);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setSupported(false);
      return;
    }
    setPermission(Notification.permission);
    api.get('/push/vapid-public-key').then((r) => setVapidKey(r.data?.public_key || '')).catch(() => {});
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
      setCurrentEndpoint(sub?.endpoint || '');
    }).catch(() => {});
    refreshStatus();
  }, [refreshStatus]);

  // Doe de echte subscribe + opslaan naar backend. Wordt zowel gebruikt
  // voor "Activeer" als voor "Opnieuw registreren".
  const doSubscribe = async (force = false) => {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
    // Wacht tot SW echt active is (ready) — anders mislukt subscribe op iOS soms
    await navigator.serviceWorker.ready;

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== 'granted') {
      throw new Error('Toestemming geweigerd. Sta meldingen toe in browserinstellingen.');
    }

    let sub = await reg.pushManager.getSubscription();
    if (sub && force) {
      // Forceer een nieuwe subscription (handig bij "Opnieuw registreren")
      try { await sub.unsubscribe(); } catch { /* noop */ }
      sub = null;
    }
    if (!sub) {
      if (!vapidKey) throw new Error('VAPID public key ontbreekt — kan niet abonneren');
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    const subJson = sub.toJSON();
    await api.post('/push/subscribe', {
      endpoint: subJson.endpoint,
      keys: subJson.keys,
      // user_agent sturen we mee zodat we in /push/devices kunnen tonen
      // welk apparaat ("iPhone · Safari", "Windows · Chrome") gekoppeld is.
      user_agent: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
    });
    setCurrentEndpoint(subJson.endpoint || '');
    return sub;
  };

  const enable = async () => {
    setLoading(true); setError(''); setMsg('');
    try {
      await doSubscribe(false);
      setSubscribed(true);
      setMsg('Push notificaties ingeschakeld op dit apparaat');
      await refreshStatus();
    } catch (e) {
      setError(e.message || formatError(e, 'Push activeren mislukt'));
    } finally { setLoading(false); }
  };

  const reRegister = async () => {
    setLoading(true); setError(''); setMsg('');
    try {
      await doSubscribe(true);
      setSubscribed(true);
      setMsg('Apparaat opnieuw geregistreerd!');
      await refreshStatus();
    } catch (e) {
      setError(e.message || formatError(e));
    } finally { setLoading(false); }
  };

  const disable = async () => {
    setLoading(true); setError(''); setMsg('');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
      }
      setSubscribed(false);
      setMsg('Push notificaties uitgeschakeld');
      await refreshStatus();
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  const test = async () => {
    setLoading(true); setError(''); setMsg('');
    try {
      const { data } = await api.post('/push/test', { title: 'SuriRent test', body: 'Werkt het? Mooi zo!' });
      if (data.sent === 0) {
        setError(`Verzonden naar 0 apparaten. ${data.failed > 0 ? `${data.failed} verlopen subscription(s) opgeschoond. ` : ''}Klik op "Opnieuw registreren" hieronder om dit apparaat opnieuw te koppelen.`);
        await refreshStatus();
      } else {
        setMsg(`Test verzonden naar ${data.sent} apparaat${data.sent !== 1 ? 'en' : ''}!`);
      }
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  const notifyOverdue = async () => {
    setLoading(true); setError(''); setMsg('');
    try {
      const { data } = await api.post('/push/notify-overdue');
      setMsg(`${data.message} (verstuurd naar ${data.sent} apparaten)`);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  // Verwijder een specifiek apparaat uit de gekoppelde push-devices.
  // Wanneer de admin het HUIDIGE apparaat verwijdert moeten we óók de
  // browser-subscription cleanen, anders denkt de browser nog dat hij
  // geabonneerd is en zal /push/subscribe niet opnieuw worden geactiveerd
  // tot reRegister wordt gebruikt.
  const removeDevice = async (dev) => {
    if (!dev?.id) return;
    if (!window.confirm(`Apparaat "${dev.label}" verwijderen? Het ontvangt geen meldingen meer.`)) return;
    setLoading(true); setError(''); setMsg('');
    try {
      await api.delete(`/push/devices/${dev.id}`);
      // Is dit het huidige apparaat? Dan ook lokaal unsubscriben.
      if (dev.endpoint && dev.endpoint === currentEndpoint) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = reg && (await reg.pushManager.getSubscription());
          if (sub) await sub.unsubscribe();
        } catch { /* ignore */ }
        setSubscribed(false);
        setCurrentEndpoint('');
      }
      setMsg(`"${dev.label}" verwijderd.`);
      await refreshStatus();
    } catch (e) { setError(formatError(e, 'Verwijderen mislukt')); }
    finally { setLoading(false); }
  };

  return (
    <div data-testid="notifications-page">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Notificaties & Beveiliging</h1>
        <p className="text-sm text-slate-500 mt-1">PWA push notificaties met geluid + beveiligde PDFs</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-orange-100 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${subscribed ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
              {subscribed ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Dit apparaat</p>
              <p className="font-black text-slate-900">{subscribed ? 'Ingeschakeld' : 'Uitgeschakeld'}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">Status van de browser/PWA op dit toestel.</p>
        </div>

        <div className="bg-white border border-orange-100 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#FF5C00] flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Apparaten</p>
              <p className="font-black text-slate-900" data-testid="device-count">{deviceCount}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">Totaal aantal apparaten geregistreerd op dit account.</p>
        </div>

        <div className="bg-white border border-orange-100 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#FF5C00] flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Beveiligde PDFs</p>
              <p className="font-black text-slate-900">AES-256 + QR</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">Kwitanties met digitale handtekening.</p>
        </div>
      </div>

      {!supported ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            Push notificaties worden niet ondersteund in deze browser. Probeer Chrome, Edge of Firefox op desktop,
            of installeer de PWA via &quot;Voeg toe aan beginscherm&quot; op iOS Safari (Push werkt vanaf iOS 16.4+).
          </div>
        </div>
      ) : (
        <>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm" data-testid="notify-error">{error}</div>}
          {msg && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm flex items-center gap-2" data-testid="notify-success"><Check className="w-4 h-4 shrink-0" />{msg}</div>}

          <div className="bg-white border border-orange-100 rounded-2xl p-6">
            <h3 className="font-black text-slate-900 mb-1">Push notificaties</h3>
            <p className="text-sm text-slate-500 mb-4">
              Schakel meldingen in om herinneringen te ontvangen voor openstaande huur en belangrijke updates.
              Klik op een melding om direct naar de juiste pagina te springen.
            </p>
            <div className="flex flex-wrap gap-2">
              {!subscribed ? (
                <button onClick={enable} disabled={loading || !vapidKey} data-testid="push-enable"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)] disabled:opacity-50">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                  Activeer notificaties
                </button>
              ) : (
                <>
                  <button onClick={test} disabled={loading} data-testid="push-test"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl disabled:opacity-50">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Test push
                  </button>
                  <button onClick={notifyOverdue} disabled={loading} data-testid="push-overdue"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl disabled:opacity-50">
                    <AlertTriangle className="w-4 h-4" />
                    Overdue overzicht
                  </button>
                  <button onClick={() => playPendingApprovalDing()} data-testid="ding-test"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 text-emerald-700 font-bold rounded-xl">
                    <Volume2 className="w-4 h-4" />
                    Test geluid
                  </button>
                  <button onClick={reRegister} disabled={loading} data-testid="push-reregister"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 text-blue-700 font-bold rounded-xl disabled:opacity-50">
                    <RotateCw className="w-4 h-4" />
                    Opnieuw registreren
                  </button>
                  <button onClick={disable} disabled={loading} data-testid="push-disable"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl disabled:opacity-50">
                    <BellOff className="w-4 h-4" />
                    Uitschakelen
                  </button>
                </>
              )}
            </div>
            {permission === 'denied' && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                Browser meldingen zijn geblokkeerd. Klik op het slot-icoon links in de adresbalk en sta meldingen toe.
              </p>
            )}
            {subscribed && deviceCount === 0 && (
              <p className="mt-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2">
                Browser zegt dat dit apparaat geabonneerd is, maar de server heeft de registratie niet.
                Klik op <b>Opnieuw registreren</b> om het te herstellen.
              </p>
            )}
          </div>

          <div className="mt-4 bg-white border border-orange-100 rounded-2xl p-6" data-testid="tap-sounds-section">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tapOn ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                {tapOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-slate-900">Tik-geluiden</h3>
                <p className="text-xs text-slate-500">
                  Kort tik-geluid bij elke knop + toets. Werkt op telefoon (PWA) en desktop.
                </p>
              </div>
              <button onClick={toggleTaps} data-testid="tap-sounds-toggle"
                role="switch" aria-checked={tapOn}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${
                  tapOn ? 'bg-emerald-500' : 'bg-slate-300'
                }`}>
                <span className={`inline-block h-5 w-5 bg-white rounded-full shadow transform transition ${
                  tapOn ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1 ml-13">
              {tapOn
                ? 'Aan — tik op een knop hierboven om te horen.'
                : 'Uit — de app is volledig stil bij klikken.'}
            </p>
            {tapOn && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Geluiden voorbeluisteren
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={playClickTick} data-testid="sound-test-click"
                    className="px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
                    Tik (knop)
                  </button>
                  <button onClick={playSwoosh} data-testid="sound-test-swoosh"
                    className="px-3 py-2 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg text-xs font-bold text-sky-700">
                    Swoosh (sheet)
                  </button>
                  <button onClick={playSuccessPing} data-testid="sound-test-success"
                    className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-700">
                    Succes-ping
                  </button>
                  <button onClick={playApproveConfirm} data-testid="sound-test-approve"
                    className="px-3 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg text-xs font-bold text-orange-700">
                    Goedkeuring
                  </button>
                  <button onClick={playErrorBuzz} data-testid="sound-test-error"
                    className="px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-bold text-red-700">
                    Fout-buzz
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 bg-white border border-orange-100 rounded-2xl p-6" data-testid="devices-section">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-[#FF5C00]" />
                <h3 className="font-black text-slate-900">Gekoppelde apparaten</h3>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full" data-testid="devices-list-count">
                {devices.length}
              </span>
            </div>
            {devices.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nog geen apparaten gekoppeld. Klik op <b>Activeer notificaties</b> hierboven om dit apparaat te koppelen.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 -mx-2">
                {devices.map((d) => {
                  const isCurrent = d.endpoint && d.endpoint === currentEndpoint;
                  const addedAt = d.created_at ? new Date(d.created_at).toLocaleDateString('nl-NL', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  }) : '—';
                  return (
                    <li key={d.id} className="flex items-center gap-3 px-2 py-3" data-testid={`device-row-${d.id}`}>
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                        <Smartphone className="w-5 h-5 text-slate-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-900 text-sm truncate">{d.label}</p>
                          {isCurrent && (
                            <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                              Dit toestel
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">Gekoppeld op {addedAt}</p>
                      </div>
                      <button onClick={() => removeDevice(d)} disabled={loading}
                        data-testid={`device-delete-${d.id}`}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 font-bold rounded-lg text-xs disabled:opacity-50 min-h-[40px]">
                        <Trash2 className="w-3.5 h-3.5" /> Verwijder
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Verwijder een apparaat hier als je het niet meer gebruikt (oude telefoon, gedeeld toestel).
              Het ontvangt dan geen meldingen meer.
            </p>
          </div>

          <div className="mt-4 bg-white border border-orange-100 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-[#FF5C00]" />
              <h3 className="font-black text-slate-900">Beveiligde PDF download</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Vanuit Betalingen tab kun je een gewone PDF downloaden. Voor extra beveiliging is er ook een{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded">/secure-pdf</code> endpoint met QR-verificatiestempel en optionele AES-256 versleuteling.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="font-bold uppercase tracking-widest text-slate-500 mb-1">Standaard PDF</p>
                <code className="text-slate-700">/api/payments/{'{id}'}/pdf</code>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 border border-orange-200">
                <p className="font-bold uppercase tracking-widest text-[#FF5C00] mb-1">Beveiligde PDF</p>
                <code className="text-slate-700">/api/payments/{'{id}'}/secure-pdf?encrypted=true</code>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Scan de QR-code op de beveiligde PDF om de echtheid online te verifiëren via <code>/api/verify/{'{token}'}</code>.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
