import { hasFractionalCent, normalizeAmount } from './amounts.js';

export const MODULES = Object.freeze({ FIORELLA: 'fiorella', CONTROL: 'control-mf' });
export const ORIGINS = Object.freeze({ SIMULATED: 'simulated', REAL: 'real' });
export const VALIDATION = Object.freeze({ PENDING: 'pending', CONFIRMED: 'confirmed', REJECTED: 'rejected' });

// Domain identities and intended responsibilities, never authenticated sessions.
export const IDENTITIES = Object.freeze([
  Object.freeze({ id: 'fiorella', name: 'Fiorella' }),
  Object.freeze({ id: 'milton', name: 'Milton' }),
]);
export const MODULE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: MODULES.FIORELLA, title: 'Finanzas de Fiorella', managerId: 'fiorella', readerIds: Object.freeze(['fiorella', 'milton']) }),
  Object.freeze({ id: MODULES.CONTROL, title: 'Control Finanzas M&F', managerId: 'milton', readerIds: Object.freeze(['fiorella', 'milton']) }),
]);

const SOURCE_CLASSIFICATION = Object.freeze({
  'manual-simulation': ORIGINS.SIMULATED,
  'fiorella-template': ORIGINS.SIMULATED,
  'legacy-mock': ORIGINS.SIMULATED,
  'control-excel': ORIGINS.REAL,
  'fiorella-updated-excel': ORIGINS.REAL,
});

/**
 * @typedef {{year: number, month: number}} Period
 * @typedef {{type: string, sourceId: string, sheet?: string, row?: number,
 * sourceFingerprint?: string, importBatchId?: string,
 * cells?: Object<string, string>, original?: Object<string, string|null>}} Provenance
 * @typedef {{id: string, householdId: string|null, schemaVersion: 1, revision: number,
 * moduleId: string, origin: 'simulated'|'real',
 * validationStatus: 'pending'|'confirmed'|'rejected', period: Period|null,
 * provenance: Provenance, actorId: string|null}} RecordEnvelope
 * @typedef {RecordEnvelope & {kind: 'deposit'|'withdrawal', purpose: 'expenses'|'savings'|null,
 * contributorId: string|null, amount: string|null, currency: string|null,
 * effectiveDate: string|null, description: string|null,
 * amountInterpretation?: {decision: 'accepted', originalAmount: string, amount: string,
 * currency: string, reviewedBy: string, evidenceReference: string},
 * periodAssignment?: {decision: 'accepted'|'inconsistent', effectivePeriod: Period,
 * postingPeriod: Period, reason: string, reviewedBy: string, evidenceReference: string}}} Movement
 * @typedef {{id: string, moduleId: string, categoryId: string, period: Period,
 * origin: 'simulated'|'real', validationStatus: string, provenance: Provenance,
 * budgetAmount: string|null, actualAmount: string|null,
 * granularity: 'monthly-aggregate'|'transaction'}} BudgetActual
 * @typedef {{id: string, moduleId: string, parentId: string|null, name: string,
 * kind: 'fixed'|'variable', rulesVersion: string}} Category
 * @typedef {{id: string, period: Period, rulesVersion: string,
 * origin: 'simulated'|'real', validationStatus: string, provenance: Provenance,
 * distribution: Object}} MonthlyAllocation
 */

export function isValidPeriod(period) {
  return !!period && Number.isInteger(period.year) && period.year >= 1 && period.year <= 9999
    && Number.isInteger(period.month) && period.month >= 1 && period.month <= 12;
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const isPlainObject = value => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const currencies = new Set(Intl.supportedValuesOf('currency'));
export const isKnownCurrency = value => typeof value === 'string' && currencies.has(value);

function hasSourceTrace(source) {
  if (!nonempty(source.sheet) || !Number.isSafeInteger(source.row) || source.row < 1 || source.row > 1048576
    || typeof source.sourceFingerprint !== 'string' || !/^[a-fA-F0-9]{64}$/.test(source.sourceFingerprint) || !nonempty(source.importBatchId)
    || !isPlainObject(source.original) || !isPlainObject(source.cells)) return false;
  const originals = Object.entries(source.original);
  return originals.length > 0 && originals.some(([, value]) => nonempty(value))
    && originals.every(([field, value]) => {
      if (value !== null && typeof value !== 'string') return false;
      const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(source.cells[field] ?? '');
      if (!match || Number(match[2]) !== source.row) return false;
      const column = [...match[1]].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0);
      return column <= 16384;
    });
}

function inspectEnvelope(record) {
  if (!isPlainObject(record)) return { errors: ['INVALID_RECORD'], pendingReasons: [] };
  const errors = [];
  const pendingReasons = [];
  if (!nonempty(record.id)) errors.push('INVALID_ID');
  if (record.schemaVersion !== 1) errors.push('UNSUPPORTED_SCHEMA_VERSION');
  if (!Object.values(MODULES).includes(record.moduleId)) errors.push('INVALID_MODULE');
  if (!Object.values(ORIGINS).includes(record.origin)) errors.push('INVALID_ORIGIN');
  if (!Object.values(VALIDATION).includes(record.validationStatus)) errors.push('INVALID_VALIDATION_STATUS');
  if (record.period !== null && !isValidPeriod(record.period)) errors.push('INVALID_PERIOD');
  if (!Number.isSafeInteger(record.revision) || record.revision < 0) errors.push('INVALID_REVISION');
  if (record.householdId !== null && !nonempty(record.householdId)) errors.push('INVALID_HOUSEHOLD');
  if (!isValidPeriod(record.period)) pendingReasons.push('MISSING_CONFIRMED_PERIOD');
  if (!nonempty(record.householdId)) pendingReasons.push('MISSING_CONFIRMED_HOUSEHOLD');
  if (record.origin === ORIGINS.SIMULATED && record.validationStatus === VALIDATION.CONFIRMED) errors.push('SIMULATED_CANNOT_BE_CONFIRMED');
  if (record.actorId !== null && !IDENTITIES.some(identity => identity.id === record.actorId)) errors.push('INVALID_ACTOR');

  const source = record.provenance;
  if (!source || !nonempty(source.sourceId) || !Object.hasOwn(SOURCE_CLASSIFICATION, source.type)) {
    errors.push('INVALID_PROVENANCE');
  } else {
    if (SOURCE_CLASSIFICATION[source.type] !== record.origin) errors.push('SOURCE_ORIGIN_MISMATCH');
    const expectedModule = source.type === 'control-excel' ? MODULES.CONTROL : MODULES.FIORELLA;
    if (source.type !== 'legacy-mock' && record.moduleId !== expectedModule) errors.push('SOURCE_MODULE_MISMATCH');
    if ((source.type.endsWith('excel') || source.type === 'fiorella-template') && !hasSourceTrace(source)) errors.push('INCOMPLETE_SOURCE_TRACE');
  }
  return { errors, pendingReasons };
}

export function validateEnvelope(record) {
  const { errors, pendingReasons } = inspectEnvelope(record);
  return [...new Set([...errors, ...(record?.validationStatus === VALIDATION.CONFIRMED ? pendingReasons : [])])];
}

const samePeriod = (left, right) => isValidPeriod(left) && isValidPeriod(right)
  && left.year === right.year && left.month === right.month;

function periodAssignmentIssues(record) {
  if (!isValidDate(record.effectiveDate) || !isValidPeriod(record.period)) return [];
  const effectivePeriod = { year: Number(record.effectiveDate.slice(0, 4)), month: Number(record.effectiveDate.slice(5, 7)) };
  const assignment = record.periodAssignment;
  if (!assignment && samePeriod(record.period, effectivePeriod)) return [];
  if (assignment?.decision === 'inconsistent') return ['PERIOD_DATE_INCONSISTENCY'];
  // Evidence of a record-specific review, not an automatic month-shifting rule.
  if (assignment?.decision === 'accepted' && samePeriod(assignment.effectivePeriod, effectivePeriod)
    && samePeriod(assignment.postingPeriod, record.period) && nonempty(assignment.reason)
    && IDENTITIES.some(identity => identity.id === assignment.reviewedBy)
    && nonempty(assignment.evidenceReference)) return [];
  return ['PERIOD_ASSIGNMENT_REVIEW_REQUIRED'];
}

function sourceAmountIssues(record) {
  if (typeof record.provenance?.type !== 'string' || !record.provenance.type.endsWith('excel')) return [];
  const original = record.provenance.original?.amount;
  if (!nonempty(original)) return [];
  const rawAmount = normalizeAmount(original);
  const amount = normalizeAmount(record.amount);
  if (rawAmount !== null && rawAmount === amount) return [];
  if (rawAmount !== null && amount === null) return [];
  // Preserve ambiguous source text. Only an explicit, externally evidenced review
  // may explain its interpretation; there is no parsing or conversion here.
  const review = record.amountInterpretation;
  if (rawAmount === null && review?.decision === 'accepted' && review.originalAmount === original
    && normalizeAmount(review.amount) === amount && amount !== null && review.currency === record.currency
    && isKnownCurrency(review.currency) && IDENTITIES.some(identity => identity.id === review.reviewedBy)
    && nonempty(review.evidenceReference)) return [];
  return [rawAmount === null ? 'SOURCE_AMOUNT_INTERPRETATION_REQUIRED' : 'SOURCE_AMOUNT_MISMATCH'];
}

/** Inspect structure and unresolved decisions separately; never confirms or posts. */
export function inspectMovement(record) {
  const { errors, pendingReasons } = inspectEnvelope(record);
  if (!isPlainObject(record)) return { errors, pendingReasons, eligibleForConfirmed: false };
  if (record.moduleId !== MODULES.CONTROL) errors.push('MOVEMENT_REQUIRES_CONTROL_MODULE');
  if (!['deposit', 'withdrawal'].includes(record.kind)) errors.push('INVALID_MOVEMENT_KIND');
  if (record.purpose !== null && !['expenses', 'savings'].includes(record.purpose)) errors.push('INVALID_PURPOSE');
  if (record.purpose === null) pendingReasons.push('UNRESOLVED_PURPOSE');
  if (record.kind === 'withdrawal' && record.purpose === 'expenses') pendingReasons.push('WITHDRAWAL_PURPOSE_POLICY_PENDING');
  if (record.contributorId !== null && !IDENTITIES.some(identity => identity.id === record.contributorId)) errors.push('INVALID_CONTRIBUTOR');
  if (record.amount !== null && (typeof record.amount !== 'string' || normalizeAmount(record.amount) === null)) errors.push('INVALID_AMOUNT');
  if (record.currency !== null && !isKnownCurrency(record.currency)) errors.push('INVALID_CURRENCY');
  if (record.effectiveDate !== null && !isValidDate(record.effectiveDate)) errors.push('INVALID_DATE');
  if (record.description !== null && typeof record.description !== 'string') errors.push('INVALID_DESCRIPTION');
  if (typeof record.provenance?.type === 'string' && record.provenance.type.endsWith('excel')
    && (!nonempty(record.provenance.original?.amount) || !nonempty(record.provenance.cells?.amount))) errors.push('MISSING_ORIGINAL_AMOUNT');
  if (record.amount === null || record.currency === null) pendingReasons.push('UNRESOLVED_MONEY');
  if (typeof record.amount === 'string' && normalizeAmount(record.amount) !== null
    && hasFractionalCent(normalizeAmount(record.amount))) pendingReasons.push('ROUNDING_POLICY_PENDING');
  if (record.kind === 'deposit' && record.contributorId === null) pendingReasons.push('MISSING_CONTRIBUTOR');
  if (record.kind === 'withdrawal' && record.effectiveDate === null) pendingReasons.push('MISSING_WITHDRAWAL_DATE');
  pendingReasons.push(...periodAssignmentIssues(record));
  pendingReasons.push(...sourceAmountIssues(record));
  return {
    errors: [...new Set(errors)], pendingReasons: [...new Set(pendingReasons)],
    eligibleForConfirmed: record.origin === ORIGINS.REAL && record.validationStatus === VALIDATION.CONFIRMED
      && errors.length === 0 && pendingReasons.length === 0,
  };
}

export function validateMovement(record) {
  const { errors, pendingReasons } = inspectMovement(record);
  return [...new Set([...errors, ...(record?.validationStatus === VALIDATION.CONFIRMED ? pendingReasons : [])])];
}

export function findDuplicateIds(records) {
  const seen = new Set();
  const duplicates = new Set();
  for (const record of records) {
    if (!nonempty(record?.id)) continue;
    const id = record.id.trim();
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

export function inspectMovementBatch(records) {
  const duplicateIds = new Set(findDuplicateIds(records));
  return records.map(record => {
    const inspection = inspectMovement(record);
    if (nonempty(record?.id) && duplicateIds.has(record.id.trim())) {
      return { record, ...inspection, errors: [...inspection.errors, 'DUPLICATE_ID'], eligibleForConfirmed: false };
    }
    return { record, ...inspection };
  });
}

// No conversion or posting. Decisions stay pending; all ID collisions are excluded.
export function partitionMovements(records) {
  const groups = { simulated: [], confirmed: [], pending: [], rejected: [], invalid: [] };
  for (const { record, errors, pendingReasons } of inspectMovementBatch(records)) {
    if (errors.length) groups.invalid.push(record);
    else if (record.origin === ORIGINS.SIMULATED) groups.simulated.push(record);
    else if (record.validationStatus === VALIDATION.REJECTED) groups.rejected.push(record);
    else if (record.validationStatus === VALIDATION.PENDING || pendingReasons.length) groups.pending.push(record);
    else groups.confirmed.push(record);
  }
  return groups;
}
