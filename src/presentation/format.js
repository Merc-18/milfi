import { isValidPeriod } from '../domain/models.js';

// All exact decimal places are displayed. Padding does not introduce rounding.
export function formatAmount(amount) {
  if (typeof amount !== 'string' || !/^\d+(?:\.\d+)?$/.test(amount)) return '—';
  const [whole, decimals = ''] = amount.split('.');
  return `S/ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimals.padEnd(2, '0')}`;
}

export function formatPeriod(period) {
  if (!isValidPeriod(period)) return 'Periodo pendiente';
  const value = `${String(period.year).padStart(4, '0')}-${String(period.month).padStart(2, '0')}-01T00:00:00Z`;
  return new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

export function currentPeriodInput(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', timeZone: 'America/Lima' }).formatToParts(now);
  return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}`;
}

export function parsePeriodInput(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  return isValidPeriod({ year, month }) ? { year, month } : null;
}
