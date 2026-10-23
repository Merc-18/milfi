import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareSimulation } from '../src/application/simulations.js';
import { prepareSavingsGoal } from '../src/application/savingsGoals.js';
import { compareGoalCapacity, compareScenarios, estimateSavingsGoal, projectScenarios } from '../src/domain/savingsPlanning.js';
import { moneyDifference, summarizeFiorella } from '../src/domain/fiorellaSession.js';
import { FIXED_SUBCATEGORIES } from '../src/domain/fiorellaCategories.js';
import { periodDraftState } from '../src/presentation/periodDraft.js';
import { createMilfiStore } from '../src/store/useStore.js';
import { validateEnvelope } from '../src/domain/models.js';

// Invented input data only, never taken from workbook examples.
let sequence = 0;
const period = { year: 2040, month: 1 };
const scenario = (overrides = {}) => prepareSimulation({ id: `scenario-${++sequence}`, period,
  income: '4000', fixedExpense: '1500', createdAt: '2040-01-01T12:00:00.000Z', ...overrides }).value;
const goal = (overrides = {}) => ({ id: `goal-${++sequence}`, expectedRevision: 0, title: 'Objetivo sintético',
  target: '1200', months: '2', occurredAt: '2040-01-01T12:00:00.000Z', ...overrides });
const fixed = (categoryId, budgetAmount, actualAmount) => ({ id: categoryId, moduleId: 'fiorella',
  origin: 'simulated', validationStatus: 'pending', period, kind: 'fixed-budget', categoryId, budgetAmount, actualAmount });

test('period draft accepts intermediate edits without changing applied data or warning per key', () => {
  for (const draft of ['', '2', '204', '2040-', '2040-0', '2040-13', '0000-01']) {
    assert.deepEqual(periodDraftState(draft, '2039-12'), { valid: false, applied: '2039-12', showError: false });
    assert.equal(periodDraftState(draft, '2039-12', true).showError, true);
  }
  assert.deepEqual(periodDraftState('2040-01', '2039-12'), { valid: true, applied: '2040-01', showError: false });
  for (const draft of ['0001-01', '9999-12']) assert.equal(periodDraftState(draft, '2040-01').valid, true);
});

test('different GF coverage never produces a misleading total difference', () => {
  const result = summarizeFiorella([fixed('servicios-gas', '80', null), fixed('servicios-luz', null, '30')], period);
  assert.equal(result.budget.amount, '80'); assert.equal(result.actual.amount, '30');
  assert.equal(result.fixedCoverage.matched, 0);
  assert.deepEqual(result.fixedComparison, { status: 'unavailable', amount: null, reason: 'INCOMPLETE_FIXED_DETAIL' });
});

test('matching but partial GF detail still marks global information incomplete while row differences stay exact', () => {
  const result = summarizeFiorella([fixed('servicios-gas', '80.01', '80.03')], period);
  assert.equal(result.fixedCoverage.matched, 1);
  assert.equal(result.fixedComparison.status, 'unavailable');
  assert.deepEqual(moneyDifference('80.01', '80.03'), { status: 'over', amount: '0.02' });
});

test('only complete aligned GF detail permits a global comparison, including registered zero', () => {
  const records = FIXED_SUBCATEGORIES.map(category => fixed(category.id, '1', '0'));
  const complete = summarizeFiorella(records, period);
  assert.equal(complete.fixedCoverage.matched, 19);
  assert.deepEqual(complete.fixedComparison, { status: 'remaining', amount: '19' });
  records[0].actualAmount = null;
  assert.equal(summarizeFiorella(records, period).fixedComparison.status, 'unavailable');
});

test('scenario comparison recomputes all eight metrics from the official engine', () => {
  const first = scenario(); const second = scenario({ income: '5000', fixedExpense: '1000' });
  const compared = compareScenarios(first, second);
  assert.equal(compared.status, 'compared'); assert.equal(compared.rows.length, 8);
  assert.deepEqual(compared.rows.find(row => row.key === 'savings.couple'), { key: 'savings.couple', label: 'Ahorro de pareja', left: '600', right: '960', direction: 'higher', difference: '360' });
  assert.equal(compared.rows.find(row => row.key === 'fixedExpense').direction, 'lower');
  first.distribution.savings.couple = '999999';
  assert.equal(compareScenarios(first, second).rows.find(row => row.key === 'savings.couple').left, '600');
});

test('comparison does not add alternatives and rejects same, real, rejected or unresolved scenarios', () => {
  const first = scenario();
  assert.deepEqual(compareScenarios(first, first), { status: 'blocked', reason: 'SAME_SCENARIO' });
  for (const invalid of [null, { ...first, origin: 'real' }, { ...first, validationStatus: 'confirmed' },
    { ...first, distribution: { income: '1000', fixedExpense: '1500' } },
    { ...first, distribution: { income: '1500', fixedExpense: '1500' } },
    { ...first, distribution: { income: '5000', fixedExpense: '1500.01' } }]) {
    assert.equal(compareScenarios(first, invalid).status, 'blocked');
  }
});

test('fractional cents remain exact and explicitly pending in scenario comparisons', () => {
  const result = compareScenarios(scenario(), scenario({ income: '4000.01' }));
  assert.equal(result.requiresRoundingDecision, true);
  assert.equal(result.rows.find(row => row.key === 'savings.couple').right, '600.0024');
  assert.equal(result.rows.find(row => row.key === 'savings.couple').difference, '0.0024');
});

test('projections sum only explicitly selected unique periods, in chronological order', () => {
  const first = scenario(); const second = scenario({ period: { year: 2040, month: 2 } });
  const before = structuredClone([second, first]);
  const result = projectScenarios([second, first]);
  assert.equal(result.status, 'projected'); assert.equal(result.couple, '1200'); assert.equal(result.personal, '1800');
  assert.equal(result.rows[0].period.month, 1); assert.equal(result.rows[1].cumulativeCouple, '1200');
  assert.deepEqual([second, first], before);
});

test('projection blocks alternatives for the same month and repeated IDs without picking a winner', () => {
  const first = scenario(); const alternative = scenario({ income: '5000' });
  assert.equal(projectScenarios([first, alternative]).reason, 'ALTERNATIVES_SHARE_PERIOD');
  assert.equal(projectScenarios([first, first]).reason, 'DUPLICATE_SCENARIO');
  assert.equal(projectScenarios([]).status, 'incomplete');
});

test('an unresolved selected month blocks the total rather than silently using a partial projection', () => {
  const first = scenario();
  const unresolved = { ...scenario({ period: { year: 2040, month: 2 } }), distribution: { income: '1', fixedExpense: '1500' } };
  const result = projectScenarios([first, unresolved]);
  assert.equal(result.status, 'blocked'); assert.equal(result.couple, undefined);
});

test('Excel-backed inverse goal uses target/months and fixed-GF official savings rate exactly', () => {
  const result = estimateSavingsGoal(goal());
  assert.equal(result.status, 'estimated');
  assert.deepEqual(result.monthlyContribution, { numerator: '600', denominator: '1', decimal: '600' });
  assert.deepEqual(result.requiredIncome, { numerator: '4000', denominator: '1', decimal: '4000' });
  assert.equal(result.assumedFixedExpense, '1500'); assert.equal(result.requiresRoundingDecision, false);
});

test('nonterminating division is an exact fraction, never a made-up rounded payment', () => {
  const result = estimateSavingsGoal({ target: '1', months: '3' });
  assert.deepEqual(result.monthlyContribution, { numerator: '1', denominator: '3', decimal: null });
  assert.deepEqual(result.requiredIncome, { numerator: '27025', denominator: '18', decimal: null });
  assert.equal(result.requiresRoundingDecision, true);
});

test('half-cent and long decimal goals are preserved without floats, fees or interest', () => {
  const result = estimateSavingsGoal({ target: '0.01', months: '2' });
  assert.equal(result.monthlyContribution.decimal, '0.005'); assert.equal(result.requiresRoundingDecision, true);
  const long = estimateSavingsGoal({ target: '0.000000000000000001', months: '1' });
  assert.equal(long.monthlyContribution.decimal, '0.000000000000000001');
});

test('invalid target/months are blocked instead of copying Excel IFERROR zero', () => {
  for (const input of [null, {}, { target: '-1', months: '1' }, { target: '0', months: '1' },
    { target: '2', months: '0' }, { target: '2', months: '1.5' }, { target: '2', months: '-2' },
    { target: '2', months: '9007199254740992' }, { target: '2,5', months: '3' }, { target: '2', months: 'Infinity' }]) {
    assert.doesNotThrow(() => estimateSavingsGoal(input)); assert.equal(estimateSavingsGoal(input).status, 'invalid');
  }
  assert.equal(estimateSavingsGoal({ target: '', months: '1' }).status, 'incomplete');
});

test('goal capacity uses couple savings only and preserves surplus/shortfall as exact comparisons', () => {
  const records = [scenario(), scenario({ period: { year: 2040, month: 2 } })];
  const result = compareGoalCapacity(goal(), records);
  assert.equal(result.status, 'compared'); assert.equal(result.outcome, 'equal');
  assert.equal(result.capacity, '1200'); assert.equal(result.personalExcluded, '1800');
  assert.equal(compareGoalCapacity(goal({ target: '1300' }), records).difference, '100');
  assert.equal(compareGoalCapacity(goal({ target: '1100' }), records).outcome, 'above');
});

test('goal comparison never invents missing periods or deadlines from a month count', () => {
  assert.equal(compareGoalCapacity(goal(), [scenario()]).reason, 'HORIZON_MISMATCH');
  const nonconsecutive = [scenario(), scenario({ period: { year: 2040, month: 3 } })];
  assert.equal(projectScenarios(nonconsecutive).couple, '1200');
  assert.equal(compareGoalCapacity(goal(), nonconsecutive).reason, 'GOAL_TIMELINE_PENDING');
  assert.equal(estimateSavingsGoal(goal()).deadline, undefined);
});

test('goals are pending session scenarios with valid envelopes, never real financial records', () => {
  const result = prepareSavingsGoal(goal());
  assert.equal(result.ok, true); assert.deepEqual(validateEnvelope(result.value), []);
  assert.equal(result.value.origin, 'simulated'); assert.equal(result.value.validationStatus, 'pending');
  assert.equal(result.value.scope, 'couple'); assert.equal(result.value.actorId, null);
  for (const changes of [{ origin: 'real' }, { validationStatus: 'confirmed' }, { currency: 'USD' }, { scope: 'personal' }, { moduleId: 'control-mf' }]) {
    assert.equal(prepareSavingsGoal(goal(changes)).ok, false);
  }
  assert.equal(compareGoalCapacity(goal({ origin: 'real' }), []).status, 'blocked');
});

test('goal edits honor revision, preserve original creation time and cannot overwrite stale changes', () => {
  const input = goal(); const original = prepareSavingsGoal(input).value;
  const edit = { ...input, title: 'Objetivo sintético editado', expectedRevision: 1, occurredAt: '2040-01-02T12:00:00.000Z' };
  const result = prepareSavingsGoal(edit, original);
  assert.equal(result.value.revision, 2); assert.equal(result.value.createdAt, original.createdAt);
  assert.equal(prepareSavingsGoal(edit, result.value).ok, false);
  assert.equal(prepareSavingsGoal({ ...edit, expectedRevision: 2 }, result.value).unchanged, true);
  assert.equal(prepareSavingsGoal({ ...edit, expectedRevision: 2, occurredAt: '2039-01-01T12:00:00.000Z' }, result.value).ok, false);
});

test('goal contracts reject invalid titles, timestamps and malformed commands without throwing', () => {
  for (const input of [null, {}, goal({ id: 12 }), goal({ title: '' }), goal({ title: 'x'.repeat(121) }), goal({ occurredAt: 'not-a-time' }), goal({ expectedRevision: -1 })]) {
    assert.doesNotThrow(() => prepareSavingsGoal(input)); assert.equal(prepareSavingsGoal(input).ok, false);
  }
});

test('planning stays isolated from Fiorella records, demo budgets and Control and vanishes in a fresh store', () => {
  const store = createMilfiStore();
  const input = goal(); const result = store.getState().saveSavingsGoal(input);
  assert.equal(result.ok, true); result.value.target = '999999';
  assert.equal(store.getState().savingsGoals[0].target, '1200');
  assert.equal(store.getState().saveSavingsGoal(input).ok, false);
  assert.deepEqual(store.getState().fiorellaRecords, []); assert.deepEqual(store.getState().controlMovements, []);
  assert.deepEqual(store.getState().fiorellaDemoRecords, []); assert.deepEqual(store.getState().simulations, []);
  assert.deepEqual(createMilfiStore().getState().savingsGoals, []);
  assert.doesNotThrow(() => store.getState().saveSavingsGoal({ id: 12 }));
});
