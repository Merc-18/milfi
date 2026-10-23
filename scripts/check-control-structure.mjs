// Private, read-only structural contrast of a local Control Finanzas workbook.
// Prints counts, positions and reason codes only: never amounts, dates,
// descriptions or names. The file is read once into memory and never written.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { readXlsxCapture } from '../src/infrastructure/xlsx/workbook.js';
import { recognizeControlWorkbook } from '../src/domain/controlWorkbook.js';
import { inspectPreimport } from '../src/domain/controlPreimport.js';

const path = process.argv[2];
if (!path) {
  console.error('Uso: npm run check:control-structure -- <ruta-local-al-xlsx>');
  process.exit(2);
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const before = await readFile(path);
const read = await readXlsxCapture(new Uint8Array(before));
if (!read.ok) {
  console.log(JSON.stringify({ compatible: false, code: read.code }, null, 2));
  process.exit(1);
}
const result = recognizeControlWorkbook(read.capture);
const unchanged = digest(await readFile(path)) === digest(before);
if (!result.ok) {
  console.log(JSON.stringify({ compatible: false, code: result.code, fileUnchanged: unchanged }, null, 2));
  process.exit(1);
}
const context = { workbooks: new Map([[result.batch.fingerprint, result.workbook]]) };
const histogram = values => Object.fromEntries([...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map())].sort());
const entries = inspectPreimport(result.records, context);
console.log(JSON.stringify({
  compatible: true,
  fileUnchanged: unchanged,
  dateSystem: result.batch.dateSystem,
  sheets: result.batch.sheets,
  movements: { deposits: result.records.filter(record => record.kind === 'deposit').length, withdrawals: result.records.filter(record => record.kind === 'withdrawal').length },
  amountPositions: result.records.map(record => `${record.provenance.sheet}!${record.provenance.operation.amountRef}`),
  notes: result.batch.notes.map(note => ({ code: note.code, sheet: note.sheet, positions: note.refs.length })),
  statuses: histogram(entries.map(entry => entry.status)),
  errors: histogram(entries.flatMap(entry => entry.errors)),
  pendingReasons: histogram(entries.flatMap(entry => entry.pendingReasons)),
}, null, 2));
