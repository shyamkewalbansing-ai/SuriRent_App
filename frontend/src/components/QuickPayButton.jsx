import { Zap } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * QuickPayButton — snel-actie icoon in de admin top bar dat de
 * "Nieuwe betaling" form direct opent (via een global event), ongeacht
 * op welke admin-tab je staat. Wanneer de gebruiker niet op /admin/payments
 * is, navigeren we daar eerst heen en openen het event nadien.
 */
export default function QuickPayButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const onClick = () => {
    const dispatch = () => {
      try { window.dispatchEvent(new CustomEvent('quick-pay-open')); } catch { /* noop */ }
    };
    if (location.pathname === '/admin/payments') {
      dispatch();
    } else {
      try { window.dispatchEvent(new CustomEvent('go-tab', { detail: 'payments' })); } catch { /* noop */ }
      navigate('/admin/payments');
      // Wacht heel kort tot Payments.jsx mount, dan event triggeren.
      setTimeout(dispatch, 200);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="quick-pay-btn"
      aria-label="Registreer nieuwe betaling"
      title="Registreer nieuwe betaling"
      className="relative w-11 h-11 landscape:w-9 landscape:h-9 rounded-2xl landscape:rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_8px_18px_-6px_rgba(16,185,129,0.55)] active:scale-95 transition hover:from-emerald-500 hover:to-emerald-700"
    >
      <Zap className="w-5 h-5 landscape:w-4 landscape:h-4" strokeWidth={2.4} fill="currentColor" />
    </button>
  );
}
