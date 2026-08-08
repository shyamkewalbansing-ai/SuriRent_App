// Pure helpers voor de Facturen-sectie. Geen React, geen side-effects — 100%
// re-usable en makkelijk te testen.
import { fmtMoney } from '../../../../lib/api';

export const ORANGE = '#FF5C00';

// Een 'partial' factuur is deels betaald maar nog NIET volledig voldaan,
// dus telt hij mee als openstaand in álle overzichten (KPI's, buckets,
// herinneringen). Alleen `status === 'paid'` betekent volledig betaald.
export const UNPAID = ['open', 'sent', 'pending', 'overdue', 'partial'];
export const isUnpaid = (inv) => UNPAID.includes((inv.status || '').toLowerCase());

export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return { bg: `hsl(${h}, 65%, 92%)`, fg: `hsl(${h}, 45%, 35%)` };
}

// Toon alleen het getal (currency wordt los gerenderd).
export function fmtAmount(value, currency) {
  return fmtMoney(value, currency).replace(currency, '').trim();
}

// Variant zonder cent-decimalen voor compacte weergaves (POS-stijl op mobile).
export function fmtAmountWhole(value) {
  return Number(value || 0).toLocaleString('nl-NL', { maximumFractionDigits: 0 });
}

// Groepeert facturen per huurder en berekent buckets + severity per groep.
// Bucket-classificatie komt RECHTSTREEKS van de backend (`inv.bucket`):
//   "overdue"  → Achterstallige huur (vervaltermijn + grace verstreken)
//   "current"  → Openstaande huidige maand (binnen grace-window)
//   "future"   → Vooruit gefactureerd
// Fallback (oude clients zonder backend-bucket): periode < huidige maand
//   = overdue, == huidige = current, > huidige = future.
export function groupByTenant(invoices, MONTHS_NL) {
  const map = new Map();
  for (const inv of invoices) {
    const key = inv.tenant_id;
    if (!map.has(key)) {
      map.set(key, {
        tenant_id: inv.tenant_id,
        tenant_name: inv.tenant_name || 'Onbekend',
        apartment_number: inv.apartment_number,
        location_name: inv.location_name,
        currency: inv.currency,
        all: [], open: [],
      });
    }
    const g = map.get(key);
    g.all.push(inv);
    if (isUnpaid(inv)) g.open.push(inv);
    if (inv.apartment_number) g.apartment_number = inv.apartment_number;
    if (inv.location_name) g.location_name = inv.location_name;
  }
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const fallbackBucket = (inv) => {
    if (inv.period_year > curY || (inv.period_year === curY && inv.period_month > curM)) return 'future';
    if (inv.period_year === curY && inv.period_month === curM) return 'current';
    return 'overdue';
  };
  const bucketOf = (inv) => inv.bucket || fallbackBucket(inv);
  for (const g of map.values()) {
    g.open.sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month));
    g.all.sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month));
    g.overdue = g.open.filter((i) => bucketOf(i) === 'overdue');
    g.current = g.open.filter((i) => bucketOf(i) === 'current');
    g.upcoming = g.open.filter((i) => bucketOf(i) === 'future');
    g.openCount = g.open.length;
    g.overdueCount = g.overdue.length;
    g.currentCount = g.current.length;
    g.upcomingCount = g.upcoming.length;
    const sumOf = (arr) => arr.reduce((s, i) => s + Number(i.remaining_amount != null ? i.remaining_amount : i.amount || 0), 0);
    g.totalOpen = sumOf(g.open);
    g.totalOverdue = sumOf(g.overdue);
    g.totalCurrent = sumOf(g.current);
    g.totalUpcoming = sumOf(g.upcoming);
    // "Echt openstaand" = achterstand + huidige maand. Vooruit gefactureerd
    // is toekomst en hoort NIET in dit bedrag of in de telling.
    g.totalDue = g.totalOverdue + g.totalCurrent;
    g.dueCount = g.overdueCount + g.currentCount;
    g.dueMonths = [...g.overdue, ...g.current]
      .sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month));
    g.lastDue = g.dueMonths[g.dueMonths.length - 1];
    // Severity baseert op échte achterstand. Huidige maand telt NIET als
    // achterstand zolang de grace-window niet verstreken is.
    g.severity = g.overdueCount >= 2 ? 'critical' : g.overdueCount === 1 ? 'late' : 'ok';
    g.lastOpen = g.open[g.open.length - 1];
    g.lastOverdue = g.overdue[g.overdue.length - 1];
    if (MONTHS_NL) {
      g.periodLabel = g.overdue
        .map((i) => `${MONTHS_NL[i.period_month - 1]}`)
        .join(', ');
      if (g.overdue.length > 0) {
        const lastYear = g.overdue[g.overdue.length - 1].period_year;
        g.periodLabel += ` ${lastYear}`;
      }
    }
  }
  return [...map.values()];
}
