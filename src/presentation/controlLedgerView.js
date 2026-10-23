import { addAmounts, compareAmounts, subtractAmounts } from '../domain/amounts.js';
import { periodKey } from '../domain/fiorellaSession.js';
import { isValidDate, isValidPeriod } from '../domain/models.js';

// Read-only views of the Control ledger. Only reviewed movements count (manual
// "reviewed" or imported "imported" with nothing left to review); pending ones
// are counted apart. Currencies are never mixed nor converted.
export const counts = entry => (entry.status === 'reviewed' || entry.status === 'imported') && !entry.pendingReasons?.length && !entry.errors?.length;
const sum = values => values.reduce(addAmounts, '0');
const monthOfDate = date => isValidDate(date) ? { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) } : null;
/** The month a movement belongs to: its period, else the month of its date. */
export const movementMonth = record => isValidPeriod(record.period) ? record.period : monthOfDate(record.effectiveDate);
const isSavingsDeposit = record => record.kind === 'deposit' && record.purpose === 'savings';
const signed = (plus, minus) => {
  const comparison = compareAmounts(plus, minus);
  return comparison >= 0 ? { negative: false, amount: subtractAmounts(plus, minus) } : { negative: true, amount: subtractAmounts(minus, plus) };
};

/**
 * Savings balance of exactly one currency = savings deposits minus withdrawals.
 * The default PEN result and legacy USD-withdrawn note remain compatible.
 */
export function savingsBalance(entries, currency = 'PEN') {
  const counted = entries.filter(counts).map(entry => entry.record);
  const deposits = sum(counted.filter(record => isSavingsDeposit(record) && record.currency === currency).map(record => record.amount));
  const withdrawals = sum(counted.filter(record => record.kind === 'withdrawal' && record.currency === currency).map(record => record.amount));
  const usd = counted.filter(record => record.kind === 'withdrawal' && record.currency === 'USD').map(record => record.amount);
  return { ...signed(deposits, withdrawals), deposits, withdrawals, usdWithdrawn: usd.length ? sum(usd) : null,
    pending: entries.filter(entry => entry.status === 'pending').length };
}

const keyOf = period => periodKey(period);
const nextMonth = ({ year, month }) => month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

/** Control comparison only: the usual original plan period for a receipt month. */
export function previousPlanPeriod(receiptPeriod) {
  if (!isValidPeriod(receiptPeriod)) return null;
  const previous = receiptPeriod.month === 1
    ? { year: receiptPeriod.year - 1, month: 12 } : { year: receiptPeriod.year, month: receiptPeriod.month - 1 };
  return isValidPeriod(previous) ? previous : null;
}

/**
 * Monthly steps of one currency's savings balance, from its first counted movement to
 * the last one (or the selected month if later): each savings deposit raises it,
 * each withdrawal in that same currency lowers it. Other currencies cannot
 * move this series. Withdrawals are also listed as points.
 */
export function balanceSeries(entries, selected = null, currency = 'PEN') {
  const counted = entries.filter(counts).map(entry => entry.record).filter(record => movementMonth(record)
    && record.currency === currency && (isSavingsDeposit(record) || record.kind === 'withdrawal'));
  if (!counted.length) return { steps: [], withdrawals: [], usdWithdrawals: [] };
  const keys = counted.map(record => keyOf(movementMonth(record))).sort();
  let current = movementMonth(counted.find(record => keyOf(movementMonth(record)) === keys[0]));
  const last = [keys.at(-1), selected && isValidPeriod(selected) ? keyOf(selected) : null].filter(Boolean).sort().at(-1);
  const steps = [];
  let plus = '0'; let minus = '0';
  for (let guard = 0; keyOf(current) <= last && guard < 1200; guard++, current = nextMonth(current)) {
    const key = keyOf(current);
    const month = counted.filter(record => keyOf(movementMonth(record)) === key);
    const deposited = sum(month.filter(isSavingsDeposit).map(record => record.amount));
    const withdrawn = sum(month.filter(record => record.kind === 'withdrawal').map(record => record.amount));
    plus = addAmounts(plus, deposited); minus = addAmounts(minus, withdrawn);
    steps.push({ key, period: { ...current }, deposited, withdrawn, balance: signed(plus, minus) });
  }
  const point = record => ({ id: record.id, key: keyOf(movementMonth(record)), date: record.effectiveDate, amount: record.amount,
    currency: record.currency, description: record.description });
  const withdrawals = counted.filter(record => record.kind === 'withdrawal');
  return { steps, withdrawals: withdrawals.map(point), usdWithdrawals: currency === 'PEN'
    ? entries.filter(counts).map(entry => entry.record).filter(record => record.kind === 'withdrawal' && record.currency === 'USD' && movementMonth(record)).map(point) : [] };
}

/** Gross contributions: withdrawals never erase who deposited money. Each
 * running total belongs to exactly one person, currency and destination. */
export function contributionHistory(entries) {
  const groups = new Map();
  for (const { record } of entries.filter(counts)) {
    if (record.kind !== 'deposit' || !['milton', 'fiorella'].includes(record.contributorId)
      || !record.currency || !movementMonth(record)) continue;
    const key = [record.contributorId, record.currency, record.purpose].join(':');
    if (!groups.has(key)) groups.set(key, { key, contributorId: record.contributorId, currency: record.currency,
      purpose: record.purpose, total: '0', count: 0, months: new Map() });
    const group = groups.get(key);
    const period = movementMonth(record);
    const monthKey = keyOf(period);
    const month = group.months.get(monthKey) ?? { key: monthKey, period, amount: '0', count: 0 };
    month.amount = addAmounts(month.amount, record.amount); month.count += 1;
    group.months.set(monthKey, month);
    group.total = addAmounts(group.total, record.amount); group.count += 1;
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).map(group => {
    let cumulative = '0';
    const months = [...group.months.values()].sort((a, b) => a.key.localeCompare(b.key)).map(month => {
      cumulative = addAmounts(cumulative, month.amount);
      return { ...month, cumulative };
    }).reverse();
    return { ...group, months };
  });
}

/** Savings deposits assigned to a plan month (whenever they came in), PEN, counted only. */
export function coveredSavings(entries, period) {
  const assigned = entries.filter(counts).map(entry => entry.record)
    .filter(record => isSavingsDeposit(record) && record.currency === 'PEN' && record.planPeriod && keyOf(record.planPeriod) === keyOf(period));
  return assigned.length ? sum(assigned.map(record => record.amount)) : null;
}

/**
 * Semáforo of a plan month: Sin plan (no Fiorella distribution), Pendiente (no
 * deposit assigned), Completo (covered ≥ plan) or Parcial (0 < covered < plan).
 */
export function planLight(covered, plan) {
  if (plan == null) return { tone: 'neutral', light: 'gris', word: 'Sin plan' };
  if (covered == null) return { tone: 'neutral', light: 'gris', word: 'Pendiente' };
  return compareAmounts(covered, plan) >= 0 ? { tone: 'ok', light: 'verde', word: 'Completo' } : { tone: 'aviso', light: 'amarillo', word: 'Parcial' };
}

const byCurrency = records => {
  const totals = new Map();
  for (const record of records) totals.set(record.currency, addAmounts(totals.get(record.currency) ?? '0', record.amount));
  return [...totals].map(([currency, amount]) => ({ currency, amount }));
};

/**
 * Receipt-month rows, newest first. Movements keep their actual period. Only
 * the comparison uses the original plan for R - 1; coverage queries that exact
 * original period, including explicit assignments received in other months.
 * Plan values may carry { amount, projected }; legacy amount strings also work.
 */
export function monthlyRows(entries, plans = new Map()) {
  const counted = entries.filter(counts).map(entry => entry.record);
  const months = new Map();
  const addMonth = period => { if (isValidPeriod(period)) months.set(keyOf(period), period); };
  const addPlanReceipt = period => { if (isValidPeriod(period)) addMonth(nextMonth(period)); };
  for (const key of plans.keys()) addPlanReceipt({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });
  for (const record of counted) {
    addMonth(movementMonth(record));
    if (isSavingsDeposit(record)) addPlanReceipt(record.planPeriod);
  }
  return [...months.keys()].sort().reverse().map(key => {
    const inMonth = counted.filter(record => movementMonth(record) && keyOf(movementMonth(record)) === key);
    const expenses = inMonth.filter(record => record.kind === 'deposit' && record.purpose === 'expenses' && record.contributorId === 'milton');
    const savings = inMonth.filter(isSavingsDeposit);
    const referencePeriod = previousPlanPeriod(months.get(key));
    const reference = referencePeriod ? plans.get(keyOf(referencePeriod)) : null;
    const covered = referencePeriod ? coveredSavings(entries, referencePeriod) : null;
    const plan = typeof reference === 'string' ? reference : reference?.amount ?? null;
    return { key, period: months.get(key), referencePeriod, projected: reference?.projected === true,
      expenses: byCurrency(expenses), savings: byCurrency(savings), plan, covered,
      light: planLight(covered, plan), withdrawals: byCurrency(inMonth.filter(record => record.kind === 'withdrawal')) };
  });
}

const DOLLAR = /^\s*\$\s*(\d+(?:\.\d+)?)\s*$/;
const REASONS = {
  MISSING_CONTRIBUTOR: () => 'Falta quién aportó',
  ZERO_AMOUNT_POLICY_PENDING: () => 'El monto es 0',
  PERIOD_ASSIGNMENT_REVIEW_REQUIRED: () => 'El mes no coincide con la fecha',
  PERIOD_DATE_INCONSISTENCY: () => 'El mes y la fecha no son coherentes',
  ROUNDING_POLICY_PENDING: () => 'Tiene fracciones de céntimo',
  WITHDRAWAL_PURPOSE_POLICY_PENDING: () => 'Retiro para gastos: su tratamiento está pendiente',
  MISSING_WITHDRAWAL_DATE: () => 'Falta la fecha del retiro',
  UNRESOLVED_PURPOSE: () => 'Falta el destino',
  MISSING_PLAN_PERIOD: () => 'Falta el mes del plan',
};

// Workbook withdrawal dated with an Excel serial whose day and month could be
// swapped and that breaks the row order of its table: shown as a warning only.
function maybeInverted(record, entries) {
  const original = record.provenance?.original?.date;
  if (record.provenance?.type !== 'control-excel' || record.kind !== 'withdrawal' || !isValidDate(record.effectiveDate)
    || typeof original !== 'string' || !/^\d+$/.test(original)) return false;
  const day = Number(record.effectiveDate.slice(8)); const month = Number(record.effectiveDate.slice(5, 7));
  if (day > 12 || day === month) return false;
  const table = entries.map(entry => entry.record).filter(other => other.provenance?.type === 'control-excel' && other.kind === 'withdrawal'
    && other.provenance.sheet === record.provenance.sheet && isValidDate(other.effectiveDate)).sort((a, b) => a.provenance.row - b.provenance.row);
  const index = table.findIndex(other => other.id === record.id);
  const before = table[index - 1]; const after = table[index + 1];
  return (before && record.effectiveDate < before.effectiveDate) || (after && record.effectiveDate > after.effectiveDate);
}

/**
 * Plain-language reasons of one entry and an optional suggestion to confirm
 * (never applied by itself): dollar text → US$ amount; withdrawal without
 * period → month of its date.
 */
export function reviewReasons(entry, entries = []) {
  const { record } = entry;
  const reasons = [];
  const suggestion = {};
  const original = record.provenance?.original?.amount;
  for (const code of entry.pendingReasons) {
    if (code === 'UNRESOLVED_MONEY' || code === 'SOURCE_AMOUNT_INTERPRETATION_REQUIRED') {
      if (record.amount === null && typeof original === 'string' && DOLLAR.test(original)) {
        reasons.push('El monto está en dólares: confirma el importe en US$');
        Object.assign(suggestion, { amount: DOLLAR.exec(original)[1], currency: 'USD' });
      } else if (record.amount === null && typeof original === 'string' && /^\s*\$/.test(original)) {
        reasons.push(`El monto no es exacto («${original.trim()}»)`);
        suggestion.currency = 'USD';
      } else if (record.amount === null) reasons.push('Falta el monto');
      else if (record.currency === null) reasons.push('Falta la moneda');
    } else if (code === 'MISSING_CONFIRMED_PERIOD') {
      reasons.push(record.kind === 'withdrawal' ? 'Falta el mes del retiro' : 'No se pudo leer el mes del Excel');
      if (record.kind === 'withdrawal' && monthOfDate(record.effectiveDate)) suggestion.period = monthOfDate(record.effectiveDate);
    } else if (REASONS[code]) reasons.push(REASONS[code]());
  }
  if (counts(entry) && isSavingsDeposit(record) && !record.planPeriod) reasons.push('Falta el mes del plan');
  if (maybeInverted(record, entries)) reasons.push('La fecha puede tener día y mes invertidos');
  if (entry.status === 'pending' && !reasons.length) reasons.push('Revisa y confirma los datos');
  return { reasons: [...new Set(reasons)], suggestion };
}

/** Tasks for a person: pending rows and savings without a plan month. Date warnings stay informational. */
export function reviewQueue(entries) {
  return entries.map(entry => ({ entry, ...reviewReasons(entry, entries) }))
    .filter(item => item.entry.status === 'pending' || (counts(item.entry) && isSavingsDeposit(item.entry.record) && !item.entry.record.planPeriod));
}
