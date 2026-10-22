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
 * original?: Object<string, string|null>}} Provenance
 * @typedef {{id: string, householdId: string|null, schemaVersion: 1, revision: number,
 * moduleId: string, origin: 'simulated'|'real',
 * validationStatus: 'pending'|'confirmed'|'rejected', period: Period|null,
 * provenance: Provenance, actorId: string|null}} RecordEnvelope
 * @typedef {RecordEnvelope & {kind: 'deposit'|'withdrawal', purpose: 'expenses'|'savings',
 * contributorId: string|null, amount: string|null, currency: string|null,
 * effectiveDate: string|null, description: string|null}} Movement
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
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const nonempty = value => typeof value === 'string' && value.trim().length > 0;

export function validateEnvelope(record) {
  if (!record || typeof record !== 'object') return ['INVALID_RECORD'];
  const errors = [];
  if (!nonempty(record.id)) errors.push('INVALID_ID');
  if (record.schemaVersion !== 1) errors.push('UNSUPPORTED_SCHEMA_VERSION');
  if (!Object.values(MODULES).includes(record.moduleId)) errors.push('INVALID_MODULE');
  if (!Object.values(ORIGINS).includes(record.origin)) errors.push('INVALID_ORIGIN');
  if (!Object.values(VALIDATION).includes(record.validationStatus)) errors.push('INVALID_VALIDATION_STATUS');
  if (record.period !== null && !isValidPeriod(record.period)) errors.push('INVALID_PERIOD');
  if (!Number.isInteger(record.revision) || record.revision < 0) errors.push('INVALID_REVISION');
  if (record.householdId !== null && !nonempty(record.householdId)) errors.push('INVALID_HOUSEHOLD');
  if (record.validationStatus === VALIDATION.CONFIRMED) {
    if (!isValidPeriod(record.period)) errors.push('MISSING_CONFIRMED_PERIOD');
    if (!nonempty(record.householdId)) errors.push('MISSING_CONFIRMED_HOUSEHOLD');
  }
  if (record.actorId !== null && !IDENTITIES.some(identity => identity.id === record.actorId)) errors.push('INVALID_ACTOR');

  const source = record.provenance;
  if (!source || !nonempty(source.sourceId) || !Object.hasOwn(SOURCE_CLASSIFICATION, source.type)) {
    errors.push('INVALID_PROVENANCE');
  } else {
    if (SOURCE_CLASSIFICATION[source.type] !== record.origin) errors.push('SOURCE_ORIGIN_MISMATCH');
    const expectedModule = source.type === 'control-excel' ? MODULES.CONTROL : MODULES.FIORELLA;
    if (source.type !== 'legacy-mock' && record.moduleId !== expectedModule) errors.push('SOURCE_MODULE_MISMATCH');
    if (source.type.endsWith('excel') || source.type === 'fiorella-template') {
      if (!nonempty(source.sheet) || !Number.isInteger(source.row) || source.row < 1
        || !nonempty(source.sourceFingerprint) || !nonempty(source.importBatchId)
        || !source.original || typeof source.original !== 'object' || Array.isArray(source.original)
        || !Object.values(source.original).every(value => value === null || typeof value === 'string')) {
        errors.push('INCOMPLETE_SOURCE_TRACE');
      }
    }
  }
  return errors;
}

/** Validate a future movement, without importing, confirming or posting it. */
export function validateMovement(record) {
  const errors = validateEnvelope(record);
  if (!record || typeof record !== 'object') return errors;
  if (record.moduleId !== MODULES.CONTROL) errors.push('MOVEMENT_REQUIRES_CONTROL_MODULE');
  if (!['deposit', 'withdrawal'].includes(record.kind)) errors.push('INVALID_MOVEMENT_KIND');
  if (!['expenses', 'savings'].includes(record.purpose)) errors.push('INVALID_PURPOSE');
  if (record.kind === 'withdrawal' && record.purpose !== 'savings') errors.push('UNSUPPORTED_WITHDRAWAL_PURPOSE');
  if (record.contributorId !== null && !IDENTITIES.some(identity => identity.id === record.contributorId)) errors.push('INVALID_CONTRIBUTOR');
  if (record.amount !== null && (typeof record.amount !== 'string' || normalizeAmount(record.amount) === null)) errors.push('INVALID_AMOUNT');
  if (record.currency !== null && (typeof record.currency !== 'string' || !/^[A-Z]{3}$/.test(record.currency))) errors.push('INVALID_CURRENCY');
  if (record.effectiveDate !== null && !isValidDate(record.effectiveDate)) errors.push('INVALID_DATE');
  if (record.description !== null && typeof record.description !== 'string') errors.push('INVALID_DESCRIPTION');
  if (record.validationStatus === VALIDATION.CONFIRMED) {
    if (record.amount === null || record.currency === null) errors.push('UNRESOLVED_MONEY');
    if (typeof record.amount === 'string' && normalizeAmount(record.amount) !== null
      && hasFractionalCent(normalizeAmount(record.amount))) errors.push('ROUNDING_POLICY_PENDING');
    if (record.kind === 'deposit' && record.contributorId === null) errors.push('MISSING_CONTRIBUTOR');
    if (record.kind === 'withdrawal' && record.effectiveDate === null) errors.push('MISSING_WITHDRAWAL_DATE');
  }
  return [...new Set(errors)];
}

// No conversion, sum or fallback to zero. Invalid records remain visible for review.
export function partitionMovements(records) {
  const groups = { simulated: [], confirmed: [], pending: [], rejected: [], invalid: [] };
  for (const record of records) {
    if (validateMovement(record).length) groups.invalid.push(record);
    else if (record.origin === ORIGINS.SIMULATED) groups.simulated.push(record);
    else groups[record.validationStatus].push(record);
  }
  return groups;
}
