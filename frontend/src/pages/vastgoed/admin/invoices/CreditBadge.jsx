import { PiggyBank } from 'lucide-react';
import { fmtMoney } from '../../../../lib/api';

// =====================================================================
// CreditBadge — compacte "SRD X tegoed" badge naast huurder-naam wanneer
// een positief saldo (nog niet verrekend krediet/vooruitbetaling) bestaat.
//
// `credits` verwacht: { SRD?: number, USD?: number, EUR?: number } — de
// key-value-map die het backend `/api/tenants/credits` endpoint retourneert
// voor deze ene huurder. Renders NULL wanneer geen enkele valuta > 0 is.
//
// `variant`: 'default' | 'compact' — compact voor mobiele huurder-cards.
// `onClick`: optioneel — wanneer meegegeven wordt de badge klikbaar (met
//    stopPropagation zodat de klik niet doorlekt naar een parent-button in
//    een tenant-row). Renders als `<span role="button" tabIndex="0">` zodat
//    het valide HTML blijft binnen een parent `<button>`.
// =====================================================================
export default function CreditBadge({ credits, variant = 'default', onClick, testid }) {
  if (!credits || typeof credits !== 'object') return null;
  const entries = Object.entries(credits).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) return null;

  const compact = variant === 'compact';
  const clickable = typeof onClick === 'function';

  const handleClick = clickable
    ? (e) => { e.stopPropagation(); e.preventDefault(); onClick(e); }
    : undefined;
  const handleKey = clickable
    ? (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.stopPropagation(); e.preventDefault(); onClick(e);
      }
    }
    : undefined;

  const label = entries
    .map(([currency, value]) => `${currency} ${Number(value).toLocaleString('nl-NL', { maximumFractionDigits: 0 })} tegoed`)
    .join(' + ');
  const title = clickable
    ? `${entries.map(([c, v]) => fmtMoney(v, c)).join(' + ')} tegoed — klik voor bron`
    : entries.map(([c, v]) => `${fmtMoney(v, c)} tegoed (vooruitbetaald)`).join(' · ');

  return (
    <span
      data-testid={testid}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKey}
      title={title}
      className={`inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-black transition ${
        compact ? 'px-1.5 py-0.5 text-[9px] tracking-wider' : 'px-2 py-0.5 text-[10px] sm:text-[11px]'
      } ${clickable ? 'hover:bg-emerald-100 hover:border-emerald-300 cursor-pointer active:scale-95' : ''}`}
    >
      <PiggyBank className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} strokeWidth={2.5} />
      <span>{label}</span>
    </span>
  );
}
