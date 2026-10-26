import { isValidPeriod } from '../domain/models.js';

const SYMBOLS = { PEN: 'S/', USD: 'US$' };

/** True for an exact unsigned decimal string, the only amounts the formatters accept. */
export const isAmountText = amount => typeof amount === 'string' && /^\d+(?:\.\d+)?$/.test(amount);

// The one money format of the app: "S/ 1,234.56" or "US$ 1,234.56". All exact
// decimal places are displayed; padding does not introduce rounding.
export function formatMoney(amount, currency = 'PEN') {
  if (!isAmountText(amount)) return '—';
  const [whole, decimals = ''] = amount.split('.');
  return `${SYMBOLS[currency] ?? currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimals.padEnd(2, '0')}`;
}

export const formatAmount = amount => formatMoney(amount, 'PEN');

/** "1 gasto", "3 gastos"; irregular plurals are passed in. */
export const plural = (count, singular, many = `${singular}s`) => `${count} ${count === 1 ? singular : many}`;

export function formatPeriod(period) {
  if (!isValidPeriod(period)) return 'Periodo pendiente';
  const value = `${String(period.year).padStart(4, '0')}-${String(period.month).padStart(2, '0')}-01T00:00:00Z`;
  return new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

// Month name alone, e.g. "septiembre".
export function formatMonthName(period) {
  if (!isValidPeriod(period)) return 'mes pendiente';
  return new Intl.DateTimeFormat('es-PE', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, period.month - 1, 1))).toLowerCase();
}

// Compact month label for charts, e.g. "ene 31".
export function formatShortPeriod(period) {
  if (!isValidPeriod(period)) return '—';
  const value = `${String(period.year).padStart(4, '0')}-${String(period.month).padStart(2, '0')}-01T00:00:00Z`;
  return new Intl.DateTimeFormat('es-PE', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(value)).replace('.', '');
}

// Short day label, e.g. "12 oct".
export function formatShortDate(date) {
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)).replace('.', '');
}

// Today's date in Lima, 'YYYY-MM-DD'.
export const todayInLima = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

export function currentPeriodInput(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', timeZone: 'America/Lima' }).formatToParts(now);
  return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}`;
}

export function parsePeriodInput(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  return isValidPeriod({ year, month }) ? { year, month } : null;
}
