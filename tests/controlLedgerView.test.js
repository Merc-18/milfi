import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceSeries, coveredSavings, monthlyRows, planLight, reviewQueue, reviewReasons, savingsBalance } from '../src/presentation/controlLedgerView.js';

// Invented entries (record + ledger status), as inspectLedger returns them.
let sequence = 0;
const entry = (fields, status = 'reviewed', pendingReasons = []) => ({ status, pendingReasons, record: { id: `m${++sequence}`, kind: 'deposit', purpose: 'savings',
  currency: 'PEN', amount: '100', period: { year: 2030, month: 11 }, effectiveDate: null, planPeriod: null, description: null, provenance: { type: 'control-manual' }, ...fields } });
const nov = { year: 2030, month: 11 };
const dec = { year: 2030, month: 12 };
const jan = { year: 2031, month: 1 };

test('saldo de ahorro = Σ savings deposits PEN − Σ withdrawals PEN; dollars apart; pending excluded and counted', () => {
  const entries = [entry({ amount: '300' }), entry({ amount: '50.5', status: 'imported' }, 'imported'),
    entry({ kind: 'withdrawal', amount: '120', effectiveDate: '2030-11-20' }), entry({ kind: 'withdrawal', currency: 'USD', amount: '30', effectiveDate: '2030-11-21' }),
    entry({ amount: '999' }, 'pending', ['UNRESOLVED_MONEY']), entry({ purpose: 'expenses', amount: '400' }), entry({ amount: '1' }, 'rejected')];
  const balance = savingsBalance(entries);
  assert.deepEqual([balance.negative, balance.amount, balance.deposits, balance.withdrawals, balance.usdWithdrawn, balance.pending],
    [false, '230.5', '350.5', '120', '30', 1]);
  assert.deepEqual(savingsBalance([entry({ kind: 'withdrawal', amount: '10' })]).negative, true);
  assert.equal(savingsBalance([entry({})]).usdWithdrawn, null);
});

test('balance steps: deposits raise, PEN withdrawals lower, USD never moves it, pending excluded, across the year', () => {
  const entries = [entry({ amount: '200', period: nov }), entry({ kind: 'withdrawal', amount: '50', period: null, effectiveDate: '2030-12-05', description: 'Retiro inventado' }),
    entry({ kind: 'withdrawal', currency: 'USD', amount: '20', period: null, effectiveDate: '2030-12-06' }), entry({ amount: '80', period: jan }),
    entry({ amount: '500', period: dec }, 'pending', ['IMPORT_REVIEW_REQUIRED'])];
  const series = balanceSeries(entries, { year: 2031, month: 2 });
  assert.deepEqual(series.steps.map(step => [step.key, step.balance.amount]), [['2030-11', '200'], ['2030-12', '150'], ['2031-01', '230'], ['2031-02', '230']]);
  assert.deepEqual(series.withdrawals.map(point => [point.key, point.amount, point.description]), [['2030-12', '50', 'Retiro inventado']]);
  assert.deepEqual(series.usdWithdrawals.map(point => point.amount), ['20']);
  assert.deepEqual(balanceSeries([entry({}, 'pending')]), { steps: [], withdrawals: [], usdWithdrawals: [] });
});

test('semáforo del plan: completo, parcial, pendiente y sin plan; deposits of several days assigned to one month add up', () => {
  assert.deepEqual(planLight('600', '600').word, 'Completo');
  assert.deepEqual(planLight('600.01', '600').light, 'verde');
  assert.deepEqual([planLight('0.01', '600').word, planLight('599.99', '600').light], ['Parcial', 'amarillo']);
  assert.deepEqual([planLight(null, '600').word, planLight(null, '600').light], ['Pendiente', 'gris']);
  assert.deepEqual([planLight('600', null).word, planLight(null, null).word], ['Sin plan', 'Sin plan']);
  const entries = [entry({ amount: '250', period: nov, effectiveDate: '2030-11-03', planPeriod: nov }),
    entry({ amount: '250', period: dec, effectiveDate: '2030-12-01', planPeriod: nov }),
    entry({ amount: '100', period: dec, planPeriod: dec }), entry({ amount: '40', period: dec, planPeriod: nov }, 'pending')];
  assert.equal(coveredSavings(entries, nov), '500');
  const rows = monthlyRows(entries, new Map([['2030-11', '500'], ['2030-12', '300']]));
  assert.deepEqual(rows.map(row => [row.key, row.savings[0]?.amount, row.plan, row.covered, row.light.word]),
    [['2030-12', '350', '300', '100', 'Parcial'], ['2030-11', '250', '500', '500', 'Completo']]);
});

test('reasons in plain language, with suggestions to confirm and the inverted-date warning', () => {
  const excel = (fields, original) => entry({ provenance: { type: 'control-excel', sheet: 'Hoja', row: fields.row ?? 1, original }, ...fields }, 'pending', fields.reasons ?? []);
  const dollar = excel({ kind: 'withdrawal', amount: null, currency: null, period: null, effectiveDate: '2031-02-15', reasons: ['UNRESOLVED_MONEY', 'MISSING_CONFIRMED_PERIOD'] },
    { amount: '$7.5', date: '15/02/2031' });
  assert.deepEqual(reviewReasons(dollar), { reasons: ['El monto está en dólares: confirma el importe en US$', 'Falta el mes del retiro'],
    suggestion: { amount: '7.5', currency: 'USD', period: { year: 2031, month: 2 } } });
  const inexact = excel({ kind: 'withdrawal', amount: null, currency: null, reasons: ['UNRESOLVED_MONEY'] }, { amount: '$200+' });
  assert.deepEqual(reviewReasons(inexact).reasons, ['El monto no es exacto («$200+»)']);
  const noPlan = entry({ amount: '90' }, 'imported');
  assert.deepEqual(reviewReasons(noPlan).reasons, ['Falta el mes del plan']);
  // Serial date 2031-03-05 between rows dated in January and February: day and month may be swapped.
  const rows = [excel({ kind: 'withdrawal', row: 1, effectiveDate: '2031-01-10' }, { date: '47128' }),
    excel({ kind: 'withdrawal', row: 2, effectiveDate: '2031-03-05' }, { date: '47182' }),
    excel({ kind: 'withdrawal', row: 3, effectiveDate: '2031-02-20' }, { date: '47169' })];
  assert.deepEqual(rows.map(item => reviewReasons(item, rows).reasons.includes('La fecha puede tener día y mes invertidos')), [false, true, false]);
  assert.equal(reviewQueue([...rows, noPlan, entry({ planPeriod: nov })]).length, 4);
});
