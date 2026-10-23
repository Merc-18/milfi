import assert from 'node:assert/strict';
import test from 'node:test';
import { createMilfiStore } from '../src/store/useStore.js';
import { createPeriodStore } from '../src/store/periodStore.js';
import { FIXED_CATEGORIES, FIXED_SUBCATEGORIES } from '../src/domain/fiorellaCategories.js';
import { fiorellaHistory, moneyDifference, periodKey, prepareFiorellaDemo, summarizeFiorella } from '../src/domain/fiorellaSession.js';
import { validateEnvelope } from '../src/domain/models.js';

// Invented values only. Configuration labels are the official functional schema.
let sequence = 0;
const period = { year: 2036, month: 2 };
const command = (kind, fields = {}) => ({ id: `demo-${++sequence}`, eventId: `event-${sequence}`,
  kind, period, expectedRevision: 0, occurredAt: '2036-02-28T12:00:00.000Z',
  ...(kind === 'monthly-plan' ? { income: '4321.01', appliedFixedExpense: '1500' }
    : kind === 'fixed-budget' ? { categoryId: 'servicios-gas', budgetAmount: '45.10', actualAmount: '50.05' }
      : { categoryId: 'salud', effectiveDate: '2036-02-29', description: 'Ejemplo inventado', amount: '12.34' }), ...fields });
const summary = store => summarizeFiorella(store.getState().fiorellaDemoRecords, period);
const save = (store, input) => store.getState().saveFiorellaDemo(input);

test('GF official hierarchy has five immutable groups and nineteen distinct leaf identities', () => {
  assert.deepEqual(FIXED_CATEGORIES.map(group => group.name), ['Servicios', 'Transporte', 'Comida', 'Bienestar', 'Otros']);
  assert.equal(FIXED_SUBCATEGORIES.length, 19);
  assert.equal(new Set(FIXED_SUBCATEGORIES.map(category => category.id)).size, 19);
  assert.deepEqual(FIXED_SUBCATEGORIES.filter(category => category.name === 'Gym').map(category => category.id), ['transporte-gym', 'bienestar-gym']);
  assert.ok(Object.isFrozen(FIXED_CATEGORIES[0].children[0]));
  assert.throws(() => { FIXED_CATEGORIES[0].children.push({}); }, TypeError);
});

test('session contracts produce pending simulations with reusable envelopes and no authenticated actor', () => {
  for (const kind of ['monthly-plan', 'fixed-budget', 'variable-expense']) {
    const result = prepareFiorellaDemo(command(kind));
    assert.equal(result.ok, true);
    assert.deepEqual(validateEnvelope(result.value), []);
    assert.equal(result.value.origin, 'simulated');
    assert.equal(result.value.validationStatus, 'pending');
    assert.equal(result.value.ownerId, 'fiorella');
    assert.equal(result.value.actorId, null);
    assert.equal(result.value.currency, 'PEN');
  }
});

test('no-input dashboard preserves unknown values instead of reporting zero or confirmed money', () => {
  const view = summary(createMilfiStore());
  assert.equal(view.monthly, null);
  assert.equal(view.budget.amount, null);
  assert.equal(view.actual.amount, null);
  assert.equal(view.budget.status, 'unregistered');
  assert.equal(view.calculation.status, 'incomplete');
  assert.ok(view.categories.every(category => category.executed.amount === null && category.allocation === null));
});

test('monthly income, applied GF, detailed budget and actual GF remain separate', () => {
  const store = createMilfiStore();
  save(store, command('monthly-plan'));
  save(store, command('fixed-budget'));
  const view = summary(store);
  assert.equal(view.monthly.appliedFixedExpense, '1500');
  assert.equal(view.budget.amount, '45.1');
  assert.equal(view.actual.amount, '50.05');
  assert.equal(view.calculation.distribution.surplus, '2821.01');
  assert.equal(view.calculation.distribution.variable.total, '1128.404');
  assert.ok(view.categories.every(category => category.allocation === '564.202'));
  assert.equal(view.requiresRoundingDecision, true);
});

test('partial monthly data does not invent applied GF, income or a distribution', () => {
  const store = createMilfiStore();
  assert.equal(save(store, command('monthly-plan', { appliedFixedExpense: '' })).ok, true);
  assert.equal(summary(store).monthly.appliedFixedExpense, null);
  assert.equal(summary(store).calculation.status, 'incomplete');
  assert.equal(prepareFiorellaDemo(command('monthly-plan', { income: '', appliedFixedExpense: '' })).ok, false);
});

test('deficit and zero-surplus drafts preserve inputs without creating unapproved allocations', () => {
  for (const income of ['1000', '1500']) {
    const store = createMilfiStore();
    assert.equal(save(store, command('monthly-plan', { income })).ok, true);
    const view = summary(store);
    assert.equal(view.monthly.income, income);
    assert.equal(view.calculation.status, 'decision_required');
    assert.equal(view.calculation.distribution, undefined);
    assert.deepEqual(store.getState().controlMovements, []);
  }
  assert.equal(prepareFiorellaDemo(command('monthly-plan', { appliedFixedExpense: '1500.001' })).ok, false);
});

test('GF blanks and registered zero have different completeness and comparison states', () => {
  const store = createMilfiStore();
  assert.equal(save(store, command('fixed-budget', { budgetAmount: '', actualAmount: '0' })).ok, true);
  const view = summary(store);
  assert.equal(view.budget.amount, null);
  assert.equal(view.actual.amount, '0');
  assert.equal(view.actual.registered, 1);
  assert.equal(view.actual.status, 'partial');
  assert.equal(view.fixedComparison.status, 'unavailable');
  assert.equal(prepareFiorellaDemo(command('fixed-budget', { budgetAmount: '', actualAmount: '' })).ok, false);
});

test('GF differences show exact excess without clamping, redistributing or applying a deficit policy', () => {
  assert.deepEqual(moneyDifference('45.1', '50.05'), { status: 'over', amount: '4.95' });
  assert.deepEqual(moneyDifference('50.05', '45.1'), { status: 'remaining', amount: '4.95' });
  assert.deepEqual(moneyDifference('0', '0'), { status: 'equal', amount: '0' });
  const store = createMilfiStore();
  assert.equal(save(store, command('fixed-budget', { budgetAmount: '2000', actualAmount: '2100.001' })).ok, true);
  assert.equal(summary(store).budget.amount, '2000');
  assert.equal(summary(store).calculation.status, 'incomplete');
  assert.equal(summary(store).requiresRoundingDecision, true);
});

test('all GF subcategories can have independent budgets and monthly aggregate actuals', () => {
  const store = createMilfiStore();
  for (const category of FIXED_SUBCATEGORIES) assert.equal(save(store, command('fixed-budget', { categoryId: category.id, budgetAmount: '1.01', actualAmount: '0' })).ok, true);
  assert.equal(summary(store).budget.amount, '19.19');
  assert.equal(summary(store).actual.amount, '0');
  assert.equal(summary(store).budget.status, 'complete');
  assert.equal(summary(store).actual.status, 'complete');
});

test('GF unique period/category keys prevent duplicate budgets even with fresh IDs', () => {
  const store = createMilfiStore();
  const original = command('fixed-budget');
  save(store, original);
  assert.deepEqual(save(store, command('fixed-budget')).errors, ['DUPLICATE_PERIOD_CATEGORY']);
  assert.equal(store.getState().fiorellaDemoRecords.length, 1);
  assert.equal(save(store, command('fixed-budget', { categoryId: 'bienestar-gym' })).ok, true);
  assert.equal(save(store, command('fixed-budget', { categoryId: 'transporte-gym' })).ok, true);
});

test('revisions replace a record once and preserve immutable before/after session audit', () => {
  const store = createMilfiStore();
  const first = command('fixed-budget');
  const result = save(store, first);
  const edit = { ...first, expectedRevision: 1, eventId: 'edit-event', actualAmount: '20.005' };
  assert.equal(save(store, edit).ok, true);
  const state = store.getState();
  assert.equal(state.fiorellaDemoRecords.length, 1);
  assert.equal(state.fiorellaDemoRecords[0].revision, 2);
  assert.equal(state.fiorellaDemoEvents.length, 2);
  assert.equal(state.fiorellaDemoEvents[1].before.actualAmount, '50.05');
  assert.equal(state.fiorellaDemoEvents[1].after.actualAmount, '20.005');
  result.value.actualAmount = '999'; result.event.after.actualAmount = '999';
  assert.equal(state.fiorellaDemoEvents[0].after.actualAmount, '50.05');
  assert.deepEqual(save(store, { ...edit, expectedRevision: 2, eventId: 'noop' }).unchanged, true);
  assert.equal(store.getState().fiorellaDemoEvents.length, 2);
});

test('stale revisions, reused record IDs, event IDs and backdated edits are rejected atomically', () => {
  const store = createMilfiStore();
  const initial = command('fixed-budget');
  save(store, initial);
  for (const edit of [
    { ...initial, actualAmount: '4' },
    command('variable-expense', { id: initial.id }),
    command('monthly-plan', { eventId: initial.eventId }),
    { ...initial, actualAmount: '4', expectedRevision: 1, eventId: 'backdated', occurredAt: '2036-02-27T00:00:00.000Z' },
  ]) {
    const before = store.getState();
    assert.equal(save(store, edit).ok, false);
    assert.equal(store.getState(), before);
  }
});

test('GV uses only Salud/Ocio and accumulates exact category totals without touching allocations', () => {
  const store = createMilfiStore();
  save(store, command('monthly-plan'));
  save(store, command('variable-expense', { amount: '0.1' }));
  save(store, command('variable-expense', { amount: '0.2' }));
  save(store, command('variable-expense', { categoryId: 'ocio', amount: '600.005' }));
  const view = summary(store);
  assert.equal(view.categories[0].executed.amount, '0.3');
  assert.equal(view.categories[1].executed.amount, '600.005');
  assert.equal(view.categories[1].comparison.status, 'over');
  assert.ok(view.categories.every(category => category.allocation === '564.202'));
});

test('GV can register before monthly data without inventing budgets or distribution', () => {
  const store = createMilfiStore();
  assert.equal(save(store, command('variable-expense')).ok, true);
  assert.equal(summary(store).categories[0].executed.amount, '12.34');
  assert.equal(summary(store).categories[0].allocation, null);
  assert.equal(summary(store).categories[0].comparison.status, 'unavailable');
});

test('GV duplicate-looking content needs explicit acknowledgment while repeat IDs cannot duplicate money', () => {
  const store = createMilfiStore();
  const first = command('variable-expense');
  save(store, first);
  assert.equal(save(store, first).ok, false);
  assert.deepEqual(save(store, command('variable-expense')).errors, ['POSSIBLE_DUPLICATE_EXPENSE']);
  assert.equal(save(store, command('variable-expense', { allowSimilar: true })).ok, true);
  assert.equal(summary(store).categories[0].executed.amount, '24.68');
  assert.equal(store.getState().fiorellaDemoEvents[1].similarExpenseAcknowledged, true);
});

test('GV edits replace execution totals rather than adding another expense', () => {
  const store = createMilfiStore();
  const first = command('variable-expense'); save(store, first);
  assert.equal(save(store, { ...first, eventId: 'edit-gv', expectedRevision: 1, amount: '2.01' }).ok, true);
  assert.equal(summary(store).categories[0].executed.amount, '2.01');
  assert.equal(summary(store).variable.length, 1);
});

test('periods distinguish years, allow leap days and reject invalid or mismatched dates', () => {
  assert.equal(periodKey({ year: 1, month: 1 }), '0001-01');
  assert.equal(periodKey({ year: 9999, month: 12 }), '9999-12');
  assert.equal(prepareFiorellaDemo(command('variable-expense')).ok, true);
  for (const fields of [
    { effectiveDate: '2035-02-29', period: { year: 2035, month: 2 } },
    { effectiveDate: '2036-03-01' }, { effectiveDate: '29/02/2036' },
    { period: { year: 2036, month: 13 } }, { period: null },
  ]) assert.equal(prepareFiorellaDemo(command('variable-expense', fields)).ok, false);
});

test('moving an existing GV record to another period stays blocked for explicit future review', () => {
  const store = createMilfiStore(); const first = command('variable-expense'); save(store, first);
  assert.deepEqual(save(store, { ...first, expectedRevision: 1, eventId: 'move', period: { year: 2036, month: 3 }, effectiveDate: '2036-03-01' }).errors, ['PERIOD_CHANGE_REQUIRES_REVIEW']);
});

test('contracts reject malformed, negative, nonfinite and locale-guessed money', () => {
  for (const value of ['-1', 'NaN', 'Infinity', '1,25', '$2', '2+', {}, 12, undefined]) {
    assert.equal(prepareFiorellaDemo(command('fixed-budget', { actualAmount: value })).ok, false);
    assert.equal(prepareFiorellaDemo(command('variable-expense', { amount: value })).ok, false);
  }
  for (const input of [null, {}, command('variable-expense', { description: 12 }), command('variable-expense', { description: 'x'.repeat(301) }), command('fixed-budget', { categoryId: 'ropa' }), command('variable-expense', { categoryId: 'gustos' })]) {
    assert.doesNotThrow(() => prepareFiorellaDemo(input));
    assert.equal(prepareFiorellaDemo(input).ok, false);
  }
});

test('real origin and confirmed financial declarations cannot enter demo storage or audit', () => {
  const store = createMilfiStore();
  for (const fields of [{ origin: 'real' }, { validationStatus: 'confirmed' }, { currency: 'USD' }, { currency: null }, { moduleId: 'control-mf' }, { ownerId: 'milton' }]) assert.equal(save(store, command('monthly-plan', fields)).ok, false);
  assert.deepEqual(store.getState().fiorellaDemoRecords, []);
  assert.deepEqual(store.getState().fiorellaDemoEvents, []);
});

test('session periods are dynamic and data does not leak across months or years', () => {
  const store = createMilfiStore();
  save(store, command('fixed-budget'));
  save(store, command('fixed-budget', { period: { year: 2037, month: 2 }, budgetAmount: '1', actualAmount: '2' }));
  assert.equal(summary(store).budget.amount, '45.1');
  assert.equal(summarizeFiorella(store.getState().fiorellaDemoRecords, { year: 2037, month: 2 }).budget.amount, '1');
  // The month is shared with Control: see periodStore in the Control tests.
  const months = createPeriodStore();
  assert.equal(months.getState().selectPeriod('2037-02'), true);
  assert.equal(months.getState().selectPeriod('2037-13'), false);
  assert.equal(months.getState().selectedPeriod, '2037-02');
});

test('history groups demo records and independent scenarios by period with chronological audit', () => {
  const store = createMilfiStore();
  save(store, command('fixed-budget'));
  save(store, command('monthly-plan', { period: { year: 2037, month: 2 } }));
  store.getState().saveSimulation({ id: 'scenario', period, income: '4000', fixedExpense: '1500', createdAt: '2036-02-28T12:00:00.000Z' });
  const state = store.getState();
  const groups = fiorellaHistory(state.fiorellaDemoRecords, state.fiorellaDemoEvents, state.simulations);
  assert.deepEqual(groups.map(group => group.key), ['2037-02', '2036-02']);
  assert.equal(groups[1].records.length, 1); assert.equal(groups[1].simulations.length, 1); assert.equal(groups[1].events.length, 1);
});

test('demonstrations and scenarios never contaminate real Fiorella or Control and reset in a new session', () => {
  const store = createMilfiStore();
  for (const kind of ['monthly-plan', 'fixed-budget', 'variable-expense']) save(store, command(kind));
  const state = store.getState();
  assert.deepEqual(state.fiorellaRecords, []); assert.deepEqual(state.controlMovements, []); assert.deepEqual(state.simulations, []);
  const real = { ...state.fiorellaDemoRecords[0], origin: 'real', income: '999999' };
  assert.equal(summarizeFiorella([real], period).monthly, null);
  assert.deepEqual(fiorellaHistory([real], state.fiorellaDemoEvents, []), []);
  const fresh = createMilfiStore().getState();
  assert.deepEqual(fresh.fiorellaDemoRecords, []); assert.deepEqual(fresh.fiorellaDemoEvents, []);
});

test('session snapshots detach caller periods, returned records and audit events', () => {
  const input = command('fixed-budget', { period: { year: 2036, month: 2 } });
  const result = prepareFiorellaDemo(input);
  input.period.month = 3;
  result.value.period.month = 4;
  result.value.budgetAmount = '999';
  assert.deepEqual(result.event.after.period, { year: 2036, month: 2 });
  assert.equal(result.event.after.budgetAmount, '45.1');
});

test('GV accepts explicit zero and exact fractions at supported calendar boundaries', () => {
  for (const [year, date] of [[1, '0001-01-01'], [9999, '9999-01-31']]) {
    const result = prepareFiorellaDemo(command('variable-expense', { period: { year, month: 1 }, effectiveDate: date, amount: '0' }));
    assert.equal(result.ok, true);
    const view = summarizeFiorella([result.value], { year, month: 1 });
    assert.equal(view.categories[0].executed.amount, '0');
    assert.equal(view.categories[0].executed.registered, 1);
  }
  const result = prepareFiorellaDemo(command('variable-expense', { amount: '0.000000000000000001' }));
  assert.equal(summarizeFiorella([result.value], period).categories[0].executed.amount, '0.000000000000000001');
  assert.equal(summarizeFiorella([result.value], period).requiresRoundingDecision, true);
});
