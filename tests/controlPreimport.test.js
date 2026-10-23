import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import process from 'node:process';
import { readXlsxCapture } from '../src/infrastructure/xlsx/workbook.js';
import { readZipDirectory, XLSX_LIMITS } from '../src/infrastructure/xlsx/zip.js';
import { parseXml } from '../src/infrastructure/xlsx/xml.js';
import { prepareFieldResolution, preparePreimportDecision, readControlWorkbook } from '../src/application/controlPreimport.js';
import { inspectPreimport, summarizePreimport } from '../src/domain/controlPreimport.js';
import { sourceOperationKey } from '../src/domain/excelEvidence.js';
import { createPreimportStore } from '../src/store/preimportStore.js';
import { createControlStore } from '../src/store/controlStore.js';
import { createMilfiStore } from '../src/store/useStore.js';
import { syntheticControlCells, syntheticControlXlsx, xlsxBytes, zipBytes } from './helpers/xlsxBuilder.js';

// Every workbook here is generated in memory with invented labels and values.
const run = promisify(execFile);
const reviewer = { reviewedBy: 'milton', reason: 'Revisión sintética explícita', evidenceReference: 'Referencia sintética' };
let sequence = 0;
const stamp = () => new Date(Date.UTC(2031, 5, 1, 0, 0, sequence++)).toISOString();

async function loaded(options) {
  const result = await readControlWorkbook(syntheticControlXlsx(options));
  assert.equal(result.ok, true, result.code);
  return { ...result, context: { workbooks: new Map([[result.batch.fingerprint, result.workbook]]) } };
}
const byRef = (records, ref) => records.find(record => record.provenance.operation.amountRef === ref);
const entryOf = (records, context, ref) => inspectPreimport(records, context).find(entry => entry.record.provenance.operation.amountRef === ref);
function apply(state, input) {
  const result = prepareFieldResolution({ ...reviewer, reviewId: `review-${sequence}`, occurredAt: stamp(), ...input }, state.records, state.context);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const updated = new Map(result.value.map(record => [record.id, record]));
  state.records = state.records.map(record => updated.get(record.id) ?? record);
}
function decide(state, ref, decision = 'prepared') {
  const record = byRef(state.records, ref);
  const result = preparePreimportDecision({ ...reviewer, reviewId: `decision-${sequence}`, occurredAt: stamp(), recordId: record.id, decision }, state.records, state.context);
  if (result.ok) state.records = state.records.map(item => item.id === record.id ? result.value : item);
  return result;
}
const ids = (state, refs) => refs.map(ref => byRef(state.records, ref).id);

test('reader: deflate and stored archives capture text, rich/inline strings, numbers, merges and formulas without evaluating them', async () => {
  for (const method of [8, 0]) {
    const bytes = xlsxBytes({ sheets: [{ name: 'Hoja', merges: ['A1:B1'], cells: { A1: 'Título &amp; <x>', A2: { rich: ['Uno ', 'Dos'] }, B2: { inline: 'Inline' },
      C2: 12.5, D2: { f: 'C2*1000', v: '12500' }, E2: { f: 'NOW()' } } }], date1904: true, zip: { method } });
    const read = await readXlsxCapture(bytes);
    assert.equal(read.ok, true, read.code);
    const sheet = read.capture.sheets[0];
    assert.equal(read.capture.dateSystem, '1904');
    assert.equal(read.capture.fingerprint, createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(sheet.merges, ['A1:B1']);
    assert.deepEqual(sheet.cells.A1, { type: 'text', value: 'Título &amp; <x>' });
    assert.equal(sheet.cells.A2.value, 'Uno Dos');
    assert.equal(sheet.cells.B2.value, 'Inline');
    assert.deepEqual(sheet.cells.C2, { type: 'number', value: '12.5' });
    // Cached value is kept as captured text; the formula itself is never run.
    assert.deepEqual(sheet.cells.D2, { type: 'number', value: '12500', formula: 'C2*1000' });
    assert.deepEqual(sheet.cells.E2, { type: 'blank', value: null, formula: 'NOW()' });
  }
});

test('reader: incompatible or unsafe files are rejected with a safe code', async () => {
  const valid = syntheticControlXlsx();
  const cases = [
    [new Uint8Array([1, 2, 3, 4, 5]), 'NOT_A_ZIP'],
    [new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]), 'LEGACY_OR_PROTECTED_WORKBOOK'],
    [zipBytes([['xl/workbook.xml', '<workbook/>']], { flags: 1 }), 'ENCRYPTED_ZIP'],
    [zipBytes([['xl/workbook.xml', '<workbook/>']], { corruptCrc: true }), 'CORRUPT_ZIP'],
    [zipBytes([['docProps/app.xml', '<Properties/>']]), 'NOT_AN_XLSX_WORKBOOK'],
    [xlsxBytes({ sheets: [{ name: 'H', cells: { A1: 'x' } }], extraFiles: [['xl/vbaProject.bin', new Uint8Array([1, 2])]] }), 'ACTIVE_CONTENT_NOT_ALLOWED'],
    [xlsxBytes({ sheets: [{ name: 'H', cells: {} }], sheetXml: { 0: '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><worksheet><sheetData/></worksheet>' } }), 'XML_DTD_NOT_ALLOWED'],
    [xlsxBytes({ sheets: [{ name: 'H', cells: {} }], sheetXml: { 0: '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&custom;</t></is></c></row></sheetData></worksheet>' } }), 'UNSUPPORTED_XML_ENTITY'],
    [xlsxBytes({ sheets: [{ name: 'H', cells: {} }], sheetXml: { 0: '<worksheet><sheetData><row></sheetData></worksheet>' } }), 'MALFORMED_XML'],
    [xlsxBytes({ sheets: [{ name: 'Dup', cells: {} }, { name: 'dup', cells: {} }] }), 'DUPLICATE_SHEET_NAME'],
  ];
  for (const [bytes, code] of cases) assert.deepEqual(await readXlsxCapture(bytes), { ok: false, code });
  assert.equal((await readXlsxCapture(zipBytes([['xl/workbook.xml', '<workbook/>']], { method: 12 }))).code, 'UNSUPPORTED_COMPRESSION');
  assert.throws(() => readZipDirectory(valid, { ...XLSX_LIMITS, entryBytes: 10 }), { code: 'ARCHIVE_TOO_LARGE' });
  assert.throws(() => readZipDirectory(valid, { ...XLSX_LIMITS, fileBytes: 10 }), { code: 'FILE_TOO_LARGE' });
  assert.equal(parseXml('<a x="1 &#38; &#x41;">&lt;ok&gt;</a>').attrs.x, '1 & A');
  assert.deepEqual(await readControlWorkbook(xlsxBytes({ sheets: [{ name: 'Otra', cells: { A1: 'Lista de compras', B2: 5 } }] })), { ok: false, code: 'STRUCTURE_NOT_RECOGNIZED' });
});

test('structure: tables are found by header evidence, not fixed coordinates', async () => {
  const base = await loaded();
  const shifted = await loaded({ rowOffset: 4, columnOffset: 2 });
  assert.deepEqual(base.batch.sheets, [{ name: 'Control Sintético', recognized: true, deposits: 4, withdrawals: 4 }]);
  assert.deepEqual(base.records.map(record => record.provenance.operation.amountRef), ['C5', 'D5', 'C6', 'D7', 'C13', 'C14', 'C15', 'C16']);
  assert.deepEqual(shifted.records.map(record => record.provenance.operation.amountRef), ['E9', 'F9', 'E10', 'F11', 'E17', 'E18', 'E19', 'E20']);
  assert.deepEqual(shifted.records.map(record => [record.kind, record.amount, record.period]), base.records.map(record => [record.kind, record.amount, record.period]));
  const missingHeader = syntheticControlCells({ overrides: { B4: 'Periodo' } });
  const withdrawalsOnly = await readControlWorkbook(xlsxBytes({ sheets: [{ name: 'S', ...missingHeader }] }));
  assert.equal(withdrawalsOnly.records.filter(record => record.kind === 'deposit').length, 0);
  assert.equal(withdrawalsOnly.records.filter(record => record.kind === 'withdrawal').length, 4);
});

test('structure: two deposits on one row are distinct operations; totals and summary formulas are excluded', async () => {
  const { records, batch, context } = await loaded();
  const [gastos, ahorros] = [byRef(records, 'C5'), byRef(records, 'D5')];
  assert.notEqual(sourceOperationKey(gastos, context), sourceOperationKey(ahorros, context));
  assert.deepEqual([gastos.purpose, ahorros.purpose], ['expenses', 'savings']);
  assert.deepEqual(JSON.parse(sourceOperationKey(gastos, context)), [batch.fingerprint, 'control sintético', 'C5']);
  for (const entry of inspectPreimport(records, context).filter(item => item.record.provenance.row === 5)) assert.ok(!entry.pendingReasons.some(reason => /DUPLICATE/.test(reason)));
  assert.ok(!records.some(record => /^E\d|8$/.test(record.provenance.operation.amountRef)));
  assert.deepEqual(batch.notes.filter(note => note.code === 'TOTAL_FORMULAS_EXCLUDED').flatMap(note => note.refs), ['E5', 'E6', 'E7', 'C8', 'D8', 'E8', 'C19']);
  assert.deepEqual(batch.notes.find(note => note.code === 'FORMULAS_NOT_EXECUTED').refs, ['B22']);
  const formulaAmount = await loaded({ overrides: { C6: { f: 'C5+2', v: '13' } } });
  assert.ok(entryOf(formulaAmount.records, formulaAmount.context, 'C6').pendingReasons.includes('SOURCE_FORMULA_AMOUNT_POLICY_PENDING'));
});

test('ambiguity: currency is never assumed and relative contributor headers are not resolved', async () => {
  const { records, context } = await loaded({ overrides: { G2: 'Milton', G3: 'PEN' } });
  assert.ok(records.every(record => record.currency === null));
  assert.ok(!JSON.stringify(records.map(record => ({ ...record, provenance: null }))).includes('PEN'));
  for (const entry of inspectPreimport(records, context)) {
    assert.ok(entry.pendingReasons.includes('SOURCE_CURRENCY_AMBIGUOUS'));
    assert.ok(entry.categories.includes('currency'));
    assert.equal(entry.eligibleForConfirmed, false);
  }
  for (const deposit of records.filter(record => record.kind === 'deposit')) {
    assert.equal(deposit.contributorId, null);
    assert.ok(entryOf(records, context, deposit.provenance.operation.amountRef).pendingReasons.includes('SOURCE_CONTRIBUTOR_ID_AMBIGUOUS'));
  }
});

test('ambiguity: withdrawals keep dates exact, never get a person, and need an explicit period', async () => {
  const { records, context } = await loaded();
  const [serialDate, textAmount, undated] = ['C13', 'C14', 'C15'].map(ref => entryOf(records, context, ref));
  assert.equal(serialDate.record.effectiveDate, '2031-02-03');
  assert.equal(textAmount.record.effectiveDate, '2031-02-15');
  assert.equal(textAmount.record.amount, null);
  assert.ok(textAmount.pendingReasons.includes('SOURCE_AMOUNT_INTERPRETATION_REQUIRED'));
  assert.ok(undated.pendingReasons.includes('MISSING_WITHDRAWAL_DATE'));
  for (const entry of [serialDate, textAmount, undated]) {
    assert.equal(entry.record.contributorId, null);
    assert.ok(!entry.pendingReasons.some(reason => /CONTRIBUTOR/.test(reason)));
    assert.equal(entry.record.purpose, 'savings');
    assert.ok(!entry.pendingReasons.includes('PURPOSE_REVIEW_REQUIRED'));
    assert.equal(entry.record.period, null);
    assert.ok(entry.pendingReasons.includes('SOURCE_PERIOD_AMBIGUOUS'));
  }
  const state = { records, context };
  const result = prepareFieldResolution({ ...reviewer, reviewId: 'x', occurredAt: stamp(), recordIds: [serialDate.record.id], field: 'contributorId', value: 'milton' }, records, context);
  assert.deepEqual(result.errors, ['WITHDRAWAL_CONTRIBUTOR_WITHOUT_EVIDENCE']);
  assert.equal(state.records, records);
});

test('review: a deposit becomes prepared only after explicit currency and contributor resolutions', async () => {
  const state = await loaded();
  apply(state, { recordIds: ids(state, ['C5', 'C6']), field: 'currency', value: 'PEN' });
  assert.ok(entryOf(state.records, state.context, 'C5').pendingReasons.includes('SOURCE_CONTRIBUTOR_ID_AMBIGUOUS'));
  assert.deepEqual(decide(state, 'C5').errors, ['MISSING_CONTRIBUTOR', 'SOURCE_CONTRIBUTOR_ID_AMBIGUOUS']);
  apply(state, { recordIds: ids(state, ['C5', 'C6']), field: 'contributorId', value: 'milton' });
  const ready = entryOf(state.records, state.context, 'C5');
  assert.deepEqual(ready.pendingReasons, []);
  assert.deepEqual(ready.deferred, ['MISSING_CONFIRMED_HOUSEHOLD']);
  assert.equal(ready.record.evidenceReviews.length, 2);
  assert.equal(decide(state, 'C5').ok, true);
  const prepared = entryOf(state.records, state.context, 'C5');
  assert.equal(prepared.status, 'prepared');
  assert.equal(prepared.record.validationStatus, 'pending');
  assert.equal(prepared.record.origin, 'real');
  assert.equal(prepared.eligibleForConfirmed, false);
  assert.equal(state.records.find(record => record.provenance.operation.amountRef === 'C6').preimportDecisions.length, 0);
});

test('review: decisions and field reviews expire when the operation or its evidence changes', async () => {
  const state = await loaded();
  apply(state, { recordIds: ids(state, ['C5']), field: 'currency', value: 'PEN' });
  apply(state, { recordIds: ids(state, ['C5']), field: 'contributorId', value: 'milton' });
  assert.equal(decide(state, 'C5').ok, true);
  apply(state, { recordIds: ids(state, ['C5']), field: 'currency', value: 'USD' });
  let entry = entryOf(state.records, state.context, 'C5');
  assert.equal(entry.status, 'pending');
  assert.equal(entry.staleDecisions, 1);
  assert.equal(decide(state, 'C5').ok, true);
  assert.equal(entryOf(state.records, state.context, 'C5').status, 'prepared');
  // Same record, different captured evidence (e.g. another reading): reviews no longer bind.
  const workbook = state.context.workbooks.get(byRef(state.records, 'C5').provenance.sourceFingerprint);
  workbook.sheets['Control Sintético'].cells.C4 = { type: 'text', value: 'Depósito Gastos (Él)' };
  entry = entryOf(state.records, state.context, 'C5');
  assert.notEqual(entry.status, 'prepared');
});

test('review: amount interpretation binds the currency and cross-period assignment is explicit', async () => {
  const state = await loaded();
  const textAmount = ids(state, ['C14']);
  apply(state, { recordIds: textAmount, field: 'amount', value: { amount: '7.50', currency: 'USD' } });
  let entry = entryOf(state.records, state.context, 'C14');
  assert.equal(entry.record.amount, '7.5');
  assert.ok(!entry.pendingReasons.some(reason => /AMOUNT|CURRENCY/.test(reason)));
  apply(state, { recordIds: textAmount, field: 'currency', value: 'PEN' });
  assert.ok(entryOf(state.records, state.context, 'C14').pendingReasons.includes('SOURCE_AMOUNT_INTERPRETATION_REQUIRED'));
  apply(state, { recordIds: textAmount, field: 'period', value: { year: 2031, month: 3 } });
  assert.ok(entryOf(state.records, state.context, 'C14').pendingReasons.includes('PERIOD_ASSIGNMENT_REVIEW_REQUIRED'));
  apply(state, { recordIds: textAmount, field: 'period', value: { year: 2031, month: 3 }, acceptPeriodAssignment: true });
  entry = entryOf(state.records, state.context, 'C14');
  assert.ok(!entry.pendingReasons.some(reason => /PERIOD/.test(reason)));
  assert.equal(entry.record.periodAssignment.reviewedBy, 'milton');
  apply(state, { recordIds: textAmount, field: 'period', value: { year: 2031, month: 2 } });
  assert.equal(entryOf(state.records, state.context, 'C14').record.periodAssignment, undefined);
});

test('duplicates: identical rows need an explicit distinct-operation resolution; zero cannot be prepared', async () => {
  const state = await loaded();
  for (const ref of ['C13', 'C16']) assert.ok(entryOf(state.records, state.context, ref).pendingReasons.includes('POSSIBLE_DUPLICATE_VALUES'));
  apply(state, { recordIds: ids(state, ['C13']), field: 'distinct', value: null });
  assert.ok(!entryOf(state.records, state.context, 'C13').pendingReasons.includes('POSSIBLE_DUPLICATE_VALUES'));
  assert.ok(entryOf(state.records, state.context, 'C16').pendingReasons.includes('POSSIBLE_DUPLICATE_VALUES'));
  apply(state, { recordIds: ids(state, ['D7']), field: 'currency', value: 'PEN' });
  apply(state, { recordIds: ids(state, ['D7']), field: 'contributorId', value: 'fiorella' });
  assert.deepEqual(decide(state, 'D7').errors, ['ZERO_AMOUNT_POLICY_PENDING']);
  assert.equal(decide(state, 'D7', 'rejected').ok, true);
  assert.equal(entryOf(state.records, state.context, 'D7').status, 'rejected');
});

test('summary: prepared totals are per file, per currency and never mixed', async () => {
  const state = await loaded();
  apply(state, { recordIds: ids(state, ['C5', 'C6']), field: 'currency', value: 'PEN' });
  apply(state, { recordIds: ids(state, ['D5']), field: 'currency', value: 'USD' });
  apply(state, { recordIds: ids(state, ['C5', 'C6']), field: 'contributorId', value: 'milton' });
  apply(state, { recordIds: ids(state, ['D5']), field: 'contributorId', value: 'fiorella' });
  for (const ref of ['C5', 'C6', 'D5']) assert.equal(decide(state, ref).ok, true);
  const summary = summarizePreimport(inspectPreimport(state.records, state.context), byRef(state.records, 'C5').provenance.sourceFingerprint);
  assert.deepEqual(summary.groups, [
    { currency: 'PEN', kind: 'deposit', purpose: 'expenses', contributorId: 'milton', total: '24', count: 2 },
    { currency: 'USD', kind: 'deposit', purpose: 'savings', contributorId: 'fiorella', total: '22.5', count: 1 },
  ]);
  assert.deepEqual([summary.identified, summary.prepared, summary.pending, summary.rejected], [8, 3, 5, 0]);
});

test('versions: the same file is not loaded twice and different versions are never reconciled', async () => {
  const store = createPreimportStore();
  const first = syntheticControlXlsx();
  assert.equal((await store.getState().loadWorkbook(first, 'v1.xlsx')).ok, true);
  assert.deepEqual(await store.getState().loadWorkbook(first.slice(), 'copia.xlsx'), { ok: false, code: 'ALREADY_LOADED' });
  assert.equal(store.getState().records.length, 8);
  const second = syntheticControlXlsx({ overrides: { C6: 14 } });
  assert.equal((await store.getState().loadWorkbook(second, 'v2.xlsx')).ok, true);
  const { records, context, batches } = store.getState();
  assert.equal(records.length, 16);
  const entries = inspectPreimport(records, context);
  const sameCell = entries.filter(entry => entry.record.provenance.operation.amountRef === 'C5');
  assert.ok(sameCell.every(entry => entry.pendingReasons.includes('OTHER_VERSION_SAME_OPERATION')));
  assert.ok(entries.filter(entry => entry.record.provenance.operation.amountRef === 'C6').every(entry => !entry.pendingReasons.includes('OTHER_VERSION_SAME_OPERATION')));
  assert.deepEqual(batches.map(batch => summarizePreimport(entries, batch.fingerprint).identified), [8, 8]);
  store.getState().discardWorkbook(batches[0].fingerprint);
  assert.equal(store.getState().records.length, 8);
  assert.ok(inspectPreimport(store.getState().records, store.getState().context).every(entry => !entry.pendingReasons.includes('OTHER_VERSION_SAME_OPERATION')));
});

test('separation: preimport never writes Control demos, Fiorella records or real movements', async () => {
  const preimport = createPreimportStore(); const control = createControlStore(); const milfi = createMilfiStore();
  await preimport.getState().loadWorkbook(syntheticControlXlsx(), 'x.xlsx');
  assert.deepEqual([control.getState().demoMovements, control.getState().events], [[], []]);
  for (const key of ['fiorellaRecords', 'controlMovements', 'simulations', 'fiorellaDemoRecords']) assert.deepEqual(milfi.getState()[key], []);
  assert.ok(preimport.getState().records.every(record => record.validationStatus === 'pending' && record.householdId === null));
});

test('privacy: reader, preimport and route code use no storage, network or logging APIs', async () => {
  const files = ['src/infrastructure/xlsx/zip.js', 'src/infrastructure/xlsx/xml.js', 'src/infrastructure/xlsx/workbook.js', 'src/domain/controlWorkbook.js',
    'src/domain/controlPreimport.js', 'src/application/controlPreimport.js', 'src/store/preimportStore.js', 'src/routes/ControlPreimportacion.jsx',
    'src/components/PreimportForms.jsx', 'src/presentation/preimport.js'];
  for (const file of files) {
    const source = (await readFile(new URL(`../${file}`, import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|console\.|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|persist\(/, file);
  }
  assert.ok((await readdir(new URL('../src/', import.meta.url), { recursive: true })).every(name => !/\.xlsx?$/i.test(name)));
});

test('privacy: the structural contrast script prints positions and codes, never cell values', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'milfi-structure-'));
  try {
    const file = join(folder, 'sintetico.xlsx');
    await writeFile(file, syntheticControlXlsx());
    const before = await readFile(file);
    const { stdout } = await run(process.execPath, ['scripts/check-control-structure.mjs', file], { cwd: new URL('..', import.meta.url) });
    const report = JSON.parse(stdout);
    assert.equal(report.compatible, true);
    assert.equal(report.fileUnchanged, true);
    assert.deepEqual(report.movements, { deposits: 4, withdrawals: 4 });
    for (const secret of ['Retiro sintético', '22.5', '7.5', 'Enero', '2031', 'Tú', 'Ella']) assert.ok(!stdout.includes(secret), secret);
    assert.deepEqual(await readFile(file), before);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
