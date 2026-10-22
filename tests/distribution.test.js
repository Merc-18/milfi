import assert from 'node:assert/strict';
import test from 'node:test';
import { FINANCIAL_RULES } from '../src/domain/financialRules.js';
import { calculateDistribution } from '../src/domain/distribution.js';
import { normalizeAmount } from '../src/domain/amounts.js';

test('official configuration and categories are immutable', () => {
  assert.deepEqual(FINANCIAL_RULES, {
    version: 'fiorella-official-v1', source: 'fiorella-configuration-2026', fixedExpenseCap: '1500',
    variablePercentage: 40, savingsPercentage: 60, personalSavingsPercentage: 60, coupleSavingsPercentage: 40,
    variableCategories: [{ id: 'salud', name: 'Salud', percentage: 50 }, { id: 'ocio', name: 'Ocio', percentage: 50 }],
  });
  assert.throws(() => { FINANCIAL_RULES.variablePercentage = 41; }, TypeError);
  assert.throws(() => { FINANCIAL_RULES.variableCategories[0].percentage = 51; }, TypeError);
  assert.throws(() => { FINANCIAL_RULES.variableCategories.push({}); }, TypeError);
});

test('approved distribution uses 50/50 variable categories and 60/40 savings', () => {
  assert.deepEqual(calculateDistribution({ income: '4000', fixedExpense: '1500' }), {
    status: 'calculated', requiresRoundingDecision: false,
    distribution: {
      rulesVersion: FINANCIAL_RULES.version, income: '4000', fixedExpense: '1500', surplus: '2500',
      variable: { total: '1000', categories: { salud: '500', ocio: '500' } },
      savings: { total: '1500', personal: '900', couple: '600' },
    },
  });
});

test('exact decimal arithmetic preserves fractional cents without choosing rounding', () => {
  const result = calculateDistribution({ income: '4000.01', fixedExpense: '1500' });
  assert.equal(result.requiresRoundingDecision, true);
  assert.deepEqual(result.distribution.variable, { total: '1000.004', categories: { salud: '500.002', ocio: '500.002' } });
  assert.deepEqual(result.distribution.savings, { total: '1500.006', personal: '900.0036', couple: '600.0024' });
});

test('small amounts conserve the exact approved shares', () => {
  const result = calculateDistribution({ income: '0.03', fixedExpense: '0' });
  assert.equal(result.distribution.savings.total, '0.018');
  assert.equal(result.distribution.savings.personal, '0.0108');
  assert.equal(result.distribution.savings.couple, '0.0072');
});

test('valid long input remains exact when percentages add decimal places', () => {
  const income = '9'.repeat(100);
  const result = calculateDistribution({ income, fixedExpense: '0' });
  assert.equal(result.status, 'calculated');
  assert.equal(result.distribution.income, income);
  assert.equal(typeof result.distribution.savings.couple, 'string');
});

test('deficit and zero surplus require decisions and produce no allocations', () => {
  for (const [income, reason] of [['1000', 'DEFICIT_POLICY_PENDING'], ['1500', 'ZERO_SURPLUS_POLICY_PENDING']]) {
    assert.deepEqual(calculateDistribution({ income, fixedExpense: '1500' }), { status: 'decision_required', reason });
  }
});

test('negative fixed expense cannot inflate the distribution; exceeding the cap is not silently clamped', () => {
  assert.deepEqual(calculateDistribution({ income: '1000', fixedExpense: '-500' }), { status: 'invalid', issues: ['INVALID_FIXED_EXPENSE'] });
  assert.deepEqual(calculateDistribution({ income: '4000', fixedExpense: '1500.01' }), { status: 'invalid', issues: ['FIXED_EXPENSE_ABOVE_CAP'] });
});

test('blank input is not converted into zero', () => {
  assert.deepEqual(calculateDistribution({ income: '', fixedExpense: '1500' }), { status: 'incomplete' });
  assert.deepEqual(calculateDistribution({ income: '4000', fixedExpense: '' }), { status: 'incomplete' });
});

test('amount validation rejects non-finite values, coercions, currency guesses and open amounts', () => {
  for (const input of [NaN, Infinity, -Infinity, null, undefined, true, {}, [], '-1', '1e3', '$100', '100+', '1,000', '0x10', '9'.repeat(101)]) {
    assert.equal(normalizeAmount(input), null);
    assert.equal(calculateDistribution({ income: input, fixedExpense: '0' }).status, 'invalid');
  }
  assert.equal(normalizeAmount(' 00012.3400 '), '12.34');
  assert.equal(normalizeAmount(0), '0');
});

test('exact allocations conserve income and all parent totals over a range of synthetic cases', () => {
  const units = value => {
    const [whole, fractional = ''] = value.split('.');
    return BigInt(whole) * 1000000n + BigInt(fractional.padEnd(6, '0'));
  };
  for (let cents = 1; cents <= 300; cents++) {
    const income = `1500.${String(cents).padStart(3, '0')}`;
    const d = calculateDistribution({ income, fixedExpense: '1500' }).distribution;
    assert.equal(units(d.income), units(d.fixedExpense) + units(d.variable.total) + units(d.savings.total));
    assert.equal(units(d.variable.total), units(d.variable.categories.salud) + units(d.variable.categories.ocio));
    assert.equal(units(d.savings.total), units(d.savings.personal) + units(d.savings.couple));
  }
});
