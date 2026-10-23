import { addAmounts, compareAmounts, normalizeAmount, subtractAmounts } from '../domain/amounts.js';
import { columnName, excelRange } from '../domain/excelEvidence.js';
import { normalizeLabel } from '../domain/controlWorkbook.js';
import { contributionHistory, counts } from './controlLedgerView.js';
import { inspectLedger } from '../domain/controlLedger.js';

const sum = records => records.reduce((total, record) => addAmounts(total, record.amount), '0');
const LABELS = new Map([
  ['total depositado para gastos (milton)', 'MILTON_EXPENSES'],
  ['total depositado para ahorros (fiorella)', 'FIORELLA_SAVINGS'],
  ['total acumulado en ahorros', 'SAVINGS_DEPOSITS'],
  ['total retirado de ahorros', 'SAVINGS_WITHDRAWALS'],
  ['saldo disponible en ahorros', 'SAVINGS_BALANCE'],
]);

/** Offline contrast only. Lower workbook rows are cached summaries, never new
 * movements. Compare their numeric PEN values under the owner's decisions;
 * explicitly distinguish source arithmetic from reviewed ledger totals. No
 * cached formula is executed, currency converted or text amount interpreted. */
export function controlWorkbookContrast(capture, records) {
  const entries = inspectLedger(records);
  const history = contributionHistory(entries);
  const numeric = records.filter(record => record.currency === 'PEN' && record.amount !== null);
  const savings = numeric.filter(record => record.kind === 'deposit' && record.purpose === 'savings');
  const withdrawals = numeric.filter(record => record.kind === 'withdrawal');
  const deposits = sum(savings); const withdrawn = sum(withdrawals);
  const negative = compareAmounts(deposits, withdrawn) < 0;
  const balance = negative ? subtractAmounts(withdrawn, deposits) : subtractAmounts(deposits, withdrawn);
  const sourceTotals = {
    MILTON_EXPENSES: sum(numeric.filter(record => record.kind === 'deposit' && record.purpose === 'expenses' && record.contributorId === 'milton')),
    FIORELLA_SAVINGS: sum(savings.filter(record => record.contributorId === 'fiorella')),
    SAVINGS_DEPOSITS: deposits, SAVINGS_WITHDRAWALS: withdrawn, SAVINGS_BALANCE: balance,
  };
  const groupTotal = (person, purpose) => history.find(group => group.contributorId === person && group.purpose === purpose && group.currency === 'PEN')?.total ?? '0';
  const checks = [];
  for (const sheet of capture.sheets) for (const [ref, cell] of Object.entries(sheet.cells)) {
    const code = cell.type === 'text' ? LABELS.get(normalizeLabel(cell.value)) : null;
    if (!code) continue;
    const { first } = excelRange(ref);
    const valueCell = sheet.cells[`${columnName(first.column + 1)}${first.row}`];
    const raw = valueCell?.type === 'number' ? String(valueCell.value).trim() : '';
    const cacheNegative = raw.startsWith('-');
    const cached = normalizeAmount(cacheNegative ? raw.slice(1) : raw);
    const sourceMatches = cached === null ? null : cached === sourceTotals[code] && cacheNegative === (code === 'SAVINGS_BALANCE' && negative);
    const signMatches = cacheNegative === (code === 'SAVINGS_BALANCE' && negative);
    const delta = cached === null ? null : compareAmounts(cached, sourceTotals[code]) >= 0
      ? subtractAmounts(cached, sourceTotals[code]) : subtractAmounts(sourceTotals[code], cached);
    const comparison = sourceMatches === true ? 'EXACT_MATCH' : delta === null ? 'UNREADABLE_CACHE'
      : signMatches && compareAmounts(delta, '0.01') < 0 ? 'SUBCENT_CACHE_DIFFERENCE' : 'DIFFERENCE';
    const ledgerTotal = code === 'MILTON_EXPENSES' ? groupTotal('milton', 'expenses')
      : code === 'FIORELLA_SAVINGS' ? groupTotal('fiorella', 'savings') : null;
    checks.push({ code, comparison, sourceMatches, ledgerMatches: ledgerTotal === null || cached === null ? null : cached === ledgerTotal && !cacheNegative });
  }
  return { checks, recognized: checks.length, pendingMovements: entries.filter(entry => !counts(entry) && entry.status !== 'rejected').length,
    unresolvedAmounts: records.filter(record => record.amount === null).length,
    // SUM ignores unresolved text cells: matching cached numeric summaries is
    // not a declaration that all withdrawals or dollar text are reviewed.
    complete: checks.length === LABELS.size && new Set(checks.map(check => check.code)).size === LABELS.size
      && checks.every(check => check.sourceMatches === true && check.ledgerMatches !== false) };
}
