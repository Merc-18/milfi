import { addAmounts, compareAmounts, hasFractionalCent, normalizeAmount, subtractAmounts } from './amounts.js';
import { calculateDistribution } from './distribution.js';
import { FINANCIAL_RULES } from './financialRules.js';
import { FIXED_SUBCATEGORIES } from './fiorellaCategories.js';
import { isValidDate, isValidPeriod } from './models.js';

export const FIORELLA_SESSION_VERSION = 1;
export const periodKey = period => isValidPeriod(period) ? `${String(period.year).padStart(4, '0')}-${String(period.month).padStart(2, '0')}` : null;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const nullableMoney = value => value === null || value === '' ? null : typeof value === 'string' ? normalizeAmount(value) : undefined;
const validTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const content = record => JSON.stringify([record.kind, record.period, record.income, record.appliedFixedExpense, record.planStatus ?? null,
  record.categoryId, record.budgetAmount, record.actualAmount, record.effectiveDate, record.description, record.amount, record.subcategory ?? null, record.notes ?? null]);
// Optional short text: blank means "not recorded" (NULL), never an empty string.
const optionalText = (value, max) => value === undefined || value === null || (typeof value === 'string' && !value.trim()) ? null
  : typeof value === 'string' && value.trim().length <= max ? value.trim() : undefined;

export function fiorellaRecordKey(record) {
  return record.kind === 'variable-expense' ? `gv:${record.id}` : `${record.kind}:${periodKey(record.period)}:${record.categoryId ?? ''}`;
}

/** Pure, session-only command. Real records require a separate future workflow. */
// origin 'simulated' (session demo, default) or 'real' (persisted for the authenticated owner).
export function prepareFiorellaDemo(input, records = [], events = [], { origin = 'simulated' } = {}) {
  if (!['simulated', 'real'].includes(origin)) return { ok: false, errors: ['INVALID_ORIGIN'] };
  if (!input || typeof input !== 'object') return { ok: false, errors: ['INVALID_COMMAND'] };
  const errors = [];
  if (!nonempty(input.id)) errors.push('INVALID_ID');
  if (!isValidPeriod(input.period)) errors.push('INVALID_PERIOD');
  if (!['monthly-plan', 'fixed-budget', 'variable-expense'].includes(input.kind)) errors.push('INVALID_KIND');
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) errors.push('INVALID_REVISION');
  if (!validTimestamp(input.occurredAt)) errors.push('INVALID_TIMESTAMP');
  if (!nonempty(input.eventId)) errors.push('INVALID_EVENT_ID');
  if (input.origin !== undefined && input.origin !== origin) errors.push('REAL_DATA_NOT_ALLOWED');
  if (input.validationStatus !== undefined && input.validationStatus !== 'pending') errors.push('CONFIRMATION_NOT_ALLOWED');
  if (input.currency !== undefined && input.currency !== 'PEN') errors.push('UNSUPPORTED_CURRENCY');
  if ((input.moduleId !== undefined && input.moduleId !== 'fiorella')
    || (input.ownerId !== undefined && input.ownerId !== 'fiorella')) errors.push('WRONG_MODULE_OR_OWNER');
  const payload = {};
  const money = field => {
    const value = nullableMoney(input[field]);
    if (value === undefined || (value === null && input[field] !== null && input[field] !== '')) errors.push(`INVALID_${field.toUpperCase()}`);
    payload[field] = value;
  };
  if (input.kind === 'monthly-plan') {
    money('income'); money('appliedFixedExpense');
    if (payload.income === null && payload.appliedFixedExpense === null) errors.push('EMPTY_MONTHLY_PLAN');
    if (payload.appliedFixedExpense != null && compareAmounts(payload.appliedFixedExpense, FINANCIAL_RULES.fixedExpenseCap) > 0) errors.push('FIXED_EXPENSE_ABOVE_CAP');
    // A projected month holds amounts typed in advance; it is not income received.
    if (input.planStatus !== undefined && !['actual', 'projected'].includes(input.planStatus)) errors.push('INVALID_PLAN_STATUS');
    payload.planStatus = input.planStatus ?? 'actual';
  } else if (input.kind === 'fixed-budget') {
    if (!FIXED_SUBCATEGORIES.some(category => category.id === input.categoryId)) errors.push('INVALID_FIXED_CATEGORY');
    payload.categoryId = input.categoryId;
    money('budgetAmount'); money('actualAmount');
    if (payload.budgetAmount === null && payload.actualAmount === null) errors.push('EMPTY_FIXED_BUDGET');
  } else if (input.kind === 'variable-expense') {
    if (!FINANCIAL_RULES.variableCategories.some(category => category.id === input.categoryId)) errors.push('INVALID_VARIABLE_CATEGORY');
    if (!isValidDate(input.effectiveDate)) errors.push('INVALID_DATE');
    else if (input.effectiveDate.slice(0, 7) !== periodKey(input.period)) errors.push('DATE_PERIOD_MISMATCH');
    if (!nonempty(input.description) || input.description.trim().length > 300) errors.push('INVALID_DESCRIPTION');
    money('amount');
    if (payload.amount === null) errors.push('MISSING_AMOUNT');
    const subcategory = optionalText(input.subcategory, 80);
    const notes = optionalText(input.notes, 500);
    if (subcategory === undefined) errors.push('INVALID_SUBCATEGORY');
    if (notes === undefined) errors.push('INVALID_NOTES');
    Object.assign(payload, { categoryId: input.categoryId, subcategory, effectiveDate: input.effectiveDate, description: typeof input.description === 'string' ? input.description.trim() : null, notes });
  }
  if (errors.length) return { ok: false, errors };
  const candidate = { schemaVersion: FIORELLA_SESSION_VERSION, id: input.id.trim(), moduleId: 'fiorella', ownerId: 'fiorella',
    actorId: null, householdId: null, origin, validationStatus: 'pending', currency: 'PEN',
    kind: input.kind, period: { year: input.period.year, month: input.period.month }, ...payload,
    provenance: origin === 'real' ? { type: 'manual-entry', sourceId: 'milfi-app', rulesVersion: FINANCIAL_RULES.version }
      : { type: 'manual-simulation', sourceId: 'fiorella-session-demo', rulesVersion: FINANCIAL_RULES.version } };
  const previous = records.find(record => fiorellaRecordKey(record) === fiorellaRecordKey(candidate));
  if (records.some(record => record.id === candidate.id && record !== previous)) return { ok: false, errors: ['DUPLICATE_RECORD_ID'] };
  if (previous && periodKey(previous.period) !== periodKey(candidate.period)) return { ok: false, errors: ['PERIOD_CHANGE_REQUIRES_REVIEW'] };
  if (previous && previous.id !== candidate.id) return { ok: false, errors: ['DUPLICATE_PERIOD_CATEGORY'] };
  if ((previous?.revision ?? 0) !== input.expectedRevision) return { ok: false, errors: ['STALE_REVISION'] };
  if (previous && content(previous) === content(candidate)) return { ok: true, unchanged: true, value: structuredClone(previous) };
  if (events.some(event => event.id === input.eventId.trim())) return { ok: false, errors: ['DUPLICATE_EVENT_ID'] };
  if (previous && input.occurredAt < previous.updatedAt) return { ok: false, errors: ['BACKDATED_CHANGE'] };
  if (candidate.kind === 'variable-expense' && records.some(record => record.id !== candidate.id && content(record) === content(candidate)) && input.allowSimilar !== true) {
    return { ok: false, errors: ['POSSIBLE_DUPLICATE_EXPENSE'] };
  }
  const value = { ...candidate, revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? input.occurredAt, updatedAt: input.occurredAt };
  if (!Number.isSafeInteger(value.revision)) return { ok: false, errors: ['REVISION_LIMIT'] };
  const event = { schemaVersion: 1, id: input.eventId.trim(), recordId: value.id, revision: value.revision, period: value.period,
    moduleId: 'fiorella', origin, actorId: null, action: previous ? 'updated' : 'created', occurredAt: input.occurredAt,
    similarExpenseAcknowledged: input.allowSimilar === true, before: previous ?? null, after: value };
  return { ok: true, value: structuredClone(value), event: structuredClone(event) };
}

// Display a signed comparison without extending subtraction into a balance policy.
export function moneyDifference(budget, spent) {
  if (budget === null || spent === null) return { status: 'unavailable', amount: null };
  const comparison = compareAmounts(budget, spent);
  return { status: comparison < 0 ? 'over' : comparison > 0 ? 'remaining' : 'equal',
    amount: comparison < 0 ? subtractAmounts(spent, budget) : subtractAmounts(budget, spent) };
}

function aggregate(records, field, expected) {
  const values = records.map(record => record[field]).filter(value => typeof value === 'string');
  return { amount: values.length ? values.reduce(addAmounts, '0') : null, registered: values.length, expected,
    status: !values.length ? 'unregistered' : values.length < expected ? 'partial' : 'complete' };
}

export function summarizeFiorella(records, period, origin = 'simulated') {
  const selected = records.filter(record => record.moduleId === 'fiorella' && record.origin === origin
    && record.validationStatus === 'pending' && periodKey(record.period) === periodKey(period) && isValidPeriod(period));
  const monthly = selected.find(record => record.kind === 'monthly-plan') ?? null;
  const fixed = selected.filter(record => record.kind === 'fixed-budget');
  const variable = selected.filter(record => record.kind === 'variable-expense');
  const calculation = calculateDistribution({ income: monthly?.income ?? '', fixedExpense: monthly?.appliedFixedExpense ?? '' });
  const budget = aggregate(fixed, 'budgetAmount', FIXED_SUBCATEGORIES.length);
  const actual = aggregate(fixed, 'actualAmount', FIXED_SUBCATEGORIES.length);
  const fixedCoverage = { matched: fixed.filter(record => record.budgetAmount !== null && record.actualAmount !== null).length };
  const fixedComparison = budget.status === 'complete' && actual.status === 'complete'
    ? moneyDifference(budget.amount, actual.amount) : { status: 'unavailable', amount: null, reason: 'INCOMPLETE_FIXED_DETAIL' };
  const categories = FINANCIAL_RULES.variableCategories.map(category => {
    const expenses = variable.filter(record => record.categoryId === category.id);
    const executed = aggregate(expenses, 'amount', expenses.length);
    const allocation = calculation.status === 'calculated' ? calculation.distribution.variable.categories[category.id] : null;
    return { ...category, allocation, executed, comparison: moneyDifference(allocation, executed.amount) };
  });
  return { monthly, fixed, variable, calculation, budget, actual, categories,
    fixedComparison, fixedCoverage,
    requiresRoundingDecision: selected.some(record => ['income', 'appliedFixedExpense', 'budgetAmount', 'actualAmount', 'amount']
      .some(field => typeof record[field] === 'string' && hasFractionalCent(record[field]))) || calculation.requiresRoundingDecision === true };
}

export function fiorellaHistory(records, events, simulations, origin = 'simulated') {
  const demos = records.filter(record => record.moduleId === 'fiorella' && record.origin === origin && record.validationStatus === 'pending');
  const scenarios = simulations.filter(record => record.moduleId === 'fiorella' && record.origin === 'simulated' && record.validationStatus === 'pending');
  const periods = new Map([...demos, ...scenarios].filter(record => isValidPeriod(record.period)).map(record => [periodKey(record.period), record.period]));
  return [...periods.keys()].sort().reverse().map(key => ({ key, period: periods.get(key),
    records: demos.filter(record => periodKey(record.period) === key),
    events: events.filter(event => event.moduleId === 'fiorella' && event.origin === origin && periodKey(event.period) === key && demos.some(record => record.id === event.recordId)),
    simulations: scenarios.filter(record => periodKey(record.period) === key),
  }));
}
