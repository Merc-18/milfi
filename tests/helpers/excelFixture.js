import { createHash } from 'node:crypto';
import * as models from '../../src/domain/models.js';
import { sumConfirmedMovements as sum } from '../../src/domain/movementTotals.js';
import { evidenceBinding, isExcelSource } from '../../src/domain/excelEvidence.js';

// Every factory call represents an independently invented workbook. Captures are
// made once, separately from records; later record edits never update evidence.
let sequence = 0;
export const context = { workbooks: new Map() };
export const freshFingerprint = () => createHash('sha256').update(`invented-workbook-${++sequence}`).digest('hex');

export function syntheticMovement(overrides = {}) {
  return attachEvidence({
    id: 'imaginary-operation', schemaVersion: 1, revision: 1, householdId: 'imaginary-household',
    moduleId: 'control-mf', origin: 'real', validationStatus: 'confirmed', actorId: 'milton',
    period: { year: 2035, month: 9 }, kind: 'deposit', purpose: 'savings', contributorId: 'fiorella',
    amount: '7.25', currency: 'PEN', effectiveDate: '2035-09-21', description: null,
    provenance: { type: 'control-excel', sourceId: 'imaginary-book', sourceFingerprint: freshFingerprint(),
      importBatchId: 'imaginary-batch', sheet: 'Invented', row: 5,
      original: { amount: '7.25', date: '2035-09-21' }, cells: { amount: 'C5', date: 'A5' } },
    ...overrides,
  });
}

export function attachEvidence(record) {
  const source = record.provenance;
  if (!isExcelSource(source) || !source.original || !source.cells || !source.sheet || !Number.isInteger(source.row)) return record;
  const row = source.row;
  const extra = { currency: record.currency, contributorId: record.contributorId,
    period: record.period ? `${record.period.year}-${String(record.period.month).padStart(2, '0')}` : null };
  source.cells = { currency: `F${row}`, contributorId: `G${row}`, period: `H${row}`, ...source.cells };
  source.original = { ...extra, ...source.original };
  source.operation ??= { range: `A${row}:H${row}`, amountRef: `C${row}` };
  source.evidence ??= Object.fromEntries(['amount', 'effectiveDate', 'currency', 'contributorId', 'period'].map(field => [field,
    source.cells[field === 'effectiveDate' ? 'date' : field]
      ? [{ sheet: source.sheet, ref: source.cells[field === 'effectiveDate' ? 'date' : field] }] : []]));
  const cells = Object.fromEntries(Object.entries(source.original).filter(([field]) => source.cells[field]).map(([field, value]) => [source.cells[field],
    { type: value === null ? 'blank' : field === 'amount' && /^\d+(\.\d+)?$/.test(value) ? 'number' : 'text', value }]));
  context.workbooks.set(source.sourceFingerprint?.toLowerCase(), { dateSystem: '1900', sheets: { [source.sheet]: { cells, merges: [] } } });
  bindOperation(record);
  return record;
}

// Fixture layout setup only. Tests that alter record references afterwards must
// not call this: the independently supplied associations must stay unchanged.
export function bindOperation(record) {
  const source = record.provenance;
  const sheet = context.workbooks.get(source.sourceFingerprint?.toLowerCase()).sheets[source.sheet];
  sheet.operations ??= {};
  sheet.operations[source.operation.amountRef] = structuredClone({ range: source.operation.range, fields: source.evidence });
}

export const inspectMovement = record => models.inspectMovement(record, context);
export const validateMovement = record => models.validateMovement(record, context);
export const inspectMovementBatch = (records, existing = []) => models.inspectMovementBatch(records, context, existing);
export const partitionMovements = records => models.partitionMovements(records, context);
export const sumConfirmedMovements = (records, scope) => sum(records, scope, context);
export { isValidDate, isValidPeriod, validateEnvelope, findDuplicateIds } from '../../src/domain/models.js';

export function review(record, field, overrides = {}) {
  return { id: `invented-review-${field}`, field, decision: 'accepted',
    binding: evidenceBinding(record, field, context), reason: 'Invented explicit review of this evidence',
    reviewedBy: 'milton', reviewedAt: '2032-07-01T12:00:00.000Z', evidenceReference: 'invented-external-reference', ...overrides };
}
