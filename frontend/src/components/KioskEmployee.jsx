// Kiosk-medewerker sessie helpers — gebruikt sessionStorage zodat
// een receptie-medewerker één keer z'n PIN intikt bij start van de
// dienst en daarna alle betalingen automatisch worden gemarkeerd met
// `kiosk_employee_id` + `employee_pin` zodat ze in pending_approval gaan.
import { useEffect, useState } from 'react';
import { X, KeyRound, Loader2, UserCircle2, LogOut } from 'lucide-react';
import { api, formatError } from '../lib/api';

const SS_ID = 'kiosk_emp_id';
const SS_NAME = 'kiosk_emp_name';
const SS_PIN = 'kiosk_emp_pin';

export function getKioskEmployee() {
  try {
    const id = sessionStorage.getItem(SS_ID);
    const name = sessionStorage.getItem(SS_NAME);
    const pin = sessionStorage.getItem(SS_PIN);
    if (id && pin) return { id, name, pin };
  } catch { /* ignore */ }
  return null;
}

export function clearKioskEmployee() {
  try {
    sessionStorage.removeItem(SS_ID);
    sessionStorage.removeItem(SS_NAME);
    sessionStorage.removeItem(SS_PIN);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('kiosk-employee-changed'));
}

export function setKioskEmployee({ id, name, pin }) {
  try {
    sessionStorage.setItem(SS_ID, id);
    sessionStorage.setItem(SS_NAME, name || '');
    sessionStorage.setItem(SS_PIN, pin);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('kiosk-employee-changed'));
}

// Voeg employee_id+pin toe aan een /kiosk/payments POST payload zodat
// het backend de betaling in pending_approval zet.
export function withKioskEmployee(url) {
  const emp = getKioskEmployee();
  if (!emp) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}employee_id=${encodeURIComponent(emp.id)}&employee_pin=${encodeURIComponent(emp.pin)}`;
}

// Banner die rechts in de kiosk-header staat. Toont "Medewerker: X" met
// uitlog-knop, of een grote "Inloggen" knop als er geen sessie is.
export function KioskEmployeeBar({ onLoginClick }) {
  const [emp, setEmp] = useState(getKioskEmployee());
  useEffect(() => {
    const refresh = () => setEmp(getKioskEmployee());
    window.addEventListener('kiosk-employee-changed', refresh);
    return () => window.removeEventListener('kiosk-employee-changed', refresh);
  }, []);
  if (!emp) {
    return (
      <button onClick={onLoginClick} data-testid="kiosk-emp-login-cta"
        className="inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-xs sm:text-sm transition active:scale-95">
        <KeyRound className="w-4 h-4" /> Medewerker login
      </button>
    );
  }
  return (
    <div className="inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-white border border-slate-200" data-testid="kiosk-emp-banner">
      <UserCircle2 className="w-4 h-4 text-emerald-600" />
      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate max-w-[160px]">{emp.name || 'Medewerker'}</span>
      <button onClick={clearKioskEmployee} data-testid="kiosk-emp-logout"
        title="Wissel medewerker"
        className="ml-1 w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center">
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// Sheet om PIN in te voeren. Werkt zowel als modal als gewone fixed UI.
export function KioskEmployeeLoginSheet({ onCancel, onSuccess }) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (raw) => {
    const p = (raw ?? pin).trim();
    if (!/^\d{4,6}$/.test(p)) { setErr('PIN moet 4-6 cijfers zijn'); return; }
    setLoading(true); setErr('');
    try {
      const { data } = await api.post('/kiosk/employee-verify', { pin: p });
      setKioskEmployee({ id: data.employee_id, name: data.employee_name, pin: p });
      onSuccess?.(data);
    } catch (e) { setErr(formatError(e) || 'Ongeldige PIN'); setPin(''); }
    finally { setLoading(false); }
  };

  // Auto-submit zodra 4 cijfers zijn ingevoerd — receptie-medewerkers
  // hoeven dan geen extra knop in te drukken.
  useEffect(() => {
    if (pin.length === 4 && !loading) { submit(pin); }
  // submit is een gewone functie binnen de component scope; opnemen
  // in de deps array zou een loop veroorzaken. We willen alleen op
  // pin-changes triggeren.
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (d) => setPin((p) => (p.length < 6 ? p + d : p));
  const back = () => setPin((p) => p.slice(0, -1));

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      data-testid="kiosk-emp-login-sheet" onClick={onCancel}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl pt-3 pb-6 px-5 sm:p-8 animate-slide-up-sheet sm:animate-slide-up"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 24px), 24px)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="sm:hidden flex justify-center mb-3">
          <span className="w-10 h-1.5 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-amber-700" />
            </div>
            <h3 className="text-lg font-black text-slate-900">Medewerker PIN</h3>
          </div>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Voer uw 4-cijferige PIN in. Uw betalingen worden ter goedkeuring naar de beheerder gestuurd.
        </p>
        {/* PIN dots */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} data-testid={`kiosk-emp-pin-dot-${i}`}
              className={`w-3.5 h-3.5 rounded-full transition ${pin.length > i ? 'bg-amber-500' : 'bg-slate-200'}`} />
          ))}
        </div>
        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} onClick={() => tap(String(n))} data-testid={`kiosk-emp-key-${n}`}
              className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-900 text-2xl font-black active:scale-95 transition">
              {n}
            </button>
          ))}
          <div />
          <button onClick={() => tap('0')} data-testid="kiosk-emp-key-0"
            className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-900 text-2xl font-black active:scale-95 transition">0</button>
          <button onClick={back} data-testid="kiosk-emp-key-back"
            className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-500 active:scale-95 transition flex items-center justify-center">
            ⌫
          </button>
        </div>
        {loading && <div className="mt-4 flex items-center justify-center gap-2 text-amber-700 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Verifiëren…
        </div>}
        {err && <div className="mt-3 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm text-center">{err}</div>}
      </div>
    </div>
  );
}
