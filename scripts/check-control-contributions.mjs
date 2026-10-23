// Local, read-only and count-only. No Supabase client, write or import RPC.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { readXlsxCapture } from '../src/infrastructure/xlsx/workbook.js';
import { recognizeControlWorkbook } from '../src/domain/controlWorkbook.js';
import { applyControlDecisions } from '../src/application/historicalLoad.js';
import { controlWorkbookContrast } from '../src/presentation/controlWorkbookContrast.js';

const [file, decisionsFile] = process.argv.slice(2);
if (!file || !decisionsFile) {
  process.stderr.write('Uso: node scripts/check-control-contributions.mjs <archivo.xlsx> <decisiones.json>\n');
  process.exit(2);
}
try {
  const bytes = await readFile(file);
  const capture = await readXlsxCapture(new Uint8Array(bytes));
  if (!capture.ok) throw new Error('UNREADABLE_WORKBOOK');
  const read = recognizeControlWorkbook(capture.capture);
  const decisions = JSON.parse(await readFile(decisionsFile, 'utf8'));
  const prepared = applyControlDecisions(read, decisions, '2026-10-23T12:00:00.000Z');
  if (!prepared.ok) throw new Error('INVALID_DECISIONS');
  const result = controlWorkbookContrast(capture.capture, prepared.records);
  const hash = value => createHash('sha256').update(value).digest('hex');
  const fileUnchanged = hash(bytes) === hash(await readFile(file));
  process.stdout.write(`${JSON.stringify({ ...result, movements: prepared.records.length, fileUnchanged }, null, 2)}\n`);
  if (!result.complete || !fileUnchanged) process.exitCode = 1;
} catch {
  process.stderr.write('No se pudo completar el contraste local. Comprueba el archivo y las decisiones.\n');
  process.exitCode = 1;
}
