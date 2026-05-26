// Bell-badge in de admin header die toont hoeveel betalingen wachten op
// beheerder-goedkeuring. Klik → scrollt naar /admin/payments waar de
// "Wacht op goedkeuring" sectie bovenaan staat.
import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { useBrandedNavigate } from '../lib/branded-nav';

export default function PendingApprovalBell() {
  const navigate = useBrandedNavigate();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get('/payments/pending-count');
        if (!cancelled) setCount(data?.count || 0);
      } catch { /* stilzwijgend */ }
    };
    load();
    const id = setInterval(load, 30000); // refresh elke 30s
    // Ook on focus refreshen zodat na approval het direct klopt.
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    // Wanneer de service worker een push notificatie ontvangt en de badge
    // bijwerkt, dan triggeren we ook direct een count-refresh — dit geeft
    // de admin een instant update zonder te wachten op de 30s poll.
    const onSwMsg = (ev) => {
      if (ev?.data?.type === 'BADGE_CHANGED') load();
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMsg);
    }
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMsg);
      }
    };
  }, []);

  if (count === 0) return null;
  return (
    <button onClick={() => navigate('/admin/payments')}
      data-testid="pending-approval-bell"
      className="relative w-12 h-12 md:w-14 md:h-14 landscape:w-10 landscape:h-10 rounded-2xl landscape:rounded-xl flex items-center justify-center transition active:scale-95 bg-amber-50 text-amber-700 hover:bg-amber-100 shadow-[0_4px_12px_-4px_rgba(245,158,11,0.35)]"
      title={`${count} betaling(en) wachten op goedkeuring`}>
      <ShieldAlert className="w-6 h-6 md:w-7 md:h-7 landscape:w-5 landscape:h-5" strokeWidth={2.4} />
      <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-[#F7F8FA]"
        data-testid="pending-approval-count">
        {count > 9 ? '9+' : count}
      </span>
      <span className="absolute -top-1 -right-1 w-[20px] h-[20px] rounded-full bg-amber-400 opacity-60 animate-ping" />
    </button>
  );
}
