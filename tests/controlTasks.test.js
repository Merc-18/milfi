import assert from 'node:assert/strict';
import test from 'node:test';
import { assignmentText, commitmentLight, coupleSavingsLight, monthlyRows, planSuggestion, planText, reviewTasks, tasksText, usdSavings }
  from '../src/presentation/controlLedgerView.js';

// Invented entries (record + ledger status), as inspectLedger returns them.
let sequence = 0;
const entry = (fields, status = 'reviewed', pendingReasons = []) => ({ status, pendingReasons, errors: [], record: { id: `t${++sequence}`,
  kind: 'deposit', purpose: 'savings', currency: 'PEN', contributorId: 'fiorella', amount: '744', period: { year: 2031, month: 7 },
  effectiveDate: '2031-07-03', planPeriod: null, description: null, provenance: { type: 'control-manual' }, ...fields } });
const plans = new Map([['2031-06', { amount: '744', projected: false }], ['2031-07', { amount: '408', projected: false }]]);

test('tasks: a deposit whose previous month has a Fiorella plan is a task; one without that plan is listed apart', () => {
  const withPlan = entry({});
  const beforeFiorella = entry({ period: { year: 2031, month: 1 }, effectiveDate: '2031-01-05' });
  const pending = entry({ amount: '900' }, 'pending', ['UNRESOLVED_MONEY']);
  const pendingWithoutPlan = entry({ period: { year: 2031, month: 1 } }, 'pending', ['IMPORT_REVIEW_REQUIRED']);
  const tasks = reviewTasks([withPlan, beforeFiorella, pending, pendingWithoutPlan, entry({ planPeriod: { year: 2031, month: 6 } })], plans);
  assert.deepEqual(tasks.withoutPlan.map(item => item.entry), [withPlan]);
  assert.deepEqual(tasks.noPlan.map(item => item.entry), [beforeFiorella]);
  assert.deepEqual(tasks.toConfirm.map(item => item.entry), [pending, pendingWithoutPlan], 'a pending row counts once, as "por confirmar"');
  assert.equal(tasks.total, 3);
  assert.equal(tasksText(tasks), 'Tienes 3 tareas: 2 por confirmar, 1 sin mes del plan');
  assert.equal(tasksText(reviewTasks([pending], plans)), 'Tienes 1 tarea: 1 por confirmar');
  assert.equal(tasksText(reviewTasks([withPlan, entry({ amount: '1' })], plans)), 'Tienes 2 tareas: 2 sin mes del plan');
  assert.equal(reviewTasks([beforeFiorella], plans).total, 0);
});

test('suggestion: the plan of R − 1, exact only for the same PEN amount; the text names both months', () => {
  const exact = entry({});
  assert.deepEqual(planSuggestion(exact.record, plans), { period: { year: 2031, month: 6 }, amount: '744', exact: true });
  assert.equal(planSuggestion(entry({ amount: '744.01' }).record, plans).exact, false);
  assert.equal(planSuggestion(entry({ currency: 'USD' }).record, plans).exact, false);
  assert.equal(planSuggestion(entry({ period: { year: 2031, month: 1 } }).record, plans), null);
  assert.equal(assignmentText({ entry: exact, plan: planSuggestion(exact.record, plans) }),
    'S/ 744.00 recibido en julio de 2031 → plan de junio (previsto S/ 744.00)');
  const january = entry({ period: { year: 2032, month: 1 }, effectiveDate: '2032-01-04' });
  assert.equal(assignmentText({ entry: january, plan: { period: { year: 2031, month: 12 }, amount: '500' } }),
    'S/ 744.00 recibido en enero de 2032 → plan de diciembre de 2031 (previsto S/ 500.00)');
  assert.equal(assignmentText({ entry: january, plan: null }), 'S/ 744.00 recibido en enero de 2032');
});

test('dollars: none, spent without USD deposits (never a negative balance), or savings with them', () => {
  assert.equal(usdSavings([entry({})]), null);
  const spent = usdSavings([entry({ kind: 'withdrawal', currency: 'USD', amount: '263.16', contributorId: null })]);
  assert.deepEqual([spent.kind, spent.amount, spent.negative], ['spent', '263.16', undefined]);
  const saved = usdSavings([entry({ currency: 'USD', amount: '100' }), entry({ kind: 'withdrawal', currency: 'USD', amount: '130', contributorId: null })]);
  assert.deepEqual([saved.kind, saved.negative, saved.amount], ['saved', true, '30']);
  assert.equal(usdSavings([entry({ currency: 'USD', amount: '50' }, 'pending')]), null, 'pending dollars do not count');
});

test('month by month: no empty future month; a month with movements is always listed', () => {
  const current = { year: 2031, month: 7 };
  const rows = monthlyRows([entry({})], plans, current);
  assert.deepEqual(rows.map(row => row.key), ['2031-07'], 'the plan of July is received in August, which has not started');
  assert.equal(monthlyRows([entry({})], plans).some(row => row.key === '2031-08'), true, 'without a current month nothing is cut');
  const future = monthlyRows([entry({ period: { year: 2031, month: 9 }, effectiveDate: '2031-09-01' })], plans, current);
  assert.deepEqual(future.map(row => row.key), ['2031-09', '2031-07']);
});

test("Fiorella's couple savings: the current or a future month says when it is deposited; past months keep the semáforo", () => {
  const now = { year: 2031, month: 10 };
  assert.deepEqual(coupleSavingsLight(null, '408', now, now), { tone: 'neutral', light: 'gris', word: 'Se deposita en noviembre', upcoming: true });
  assert.equal(coupleSavingsLight(null, '408', { year: 2031, month: 12 }, now).word, 'Se deposita en enero de 2032');
  assert.equal(coupleSavingsLight(null, '408', { year: 2031, month: 9 }, now).word, 'Pendiente');
  assert.equal(coupleSavingsLight('408', '408', now, now).word, 'Completo');
  assert.equal(coupleSavingsLight(null, null, now, now).word, 'Sin plan');
});

test('plan text and commitment light always carry words', () => {
  const [july] = monthlyRows([entry({ planPeriod: { year: 2031, month: 6 } })], plans, { year: 2031, month: 7 });
  assert.equal(planText(july), 'S/ 744.00 de S/ 744.00 (plan de junio)');
  assert.equal(planText({ ...july, covered: null, projected: true }), 'S/ 0.00 de S/ 744.00 (plan de junio) · proyectado');
  assert.equal(planText({ ...july, plan: null }), 'S/ 744.00 asignado (plan de junio)');
  assert.equal(planText({ ...july, plan: null, covered: null }), 'Sin plan');
  assert.deepEqual(commitmentLight('700', '700'), { light: 'verde', word: 'Cumplido' });
  assert.deepEqual(commitmentLight('100', '700'), { light: 'amarillo', word: 'Parcial' });
  assert.deepEqual(commitmentLight(null, '700'), { light: 'gris', word: 'Sin aportes' });
  assert.equal(commitmentLight('700', null), null);
});
