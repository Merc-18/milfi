import { normalizeAmount } from '../domain/amounts.js';
import { evidenceBinding, isEvidenceReview } from '../domain/excelEvidence.js';
import { IDENTITIES, isKnownCurrency, isValidDate, isValidPeriod } from '../domain/models.js';
import { recognizeControlWorkbook } from '../domain/controlWorkbook.js';
import { decisionBinding, distinctBinding, inspectPreimport, isPreimportReview, isReviewTimestamp, purposeBinding } from '../domain/controlPreimport.js';
import { readXlsxCapture } from '../infrastructure/xlsx/workbook.js';

/** Reads and recognizes a local workbook. The bytes are never stored or sent anywhere. */
export async function readControlWorkbook(bytes) {
  const read = await readXlsxCapture(bytes);
  return read.ok ? recognizeControlWorkbook(read.capture) : read;
}

const fail = (...errors) => ({ ok: false, errors });
const reviewer = input => IDENTITIES.some(identity => identity.id === input.reviewedBy) && typeof input.reason === 'string' && !!input.reason.trim()
  && typeof input.evidenceReference === 'string' && !!input.evidenceReference.trim() && isReviewTimestamp(input.occurredAt)
  && typeof input.reviewId === 'string' && !!input.reviewId.trim();
const sameMonth = (date, period) => Number(date.slice(0, 4)) === period.year && Number(date.slice(5, 7)) === period.month;
export const RESOLVABLE_FIELDS = Object.freeze(['amount', 'currency', 'contributorId', 'effectiveDate', 'period', 'purpose', 'distinct']);

// Applies one explicit, traceable resolution per record. A bulk request is only a
// convenience: every record receives its own review bound to its own evidence.
function resolveOne(record, input, index, records, context) {
  const next = structuredClone(record);
  const meta = { reason: input.reason.trim(), reviewedBy: input.reviewedBy, reviewedAt: input.occurredAt, evidenceReference: input.evidenceReference.trim() };
  const reviewId = field => `${input.reviewId.trim()}:${index}:${field}`;
  const evidenceReview = field => ({ id: reviewId(field), field, decision: 'accepted', binding: evidenceBinding(next, field, context), ...meta });
  const fields = [];
  switch (input.field) {
    case 'amount': {
      const amount = typeof input.value?.amount === 'string' ? normalizeAmount(input.value.amount) : null;
      if (amount === null) return fail('INVALID_AMOUNT');
      if (!isKnownCurrency(input.value?.currency)) return fail('INVALID_CURRENCY');
      Object.assign(next, { amount, currency: input.value.currency }); fields.push('amount', 'currency');
      break;
    }
    case 'currency':
      if (!isKnownCurrency(input.value)) return fail('INVALID_CURRENCY');
      next.currency = input.value; fields.push('currency');
      break;
    case 'contributorId':
      if (record.kind !== 'deposit') return fail('WITHDRAWAL_CONTRIBUTOR_WITHOUT_EVIDENCE');
      if (!IDENTITIES.some(identity => identity.id === input.value)) return fail('INVALID_CONTRIBUTOR');
      next.contributorId = input.value; fields.push('contributorId');
      break;
    case 'effectiveDate':
      if (record.kind !== 'withdrawal') return fail('DEPOSIT_DATE_WITHOUT_EVIDENCE');
      if (!isValidDate(input.value)) return fail('INVALID_DATE');
      next.effectiveDate = input.value; fields.push('effectiveDate');
      break;
    case 'period':
      if (!isValidPeriod(input.value)) return fail('INVALID_PERIOD');
      next.period = { year: input.value.year, month: input.value.month }; fields.push('period');
      break;
    case 'purpose':
      if (!['expenses', 'savings'].includes(input.value)) return fail('INVALID_PURPOSE');
      next.purpose = input.value;
      break;
    case 'distinct':
      break;
    default:
      return fail('INVALID_FIELD');
  }
  // A month different from the operation date is never assumed: it needs this explicit assignment.
  delete next.periodAssignment;
  if (next.effectiveDate && next.period && !sameMonth(next.effectiveDate, next.period)) {
    if (input.field === 'period' && input.acceptPeriodAssignment === true) {
      next.periodAssignment = { decision: 'accepted', effectivePeriod: { year: Number(next.effectiveDate.slice(0, 4)), month: Number(next.effectiveDate.slice(5, 7)) },
        postingPeriod: structuredClone(next.period), reason: meta.reason, reviewedBy: meta.reviewedBy, evidenceReference: meta.evidenceReference };
    } else if (record.periodAssignment && input.field !== 'period' && input.field !== 'effectiveDate') next.periodAssignment = structuredClone(record.periodAssignment);
  }
  for (const field of fields) {
    const review = evidenceReview(field);
    if (!isEvidenceReview(review)) return fail('FIELD_WITHOUT_EVIDENCE');
    next.evidenceReviews = [...(next.evidenceReviews ?? []), review];
  }
  if (input.field === 'purpose' || input.field === 'distinct') {
    const binding = input.field === 'purpose' ? purposeBinding(next, context) : distinctBinding(next, records, context);
    const resolution = { id: reviewId(input.field), field: input.field, binding, ...meta };
    if (!isPreimportReview(resolution)) return fail('INCOMPLETE_REVIEW');
    next.preimportResolutions = [...(next.preimportResolutions ?? []), resolution];
  }
  next.revision += 1;
  return { ok: true, value: next };
}

/** Resolves a field for one or more records; all-or-nothing. Never confirms money. */
export function prepareFieldResolution(input, records, context) {
  if (!input || !Array.isArray(input.recordIds) || !input.recordIds.length || !RESOLVABLE_FIELDS.includes(input.field)) return fail('INVALID_COMMAND');
  if (!reviewer(input)) return fail('INCOMPLETE_REVIEW');
  const targets = input.recordIds.map(id => records.find(record => record.id === id));
  if (targets.some(record => !record)) return fail('MOVEMENT_NOT_FOUND');
  if (input.expectedRevisions && targets.some(record => input.expectedRevisions[record.id] !== record.revision)) return fail('STALE_REVISION');
  const updated = [];
  for (const [index, record] of targets.entries()) {
    const result = resolveOne(record, input, index, records, context);
    if (!result.ok) return result;
    updated.push(result.value);
  }
  return { ok: true, value: updated };
}

/** Marks a movement as prepared for a future import, or rejects it, bound to its current state. */
export function preparePreimportDecision(input, records, context) {
  if (!input || !['prepared', 'rejected'].includes(input.decision)) return fail('INVALID_COMMAND');
  if (!reviewer(input)) return fail('INCOMPLETE_REVIEW');
  const record = records.find(item => item.id === input.recordId);
  if (!record) return fail('MOVEMENT_NOT_FOUND');
  if (input.expectedRevision !== undefined && input.expectedRevision !== record.revision) return fail('STALE_REVISION');
  const entry = inspectPreimport(records, context).find(item => item.record.id === record.id);
  if (input.decision === 'prepared' && entry.errors.length) return fail(...entry.errors);
  if (input.decision === 'prepared' && entry.pendingReasons.length) return fail(...entry.pendingReasons);
  if (input.decision === 'rejected' && entry.errors.length) return fail('INVALID_MOVEMENT_CANNOT_BE_BOUND', ...entry.errors);
  const next = structuredClone(record);
  next.preimportDecisions = [...(next.preimportDecisions ?? []), { id: input.reviewId.trim(), decision: input.decision, binding: decisionBinding(record, context),
    reason: input.reason.trim(), reviewedBy: input.reviewedBy, reviewedAt: input.occurredAt, evidenceReference: input.evidenceReference.trim() }];
  next.revision += 1;
  return { ok: true, value: next };
}
