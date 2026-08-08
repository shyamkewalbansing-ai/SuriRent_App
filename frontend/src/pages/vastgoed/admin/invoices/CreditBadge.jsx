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
// =====================================================================
export default function CreditBadge({ credits, variant = 'default', testid }) {
  if (!credits || typeof credits !== 'object') return null;
  const entries = Object.entries(credits).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) return null;

  const compact = variant === 'compact';
  return (
    <span
      data-testid={testid}
      title={entries.map(([c, v]) => `${fmtMoney(v, c)} tegoed (vooruitbetaald)`).join(' · ')}
      className={`inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-black ${
        compact ? 'px-1.5 py-0.5 text-[9px] tracking-wider' : 'px-2 py-0.5 text-[10px] sm:text-[11px]'
      }`}
    >
      <PiggyBank className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} strokeWidth={2.5} />
      {entries.map(([currency, value]) => (
        <span key={currency}>{currency} {Number(value).toLocaleString('nl-NL', { maximumFractionDigits: 0 })} tegoed</span>
      ))}
    </span>
  );
}
