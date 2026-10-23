import { addAmounts, compareAmounts, percentageOf, subtractAmounts } from '../domain/amounts.js';
import { formatShortDate } from './format.js';

// Exact amount × whole number (percentageOf divides by 100).
const times = (amount, count) => percentageOf(amount, count * 100);
const leap = year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
export const daysInMonth = ({ year, month }) => [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
const monthKey = ({ year, month }) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;

/**
 * Cumulative GV spending of one month, day by day, for 'salud', 'ocio' or 'all'.
 * actual(d) = exact sum of the expenses dated up to day d; ideal(d) = allocation × d / days
 * (drawn by the chart). Past months use the last day and a future month has no
 * actual line. In the current month (today in Lima, 'YYYY-MM-DD') the line stops at
 * today; expenses dated later are `scheduled` (drawn apart, from today on) and
 * still count: `actual` = actual(today) + scheduled, like the cards and the total.
 */
export function cumulativeVariableSeries(summary, period, categoryId = 'all', today) {
  const days = daysInMonth(period);
  const key = monthKey(period);
  const timing = key < today.slice(0, 7) ? 'past' : key === today.slice(0, 7) ? 'current' : 'future';
  const referenceDay = timing === 'past' ? days : timing === 'current' ? Number(today.slice(8, 10)) : 0;
  const distribution = summary.calculation.status === 'calculated' ? summary.calculation.distribution : null;
  const allocation = !distribution ? null : categoryId === 'all' ? distribution.variable.total : distribution.variable.categories[categoryId];
  const daily = new Map();
  for (const record of summary.variable) {
    if (categoryId !== 'all' && record.categoryId !== categoryId) continue;
    const day = Number(record.effectiveDate.slice(8, 10));
    daily.set(day, addAmounts(daily.get(day) ?? '0', record.amount));
  }
  let running = '0';
  const points = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    running = addAmounts(running, daily.get(day) ?? '0');
    return { day, actual: day <= referenceDay ? running : null };
  });
  const upToToday = referenceDay ? points[referenceDay - 1].actual : '0';
  let scheduled = '0';
  const later = [];
  if (timing === 'current') {
    for (let day = referenceDay + 1; day <= days; day++) {
      if (!daily.has(day)) continue;
      scheduled = addAmounts(scheduled, daily.get(day));
      later.push({ day, actual: addAmounts(upToToday, scheduled) });
    }
  }
  return { days, timing, referenceDay, allocation, actual: addAmounts(upToToday, scheduled), upToToday, scheduled, later, points };
}

// Half-up division of a non-negative exact amount by a whole number, to whole soles.
function roundedQuotient(amount, divisor) {
  const [whole, fraction = ''] = amount.split('.');
  const coefficient = BigInt(whole + fraction);
  const denominator = 10n ** BigInt(fraction.length) * BigInt(divisor);
  return ((2n * coefficient + denominator) / (2n * denominator)).toString();
}

/**
 * A finished month is final: actual − allocation, exact, without tolerance, so it
 * agrees with usageStatus on the cards. status: above | below | equal.
 *
 * The current month compares with the ideal line at today t, exactly:
 * gap × days = actual × days − allocation × t. Within tolerance when
 * |gap| < max(S/ 5, 5 % of the allocation). The amount is |gap| rounded half-up
 * to whole soles, for display only. status: above | below | on
 * (also future | no-allocation).
 */
export function variablePace(series) {
  if (series.allocation === null) return { status: 'no-allocation' };
  if (series.timing === 'future') return { status: 'future', allocation: series.allocation, days: series.days };
  if (series.timing === 'past') {
    const comparison = compareAmounts(series.actual, series.allocation);
    if (comparison === 0) return { status: 'equal', timing: 'past', amount: '0' };
    return { status: comparison > 0 ? 'above' : 'below', timing: 'past',
      amount: comparison > 0 ? subtractAmounts(series.actual, series.allocation) : subtractAmounts(series.allocation, series.actual) };
  }
  const spent = times(series.actual, series.days);
  const ideal = times(series.allocation, series.referenceDay);
  const above = compareAmounts(spent, ideal) > 0;
  const gap = above ? subtractAmounts(spent, ideal) : subtractAmounts(ideal, spent);
  const fivePercent = percentageOf(series.allocation, 5);
  const tolerance = compareAmounts(fivePercent, '5') > 0 ? fivePercent : '5';
  const within = compareAmounts(gap, times(tolerance, series.days)) < 0;
  return { status: within ? 'on' : above ? 'above' : 'below', timing: series.timing, amount: roundedQuotient(gap, series.days) };
}

const soles = value => `S/ ${value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
export function pacePhrase(pace, formatAmount) {
  if (pace.status === 'no-allocation') return null;
  if (pace.status === 'future') return `Este mes aún no empieza: tendrás ${formatAmount(pace.allocation)} para ${pace.days} días.`;
  const side = pace.status === 'above' ? 'por encima' : 'por debajo';
  if (pace.timing === 'past') {
    return pace.status === 'equal' ? 'Terminaste el mes justo en lo asignado.' : `Terminaste el mes ${formatAmount(pace.amount)} ${side} de lo asignado.`;
  }
  return pace.status === 'on' ? 'Vas al ritmo.' : `Vas unos ${soles(pace.amount)} ${side} del ritmo ideal.`;
}

/** Up to n subcategories with the most spending in a category, exact sums. */
export function topSubcategories(records, categoryId, count = 3) {
  const totals = new Map();
  for (const record of records) {
    const name = record.subcategory?.trim();
    if (record.categoryId !== categoryId || !name) continue;
    totals.set(name, addAmounts(totals.get(name) ?? '0', record.amount));
  }
  return [...totals].map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => compareAmounts(b.amount, a.amount) || a.name.localeCompare(b.name, 'es')).slice(0, count);
}

const shiftDay = (date, step) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + step);
  return value.toISOString().slice(0, 10);
};

/** Expenses by day, newest first, headed "Hoy", "Ayer" or a short date. */
export function groupByDay(records, today) {
  const sorted = [...records].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || a.id.localeCompare(b.id));
  const yesterday = shiftDay(today, -1);
  const groups = [];
  for (const record of sorted) {
    const date = record.effectiveDate;
    if (groups.at(-1)?.date !== date) {
      groups.push({ date, label: date === today ? 'Hoy' : date === yesterday ? 'Ayer' : formatShortDate(date), records: [] });
    }
    groups.at(-1).records.push(record);
  }
  return groups;
}
