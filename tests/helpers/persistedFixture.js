import assert from 'node:assert/strict';
import { as, createDatabase, seedSynthetic } from './pgHarness.js';
import { createPgRestClient } from './pgRestClient.js';
import { syntheticControlXlsx } from './xlsxBuilder.js';
import { syntheticFiorellaXlsx } from './fiorellaFixture.js';
import { createMilfiPersistence } from '../../src/application/persistence.js';
import { readControlWorkbook } from '../../src/application/controlPreimport.js';
import { applyControlDecisions, fiorellaLoadPayload } from '../../src/application/historicalLoad.js';
import { recognizeFiorellaWorkbook } from '../../src/domain/fiorellaWorkbook.js';
import { readXlsxCapture } from '../../src/infrastructure/xlsx/workbook.js';

// Invented records that went through the real load RPC (PGlite) and the app
// adapters, ready to be served by a fake persistence in the browser harness.
export async function persistedFixture() {
  const db = await createDatabase();
  const u = await seedSynthetic(db);
  const { plan } = recognizeFiorellaWorkbook((await readXlsxCapture(syntheticFiorellaXlsx())).capture, { cutoff: '2031-02-20' });
  assert.equal((await as(db, u.fiorella, 'select public.import_fiorella_history($1::jsonb)', [JSON.stringify(fiorellaLoadPayload(plan, u.household))])).ok, true);
  const decided = applyControlDecisions(await readControlWorkbook(syntheticControlXlsx()), { reviewedBy: 'milton', resolutions: [
    { field: 'currency', value: 'PEN', match: {}, reason: 'Decisión inventada', evidenceReference: 'Acta inventada' },
    { field: 'contributorId', value: 'fiorella', match: { kind: 'deposit', header: 'Depósito Ahorros (Ella)' }, reason: 'Decisión inventada', evidenceReference: 'Acta inventada' }] }, '2031-03-01T12:00:00.000Z');
  const persistence = createMilfiPersistence(createPgRestClient(db, u.fiorella), { householdId: u.household });
  const milton = createMilfiPersistence(createPgRestClient(db, u.milton), { householdId: u.household });
  assert.equal((await milton.importPrepared({ fingerprint: decided.batch.fingerprint, fileName: 'inventado.xlsx', sheets: decided.batch.sheets }, decided.records)).ok, true);
  return { householdId: u.household, fiorella: await persistence.loadFiorella(), control: await persistence.loadControl() };
}

