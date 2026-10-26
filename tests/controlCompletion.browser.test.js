import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromiumPath, openBrowser } from './helpers/chromium.js';
import { prepareControlEntry, prepareControlEntryReview } from '../src/domain/controlLedger.js';
import { APPROVED_ACCESS } from '../src/domain/access.js';

const householdId = 'completion-household';
const jan = { year: 2031, month: 1 };
const feb = { year: 2031, month: 2 };
function record(fields, pending = false) {
  const prepared = prepareControlEntry({ id: crypto.randomUUID(), operationId: crypto.randomUUID(), householdId, expectedRevision: 0,
    actorId: 'milton', kind: 'deposit', purpose: 'savings', currency: 'PEN', amount: '10', contributorId: 'fiorella',
    effectiveDate: '2031-02-10', period: feb, planPeriod: jan, description: 'Movimiento inventado', provenanceNote: 'Prueba sintética', ...fields });
  assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  const saved = { ...prepared.value, revision: 1 };
  if (pending) return saved;
  const reviewed = prepareControlEntryReview({ id: saved.id, expectedRevision: 1, decision: 'accepted', reviewedBy: 'milton', reason: 'Prueba', evidenceReference: 'Inventado' }, [saved]);
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.errors));
  return { ...saved, manualReviews: [{ ...reviewed.review, id: crypto.randomUUID(), reviewedBy: 'milton', reviewedAt: '2031-02-20T00:00:00.000Z', evidenceReference: 'Inventado' }] };
}

test('Control completion in browser: currency balances, charts and contribution history only', { timeout: 60000 }, async context => {
  const fixture = { householdId, fiorella: { ok: true, records: [], goals: [] }, control: { ok: true, records: [
    record({ amount: '30', period: jan, effectiveDate: '2031-01-10' }), record({ amount: '70.25' }),
    record({ amount: '30.4', currency: 'USD' }), record({ amount: '10.1', kind: 'withdrawal', contributorId: null }),
    record({ amount: '5.1', currency: 'USD', kind: 'withdrawal', contributorId: null }),
    record({ amount: '12', contributorId: 'milton', purpose: 'expenses' }),
    record({ amount: '7', contributorId: 'milton', purpose: 'expenses', currency: 'USD' }), record({ amount: '900' }, true),
  ] } };
  const profile = await mkdtemp(join(tmpdir(), 'milfi-control-completion-'));
  const server = await createServer({ envDir: new URL('./fixtures/no-env/', import.meta.url).pathname, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false } });
  let browser;
  try {
    await server.listen();
    browser = await openBrowser(await chromiumPath(), profile);
    await browser.page('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/harness/persisted.html` });
    await browser.waitFor('typeof window.mountMilfi === "function"');
    const mount = async identity => {
      await browser.evaluate(`window.mountMilfi(${JSON.stringify({ fixture, identity, access: APPROVED_ACCESS[identity], path: '/control', period: '2031-02' })})`);
      await browser.waitFor('!!document.querySelector("[data-testid=control-contributions]") && !document.body.textContent.includes("Cargando")');
    };
    await mount('milton');

    await context.test('two balances and two charts keep PEN/USD independent, monthly amounts stay separate', async () => {
      const view = await browser.evaluate(`({ balance: document.querySelector('[data-testid=control-balance]').textContent,
        pen: document.querySelector('[data-currency-chart=PEN] svg').getAttribute('aria-label'),
        usd: document.querySelector('[data-currency-chart=USD] svg').getAttribute('aria-label'),
        monthly: document.querySelector('[data-testid=control-monthly] [data-month="2031-02"]').textContent,
        penPoints: document.querySelectorAll('[data-currency-chart=PEN] svg circle').length,
        usdPoints: document.querySelectorAll('[data-currency-chart=USD] svg circle').length })`);
      assert.ok(view.balance.includes('S/ 90.15') && view.balance.includes('US$ 25.30'));
      assert.ok(view.pen.includes('S/ 90.15') && !view.pen.includes('USD'));
      assert.ok(view.usd.includes('US$ 25.30') && !view.usd.includes('PEN'));
      assert.deepEqual([view.penPoints, view.usdPoints], [1, 1]);
      assert.ok(view.monthly.includes('S/ 70.25') && view.monthly.includes('US$ 30.40'));
      assert.doesNotMatch(view.balance, /900\.00|115\.45/);
    });
    await context.test('history separates contributors, currencies and destinations and retains cumulative monthly deposits', async () => {
      const groups = await browser.evaluate(`Array.from(document.querySelectorAll('[data-contribution-group]')).map(el => ({ key: el.dataset.contributionGroup, text: el.textContent }))`);
      assert.equal(groups.length, 4);
      const fiorella = groups.find(group => group.key === 'fiorella:PEN:savings').text;
      assert.ok(fiorella.includes('S/ 100.25') && fiorella.includes('S/ 70.25'));
      assert.doesNotMatch(fiorella, /90\.15|900\.00/);
      assert.ok(groups.find(group => group.key === 'fiorella:USD:savings').text.includes('US$ 30.40'));
      assert.ok(groups.find(group => group.key === 'milton:PEN:expenses').text.includes('S/ 12.00'));
      assert.ok(groups.find(group => group.key === 'milton:USD:expenses').text.includes('US$ 7.00'));
      for (const width of [360, 1280]) {
        await browser.page('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 });
        assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth && document.querySelector("main").scrollWidth <= document.querySelector("main").clientWidth + 1'), true);
      }
    });
    await context.test('Fiorella can read the same history without write actions', async () => {
      await mount('fiorella');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-contribution-group]").length'), 4);
      assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("button")).some(button => button.textContent === "Registrar movimiento")'), false);
      assert.deepEqual(browser.exceptions, []);
    });
  } finally {
    if (browser) await browser.close();
    await server.close();
    await rm(profile, { recursive: true, force: true });
  }
});
