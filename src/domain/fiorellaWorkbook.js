import { addAmounts, compareAmounts, hasFractionalCent, normalizeAmount } from './amounts.js';
import { columnName, excelRange } from './excelEvidence.js';
import { FINANCIAL_RULES } from './financialRules.js';
import { FIXED_CATEGORIES } from './fiorellaCategories.js';
import { normalizeLabel } from './controlWorkbook.js';
import { isValidDate } from './models.js';

// Recognizes Fiorella's monthly workbook by its labels (not fixed coordinates)
// and turns it into rows for a one-time historical load. Nothing is guessed:
// a blank cell stays NULL, a future month is marked as projected, a GF actual
// keeps its month without an invented date, and anything doubtful is returned
// as pending instead of being loaded. Formulas are never executed; their cached
// values are used only to reconcile totals against the rows found.
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SHORT_MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const GOAL_STATUS = [[/activ/, 'active'], [/paus/, 'paused'], [/(logr|cumpl|complet)/, 'achieved'], [/cancel/, 'cancelled']];
// Labels without emoji or decoration: "💵 Ingreso" → "ingreso", "📁 Salud" → "salud".
const plainLabel = value => normalizeLabel(value).replace(/[^\p{L}\p{N}%()&/.°_ -]/gu, '').replace(/\s+/g, ' ').trim();
const periodKey = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;

function grid(sheet) {
  const rows = new Map();
  for (const [ref, cell] of Object.entries(sheet.cells)) {
    const { first } = excelRange(ref);
    if (!rows.has(first.row)) rows.set(first.row, new Map());
    rows.get(first.row).set(first.column, { ref, ...cell });
  }
  const at = (column, row) => rows.get(row)?.get(column) ?? null;
  const label = (column, row) => { const cell = at(column, row); return cell?.type === 'text' ? plainLabel(cell.value) : ''; };
  const rowNumbers = [...rows.keys()].sort((a, b) => a - b);
  const find = test => { for (const row of rowNumbers) for (const column of [...rows.get(row).keys()].sort((a, b) => a - b)) if (test(label(column, row), column, row)) return { column, row }; return null; };
  return { rows, at, label, rowNumbers, find };
}

// Excel stores 12.3 as the binary double "12.300000000000001". The shortest
// decimal that maps to the same double is what Excel shows; it is the value.
function amountOf(cell) {
  if (!cell || (cell.type === 'blank' && !cell.formula)) return { value: null };
  if (cell.formula) return { pending: 'FORMULA_IN_INPUT_CELL', original: cell.value ?? null };
  if (cell.type !== 'number') return { pending: 'NON_NUMERIC_AMOUNT', original: cell.value };
  const number = Number(cell.value);
  const value = Number.isFinite(number) && number >= 0 && number < 1e15 ? normalizeAmount(String(number)) : null;
  if (value === null) return { pending: 'INVALID_AMOUNT', original: cell.value };
  if (hasFractionalCent(value)) return { pending: 'FRACTIONAL_CENT', original: cell.value };
  return { value, original: cell.value };
}

const cachedAmount = cell => cell?.type === 'number' && Number.isFinite(Number(cell.value)) ? normalizeAmount(String(Math.abs(Number(cell.value)) < 1e15 ? Number(cell.value) : NaN)) : null;
const sum = values => values.filter(value => value !== null).reduce(addAmounts, '0');
// Totals in the workbook are cached doubles; compare at cent precision.
const sameCents = (left, right) => left !== null && right !== null && Math.round(Number(left) * 100) === Math.round(Number(right) * 100);

function excelDate(cell) {
  if (!cell || cell.formula) return null;
  if (cell.type === 'number' && /^\d+$/.test(cell.value)) {
    const serial = Number(cell.value);
    if (serial <= 60 || serial > 2958465) return null;
    return new Date(Date.UTC(1899, 11, 31) + (serial - 1) * 86400000).toISOString().slice(0, 10);
  }
  return cell.type === 'text' && isValidDate(cell.value.trim()) ? cell.value.trim() : null;
}

function findSheet(capture, test) {
  const sheets = capture.sheets.filter(sheet => sheet.kind === 'worksheet' && test(plainLabel(sheet.name)));
  return sheets.length === 1 ? sheets[0] : null;
}

function checkRules(sheet, errors, checks) {
  const g = grid(sheet);
  const named = name => { const spot = g.find(label => label === name.toLowerCase()); return spot ? g.at(spot.column + 1, spot.row) : null; };
  const percent = cell => cell?.type === 'number' ? Math.round(Number(cell.value) * 10000) / 100 : null;
  const expected = [['gf_tope', FINANCIAL_RULES.fixedExpenseCap, cell => cachedAmount(cell)],
    ['pct_gv', FINANCIAL_RULES.variablePercentage, percent], ['pct_ah', FINANCIAL_RULES.savingsPercentage, percent],
    ['pct_ah_per', FINANCIAL_RULES.personalSavingsPercentage, percent], ['pct_ah_par', FINANCIAL_RULES.coupleSavingsPercentage, percent]];
  for (const category of FINANCIAL_RULES.variableCategories) {
    const spot = g.find(label => label === normalizeLabel(category.name));
    expected.push([`gv_${category.id}`, category.percentage, () => spot ? percent(g.at(spot.column + 1, spot.row)) : null]);
  }
  const mismatched = expected.filter(([name, value, read]) => String(read(name.startsWith('gv_') ? null : named(name))) !== String(value)).map(([name]) => name);
  if (mismatched.length) errors.push({ code: 'RULES_MISMATCH', sheet: sheet.name, detail: mismatched });
  else checks.push({ code: 'RULES_MATCH', ok: true, detail: FINANCIAL_RULES.version });
}

function readHistory(sheet, cutoff, out) {
  const g = grid(sheet);
  const header = g.find((label, column, row) => label === 'mes' && g.label(column + 1, row) === 'ano');
  if (!header) return out.errors.push({ code: 'HISTORY_HEADER_NOT_FOUND', sheet: sheet.name });
  const columns = new Map([...g.rows.get(header.row).keys()].map(column => [g.label(column, header.row), column]));
  const income = columns.get('ingreso');
  const fixed = columns.get('gf');
  if (!income || !fixed) return out.errors.push({ code: 'HISTORY_COLUMNS_NOT_FOUND', sheet: sheet.name });
  const found = [];
  for (const row of g.rowNumbers.filter(row => row > header.row)) {
    const name = g.label(header.column, row);
    if (name === 'total') { out.totals.history = { income: cachedAmount(g.at(income, row)), fixed: cachedAmount(g.at(fixed, row)), ref: `${columnName(income)}${row}` }; break; }
    const month = MONTHS.indexOf(name) + 1;
    const yearCell = g.at(header.column + 1, row);
    if (!month) { if (name) out.pending.push({ code: 'UNKNOWN_MONTH_ROW', sheet: sheet.name, ref: `${columnName(header.column)}${row}` }); continue; }
    if (yearCell?.type !== 'number' || !/^\d{4}$/.test(yearCell.value)) { out.pending.push({ code: 'MISSING_YEAR', sheet: sheet.name, ref: `${columnName(header.column + 1)}${row}` }); continue; }
    const period = { year: Number(yearCell.value), month };
    const values = { income: amountOf(g.at(income, row)), fixed: amountOf(g.at(fixed, row)) };
    const refs = { income: `${columnName(income)}${row}`, appliedFixedExpense: `${columnName(fixed)}${row}` };
    const problem = Object.entries(values).find(([, value]) => value.pending);
    if (problem) { out.pending.push({ code: problem[1].pending, sheet: sheet.name, ref: refs[problem[0] === 'fixed' ? 'appliedFixedExpense' : 'income'], period: periodKey(period) }); continue; }
    if (values.income.value === null && values.fixed.value === null) continue;
    if (values.fixed.value !== null && compareAmounts(values.fixed.value, FINANCIAL_RULES.fixedExpenseCap) > 0) {
      out.pending.push({ code: 'FIXED_EXPENSE_ABOVE_CAP', sheet: sheet.name, ref: refs.appliedFixedExpense, period: periodKey(period) }); continue;
    }
    const projected = periodKey(period) > cutoff.slice(0, 7);
    found.push(values);
    out.monthlyPlans.push({ period_year: period.year, period_month: period.month, income: values.income.value, applied_fixed_expense: values.fixed.value,
      plan_status: projected ? 'projected' : 'actual',
      provenance: { type: 'fiorella-excel', sheet: sheet.name, cells: refs, original: { income: values.income.original ?? null, appliedFixedExpense: values.fixed.original ?? null } } });
  }
  if (out.totals.history) out.checks.push({ code: 'HISTORY_INCOME_TOTAL', ok: sameCents(sum(found.map(value => value.income.value)), out.totals.history.income), ref: out.totals.history.ref });
}

function readFixedTrack(sheet, cutoff, out) {
  const g = grid(sheet);
  const header = g.find(label => label === 'subcategoria');
  if (!header) return out.errors.push({ code: 'GF_HEADER_NOT_FOUND', sheet: sheet.name });
  const months = [];
  for (const column of [...g.rows.get(header.row).keys()].sort((a, b) => a - b)) {
    const match = /^([a-z]+) (\d{4})$/.exec(g.label(column, header.row));
    const month = match ? MONTHS.indexOf(match[1]) + 1 : 0;
    if (!month) continue;
    if (g.label(column, header.row + 1) !== 'presup.' || g.label(column + 1, header.row + 1) !== 'real') return out.errors.push({ code: 'GF_SUBHEADER_MISMATCH', sheet: sheet.name, ref: `${columnName(column)}${header.row + 1}` });
    months.push({ period: { year: Number(match[2]), month }, budget: column, actual: column + 1 });
  }
  if (!months.length) return out.errors.push({ code: 'GF_MONTHS_NOT_FOUND', sheet: sheet.name });
  const groups = new Map(FIXED_CATEGORIES.map(group => [normalizeLabel(group.name), group]));
  const matched = new Set();
  const perMonth = new Map(months.map(month => [periodKey(month.period), { budget: [], actual: [] }]));
  let group = null;
  for (const row of g.rowNumbers.filter(row => row > header.row + 1)) {
    const name = g.label(header.column, row);
    if (!name) continue;
    if (name.startsWith('total gf')) {
      for (const month of months) out.totals.fixed[periodKey(month.period)] = { budget: cachedAmount(g.at(month.budget, row)), actual: cachedAmount(g.at(month.actual, row)), ref: `${columnName(month.budget)}${row}` };
      break;
    }
    if (name.startsWith('subtotal')) continue;
    if (groups.has(name)) { group = groups.get(name); continue; }
    const category = group?.children.find(child => normalizeLabel(child.name) === name);
    if (!category) { out.pending.push({ code: 'UNKNOWN_GF_SUBCATEGORY', sheet: sheet.name, ref: `${columnName(header.column)}${row}` }); continue; }
    if (matched.has(category.id)) { out.errors.push({ code: 'DUPLICATE_GF_SUBCATEGORY', sheet: sheet.name, ref: `${columnName(header.column)}${row}` }); continue; }
    matched.add(category.id);
    for (const month of months) {
      const key = periodKey(month.period);
      const refs = { budgetAmount: `${columnName(month.budget)}${row}`, actualAmount: `${columnName(month.actual)}${row}` };
      const budget = amountOf(g.at(month.budget, row));
      const actual = amountOf(g.at(month.actual, row));
      if (budget.pending || actual.pending) { out.pending.push({ code: budget.pending ?? actual.pending, sheet: sheet.name, ref: budget.pending ? refs.budgetAmount : refs.actualAmount, period: key }); continue; }
      if (budget.value === null && actual.value === null) continue;
      const future = key > cutoff.slice(0, 7);
      if (future && actual.value !== null) { out.pending.push({ code: 'FUTURE_ACTUAL_AMOUNT', sheet: sheet.name, ref: refs.actualAmount, period: key }); continue; }
      // A future month whose budget is still the template's zero carries no plan yet.
      if (future && budget.value === '0') { out.omitted.push({ code: 'FUTURE_TEMPLATE_ZERO', sheet: sheet.name, ref: refs.budgetAmount, period: key }); continue; }
      perMonth.get(key).budget.push(budget.value); perMonth.get(key).actual.push(actual.value);
      out.fixedBudgets.push({ period_year: month.period.year, period_month: month.period.month, category_id: category.id,
        budget_amount: budget.value, actual_amount: actual.value,
        provenance: { type: 'fiorella-excel', sheet: sheet.name, cells: refs, original: { budgetAmount: budget.original ?? null, actualAmount: actual.original ?? null } } });
    }
  }
  const missing = FIXED_CATEGORIES.flatMap(item => item.children).filter(child => !matched.has(child.id));
  if (missing.length) out.pending.push({ code: 'GF_SUBCATEGORIES_MISSING', sheet: sheet.name, detail: missing.map(child => child.id) });
  for (const [key, totals] of perMonth) {
    const expected = out.totals.fixed[key];
    if (!expected || key > cutoff.slice(0, 7)) continue;
    out.checks.push({ code: 'GF_BUDGET_TOTAL', period: key, ok: sameCents(sum(totals.budget), expected.budget), ref: expected.ref });
    out.checks.push({ code: 'GF_ACTUAL_TOTAL', period: key, ok: sameCents(sum(totals.actual), expected.actual ?? '0'), ref: expected.ref });
  }
}

function readVariableTrack(sheet, cutoff, out) {
  const g = grid(sheet);
  const header = g.find((label, column, row) => label === 'fecha' && [...g.rows.get(row).keys()].some(other => g.label(other, row) === 'descripcion'));
  if (!header) return out.errors.push({ code: 'GV_HEADER_NOT_FOUND', sheet: sheet.name });
  const columns = new Map([...g.rows.get(header.row).keys()].map(column => [g.label(column, header.row), column]));
  const column = name => columns.get(name);
  if (!['mes', 'categoria', 'subcategoria', 'descripcion', 'monto'].every(column)) return out.errors.push({ code: 'GV_COLUMNS_NOT_FOUND', sheet: sheet.name });
  const categories = new Map(FINANCIAL_RULES.variableCategories.map(category => [normalizeLabel(category.name), category.id]));
  const amounts = [];
  const content = new Map();
  for (const row of g.rowNumbers.filter(row => row > header.row)) {
    const first = g.label(columns.values().next().value, row);
    if (first.startsWith('total')) { out.totals.variable = { amount: cachedAmount([...g.rows.get(row).values()].find(cell => cell.type === 'number')), ref: `row ${row}` }; break; }
    const cells = ['fecha', 'mes', 'categoria', 'subcategoria', 'descripcion', 'monto', 'notas'].map(name => column(name) ? g.at(column(name), row) : null);
    if (cells.every(cell => !cell || (cell.type === 'blank' && !cell.formula))) continue;
    const ref = `${columnName(column('fecha'))}${row}:${columnName(column('notas') ?? column('monto'))}${row}`;
    const [dateCell, monthCell, categoryCell, subcategoryCell, descriptionCell, amountCell, notesCell] = cells;
    const text = cell => cell?.type === 'text' && cell.value.trim() ? cell.value.trim() : null;
    const date = excelDate(dateCell);
    const amount = amountOf(amountCell);
    const categoryId = categories.get(normalizeLabel(text(categoryCell) ?? '')) ?? null;
    const description = text(descriptionCell);
    const problems = [!date && 'INVALID_OR_MISSING_DATE', amount.pending, amount.value === null && !amount.pending && 'MISSING_AMOUNT',
      !categoryId && 'UNKNOWN_GV_CATEGORY', !description && 'MISSING_DESCRIPTION', description?.length > 300 && 'DESCRIPTION_TOO_LONG',
      date && date > cutoff && 'DATE_AFTER_CUTOFF',
      date && text(monthCell) && MONTHS.indexOf(normalizeLabel(text(monthCell))) + 1 !== Number(date.slice(5, 7)) && 'MONTH_LABEL_DATE_MISMATCH'].filter(Boolean);
    if (problems.length) { out.pending.push({ code: problems[0], all: problems, sheet: sheet.name, ref }); continue; }
    const row_ = { period_year: Number(date.slice(0, 4)), period_month: Number(date.slice(5, 7)), category_id: categoryId, subcategory: text(subcategoryCell)?.slice(0, 80) ?? null,
      effective_date: date, description, amount: amount.value, notes: text(notesCell)?.slice(0, 500) ?? null, distinct_operation_reason: null,
      source_ref: `${plainLabel(sheet.name)}:${row}`,
      provenance: { type: 'fiorella-excel', sheet: sheet.name, row, range: ref, original: { date: dateCell?.value ?? null, amount: amount.original, month: monthCell?.value ?? null } } };
    const key = JSON.stringify([date, categoryId, row_.subcategory, description, amount.value]);
    if (content.has(key)) { out.pending.push({ code: 'IDENTICAL_GV_ROWS', sheet: sheet.name, ref, detail: content.get(key) }); continue; }
    content.set(key, ref);
    amounts.push(amount.value);
    out.variableExpenses.push(row_);
  }
  if (out.totals.variable) out.checks.push({ code: 'GV_TOTAL', ok: sameCents(sum(amounts), out.totals.variable.amount), ref: out.totals.variable.ref });
}

function readGoals(sheet, out) {
  const g = grid(sheet);
  const header = g.find((label, column, row) => label === 'nombre' && g.label(column + 1, row) === 'monto objetivo');
  if (!header) { out.omitted.push({ code: 'NO_SAVED_GOALS_TABLE', sheet: sheet.name }); return; }
  const columns = new Map([...g.rows.get(header.row).keys()].map(column => [g.label(column, header.row), column]));
  // Saved goals are consecutive rows under the header; the first row without a name ends the table.
  for (let row = header.row + 1; ; row++) {
    const at = name => columns.get(name) ? g.at(columns.get(name), row) : null;
    const title = at('nombre')?.type === 'text' ? at('nombre').value.trim() : '';
    if (!title) break;
    const ref = `${columnName(header.column)}${row}`;
    const target = amountOf(at('monto objetivo'));
    const monthsCell = at('meses');
    const months = monthsCell?.type === 'number' && /^\d+$/.test(monthsCell.value) && Number(monthsCell.value) > 0 ? Number(monthsCell.value) : null;
    const deadlineLabel = at('fecha limite')?.type === 'text' ? at('fecha limite').value.trim() : null;
    const deadline = /^([a-z]{3})[a-z]*\.? (\d{4})$/.exec(normalizeLabel(deadlineLabel ?? ''));
    const statusLabel = at('estado')?.type === 'text' ? normalizeLabel(at('estado').value) : '';
    const status = GOAL_STATUS.find(([pattern]) => pattern.test(statusLabel))?.[1] ?? null;
    const problems = [(target.pending || target.value === null || target.value === '0') && 'INVALID_TARGET', !months && 'INVALID_MONTHS',
      deadlineLabel && !(deadline && SHORT_MONTHS[deadline[1]]) && 'UNREADABLE_DEADLINE', !status && 'UNKNOWN_GOAL_STATUS', title.length > 120 && 'TITLE_TOO_LONG'].filter(Boolean);
    if (problems.length) { out.pending.push({ code: problems[0], all: problems, sheet: sheet.name, ref }); continue; }
    const notesCell = at('notas');
    out.savingsGoals.push({ title, target_amount: target.value, months, deadline_label: deadlineLabel,
      deadline_year: deadline ? Number(deadline[2]) : null, deadline_month: deadline ? SHORT_MONTHS[deadline[1]] : null, status,
      notes: notesCell?.type === 'text' && notesCell.value.trim() ? notesCell.value.trim().slice(0, 500) : null,
      source_ref: `${plainLabel(sheet.name)}:${row}`,
      provenance: { type: 'fiorella-excel', sheet: sheet.name, row, original: { status: at('estado')?.value ?? null, monthlyContribution: at('aporte/mes')?.value ?? null } } });
  }
}

/** capture: output of readXlsxCapture. cutoff: 'YYYY-MM-DD'. Pure; never touches the network. */
export function recognizeFiorellaWorkbook(capture, { cutoff } = {}) {
  if (!capture?.sheets || !/^[a-f0-9]{64}$/.test(capture.fingerprint ?? '')) return { ok: false, errors: [{ code: 'INVALID_CAPTURE' }] };
  if (!isValidDate(cutoff)) return { ok: false, errors: [{ code: 'INVALID_CUTOFF' }] };
  const out = { monthlyPlans: [], fixedBudgets: [], variableExpenses: [], savingsGoals: [], pending: [], omitted: [], checks: [], errors: [], totals: { fixed: {} } };
  if (capture.dateSystem !== '1900') out.errors.push({ code: 'UNSUPPORTED_DATE_SYSTEM' });
  const sheets = {
    configuration: findSheet(capture, name => name.includes('configuracion')),
    history: findSheet(capture, name => name.includes('historial')),
    fixed: findSheet(capture, name => name.includes('track gf')),
    variable: findSheet(capture, name => name.includes('track gv')),
    goals: findSheet(capture, name => name.includes('simulador')),
  };
  for (const [key, sheet] of Object.entries(sheets)) if (!sheet) out.errors.push({ code: 'SHEET_NOT_FOUND', detail: key });
  if (!out.errors.length) {
    checkRules(sheets.configuration, out.errors, out.checks);
    readHistory(sheets.history, cutoff, out);
    readFixedTrack(sheets.fixed, cutoff, out);
    readVariableTrack(sheets.variable, cutoff, out);
    readGoals(sheets.goals, out);
    // Derived or simulation-only content: shown in the preview, never loaded as records.
    for (const sheet of capture.sheets.filter(item => !Object.values(sheets).includes(item))) out.omitted.push({ code: 'DERIVED_SHEET', sheet: sheet.name });
    out.omitted.push({ code: 'SIMULATION_INPUTS_NOT_RECORDS', sheet: sheets.goals.name });
  }
  const stamp = row => ({ ...row, provenance: { ...row.provenance, sourceFingerprint: capture.fingerprint, cutoff } });
  // Cached workbook totals were only used for the reconciliation checks above.
  const { totals: _totals, errors, ...plan } = out;
  for (const key of ['monthlyPlans', 'fixedBudgets', 'variableExpenses', 'savingsGoals']) plan[key] = plan[key].map(stamp);
  return errors.length ? { ok: false, errors, partial: plan } : { ok: true, plan: { fingerprint: capture.fingerprint, cutoff, ...plan } };
}
