import { addAmounts } from './amounts.js';
import { EVIDENCE_FIELDS, evidenceBinding, resolveExcelReference, sourceOperationKey } from './excelEvidence.js';
import { IDENTITIES, inspectMovementBatch } from './models.js';
import { normalizeLabel, recognizePurpose } from './controlWorkbook.js';

// Preimport review of movements read from a local workbook. A "prepared" movement
// is only ready for a future import: it is never confirmed, posted or summed with
// real history, and it never leaves session memory.
const text = value => typeof value === 'string' && value.trim().length > 0;
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const stableJson = value => JSON.stringify(canonical(value));
export const isReviewTimestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const facts = record => Object.fromEntries(['kind', 'effectiveDate', 'period', 'currency', 'amount', 'contributorId', 'purpose', 'description']
  .map(key => [key, record[key] ?? null]));

// Household scope belongs to the future authenticated import, not to the file.
const DEFERRED = new Set(['MISSING_CONFIRMED_HOUSEHOLD']);

export function isPreimportReview(review, decisions = false) {
  return plain(review) && text(review.id) && text(review.binding) && text(review.reason) && text(review.evidenceReference)
    && IDENTITIES.some(identity => identity.id === review.reviewedBy) && isReviewTimestamp(review.reviewedAt)
    && (decisions ? ['prepared', 'rejected'].includes(review.decision) : ['purpose', 'distinct'].includes(review.field));
}

const purposeCapture = (record, context) => record.provenance?.cells?.purpose
  ? resolveExcelReference(record, { sheet: record.provenance.sheet, ref: record.provenance.cells.purpose }, context) : null;

export function purposeBinding(record, context) {
  return stableJson({ field: 'purpose', operation: sourceOperationKey(record, context), captured: purposeCapture(record, context), purpose: record.purpose ?? null });
}

// Values that suggest the same real operation was entered twice in one file.
const valueKey = record => stableJson([record.provenance.sourceFingerprint, record.provenance.sheet, record.kind, record.kind === 'withdrawal'
  ? [record.provenance.original.date, record.provenance.original.amount, normalizeLabel(record.provenance.original.description)]
  : [record.provenance.original.month, record.provenance.original.year, record.provenance.operation.amountRef.replace(/\d+$/, '')]]);
// Same physical position with the same original text in a different file version.
const versionKey = record => stableJson([normalizeLabel(record.provenance.sheet), record.provenance.operation.amountRef, record.kind, record.provenance.original.amount]);

function relatedIds(record, records) {
  const values = records.filter(other => other.id !== record.id && valueKey(other) === valueKey(record)).map(other => other.id);
  const versions = records.filter(other => other.provenance.sourceFingerprint !== record.provenance.sourceFingerprint
    && versionKey(other) === versionKey(record)).map(other => other.id);
  return { values: values.sort(), versions: versions.sort() };
}

export function distinctBinding(record, records, context) {
  return stableJson({ field: 'distinct', operation: sourceOperationKey(record, context), facts: facts(record), related: relatedIds(record, records) });
}

const resolved = (record, field, binding) => Array.isArray(record.preimportResolutions)
  && record.preimportResolutions.some(review => isPreimportReview(review) && review.field === field && review.binding === binding);

/** Everything a decision depends on, except the decisions themselves. */
export function decisionBinding(record, context) {
  return stableJson({ id: record.id, operation: sourceOperationKey(record, context), facts: facts(record), provenance: record.provenance,
    periodAssignment: record.periodAssignment ?? null, evidenceReviews: record.evidenceReviews ?? [], resolutions: record.preimportResolutions ?? [],
    evidence: EVIDENCE_FIELDS.map(field => evidenceBinding(record, field, context)) });
}

export const PREIMPORT_CATEGORIES = Object.freeze(['evidence', 'contributor', 'currency', 'period', 'duplicate', 'interpretation']);
function categorize(record, reasons) {
  const found = new Set();
  for (const reason of reasons) {
    if (/CONTRIBUTOR/.test(reason)) found.add('contributor');
    else if (/CURRENCY/.test(reason)) found.add('currency');
    else if (/PERIOD|EFFECTIVE_DATE|WITHDRAWAL_DATE/.test(reason)) found.add('period');
    else if (/DUPLICATE|OTHER_VERSION/.test(reason)) found.add('duplicate');
    else if (reason === 'UNRESOLVED_MONEY') { if (record.currency === null) found.add('currency'); if (record.amount === null) found.add('interpretation'); }
    else found.add('interpretation');
  }
  return found.size ? [...found] : ['evidence'];
}

export function inspectPreimport(records, context) {
  const sameValues = new Map();
  for (const record of records) sameValues.set(valueKey(record), (sameValues.get(valueKey(record)) ?? 0) + 1);
  return inspectMovementBatch(records, context).map(inspection => {
    const { record } = inspection;
    const errors = [...inspection.errors];
    const deferred = inspection.pendingReasons.filter(reason => DEFERRED.has(reason));
    const pendingReasons = inspection.pendingReasons.filter(reason => !DEFERRED.has(reason));
    if (!Array.isArray(record.preimportResolutions) || record.preimportResolutions.some(review => !isPreimportReview(review))
      || !Array.isArray(record.preimportDecisions) || record.preimportDecisions.some(review => !isPreimportReview(review, true))) errors.push('INVALID_PREIMPORT_REVIEW');
    if (record.origin !== 'real' || record.validationStatus !== 'pending' || record.provenance?.type !== 'control-excel') errors.push('PREIMPORT_SOURCE_REQUIRED');
    if (!errors.length) {
      if (record.purpose !== null) {
        const captured = purposeCapture(record, context);
        const verified = captured && captured.value === record.provenance.original?.purpose && recognizePurpose(captured.value) === record.purpose;
        if (!verified && !resolved(record, 'purpose', purposeBinding(record, context))) pendingReasons.push('PURPOSE_REVIEW_REQUIRED');
      }
      if (record.amount === '0') pendingReasons.push('ZERO_AMOUNT_POLICY_PENDING');
      const related = relatedIds(record, records);
      const acknowledged = resolved(record, 'distinct', distinctBinding(record, records, context));
      if (related.values.length && !acknowledged) pendingReasons.push('POSSIBLE_DUPLICATE_VALUES');
      if (related.versions.length && !acknowledged) pendingReasons.push('OTHER_VERSION_SAME_OPERATION');
    }
    const binding = errors.length ? null : decisionBinding(record, context);
    const decisions = Array.isArray(record.preimportDecisions) ? record.preimportDecisions.filter(review => isPreimportReview(review, true)) : [];
    const current = binding ? decisions.findLast(review => review.binding === binding) : null;
    const reasons = [...new Set(pendingReasons)];
    const status = errors.length ? 'invalid' : current?.decision === 'rejected' ? 'rejected'
      : current?.decision === 'prepared' && !reasons.length ? 'prepared' : 'pending';
    return { record, errors: [...new Set(errors)], pendingReasons: reasons, deferred, status, decision: current ?? null,
      staleDecisions: decisions.filter(review => review.binding !== binding).length,
      categories: errors.length ? ['interpretation'] : categorize(record, reasons),
      possibleDuplicates: sameValues.get(valueKey(record)) > 1,
      // Preimport never confirms money, whatever its review state.
      eligibleForConfirmed: false };
  });
}

/** Per-file counts and prepared totals; never mixes currencies or files. */
export function summarizePreimport(entries, fingerprint) {
  const selected = entries.filter(entry => entry.record.provenance.sourceFingerprint === fingerprint);
  const count = status => selected.filter(entry => entry.status === status).length;
  const groups = new Map();
  for (const { record } of selected.filter(entry => entry.status === 'prepared')) {
    const contributorId = record.kind === 'deposit' ? record.contributorId : null;
    const key = stableJson([record.currency, record.kind, record.purpose, contributorId]);
    const group = groups.get(key) ?? { currency: record.currency, kind: record.kind, purpose: record.purpose, contributorId, total: '0', count: 0 };
    group.total = addAmounts(group.total, record.amount);
    group.count += 1;
    groups.set(key, group);
  }
  return { identified: selected.length, deposits: selected.filter(entry => entry.record.kind === 'deposit').length,
    withdrawals: selected.filter(entry => entry.record.kind === 'withdrawal').length,
    prepared: count('prepared'), pending: count('pending'), rejected: count('rejected'), invalid: count('invalid'),
    groups: [...groups.values()].sort((a, b) => stableJson([a.currency, a.kind, a.purpose, a.contributorId]).localeCompare(stableJson([b.currency, b.kind, b.purpose, b.contributorId]))) };
}
