import { addAmounts, normalizeAmount } from './amounts.js';
import { EVIDENCE_FIELDS, evidenceBinding, sourceOperationKey } from './excelEvidence.js';
import { IDENTITIES, inspectMovementBatch, isValidDate, isValidPeriod } from './models.js';

const text = value => typeof value === 'string' && !!value.trim();
const identity = value => IDENTITIES.some(person => person.id === value);
const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const json = value => JSON.stringify(canonical(value));
const facts = record => Object.fromEntries(['kind', 'effectiveDate', 'period', 'currency', 'amount', 'contributorId', 'purpose', 'description', 'actorId'].map(key => [key, record[key]]));
const fail = (...errors) => ({ ok: false, errors });

// This binding is a traceability token, not a signature or authenticated proof.
// Content versions prevent an old acceptance becoming valid after an edit/revert.
export function controlReviewBinding(record, context) {
  return json({ id: record.id, contentVersion: record.contentVersion, facts: facts(record), provenance: record.provenance,
    periodAssignment: record.periodAssignment ?? null,
    excelEvidence: EVIDENCE_FIELDS.map(field => evidenceBinding(record, field, context)) });
}

function validReview(review) {
  return plain(review) && text(review.id) && ['accepted', 'rejected'].includes(review.decision)
    && text(review.binding) && text(review.reason) && text(review.evidenceReference)
    && identity(review.reviewedBy) && timestamp(review.reviewedAt);
}

export function controlOperationKey(record, context) {
  if (record?.provenance?.type !== 'control-session-demo') return sourceOperationKey(record, context);
  return text(record.provenance.sourceId) && text(record.provenance.operationId)
    ? json(['control-session-demo', record.provenance.sourceId.trim(), record.provenance.operationId.trim()]) : null;
}

export function possibleControlDuplicates(record, records) {
  // Matching values are only a warning: different effective operations may share them.
  const key = value => json(Object.fromEntries(['kind', 'effectiveDate', 'period', 'currency', 'amount', 'contributorId', 'purpose'].map(field => [field, value[field]])));
  return records.filter(other => other.id !== record.id && key(other) === key(record)).map(other => other.id);
}

export function inspectControlSession(records, context) {
  const keys = records.map(record => controlOperationKey(record, context));
  return inspectMovementBatch(records, context).map((inspection, index) => {
    const { record } = inspection;
    const errors = [...inspection.errors];
    const pendingReasons = [...inspection.pendingReasons];
    if (record?.origin !== 'simulated' || record?.validationStatus !== 'pending'
      || !['control-session-demo', 'control-demo-excel'].includes(record?.provenance?.type)) errors.push('CONTROL_DEMO_REQUIRED');
    if (keys[index] && keys.filter(key => key === keys[index]).length > 1) errors.push('DUPLICATE_SOURCE_OPERATION');
    if (!Number.isSafeInteger(record?.contentVersion) || record.contentVersion < 1) errors.push('INVALID_CONTENT_VERSION');
    if (record?.provenance?.type === 'control-session-demo') {
      const source = record.provenance;
      if (!text(source.statement) || !plain(source.original) || !text(source.operationId)
        || !text(source.enteredBy) || !identity(source.enteredBy) || !timestamp(source.enteredAt)
        || source.original.operationId !== source.operationId
        || Object.hasOwn(source, 'cells') || Object.hasOwn(source, 'evidence') || Object.hasOwn(source, 'sourceFingerprint')) errors.push('INVALID_MANUAL_DEMO_PROVENANCE');
    }
    if (!record?.effectiveDate) pendingReasons.push('DEMO_DATE_REQUIRED');
    if (!record?.actorId) pendingReasons.push('DECLARED_RECORDER_REQUIRED');
    if (record?.amount === '0') pendingReasons.push('ZERO_AMOUNT_POLICY_PENDING');
    const reviews = record?.demoReviews;
    if (!Array.isArray(reviews) || reviews.some(review => !validReview(review))) errors.push('INVALID_DEMO_REVIEWS');
    else if (new Set(reviews.map(review => review.id.trim())).size !== reviews.length) errors.push('DUPLICATE_REVIEW_ID');
    const current = Array.isArray(reviews) ? reviews.findLast(review => validReview(review) && review.binding === controlReviewBinding(record, context)) : null;
    const uniqueErrors = [...new Set(errors)];
    const uniquePending = [...new Set(pendingReasons)];
    const status = uniqueErrors.length ? 'invalid' : current?.decision === 'rejected' ? 'rejected'
      : current?.decision === 'accepted' && !uniquePending.length ? 'reviewed' : 'pending';
    return { record, errors: uniqueErrors, pendingReasons: uniquePending, status,
      needsReview: !current, staleReviews: Array.isArray(reviews) ? reviews.filter(review => validReview(review) && review.binding !== controlReviewBinding(record, context)).length : 0,
      // Never eligible for real confirmed balances, including after demo review.
      eligibleForConfirmed: false };
  });
}

function commandIssues(input, records, events) {
  if (!plain(input) || !Array.isArray(records) || !Array.isArray(events)) return ['INVALID_COMMAND'];
  if (!text(input.id) || !text(input.eventId) || !timestamp(input.occurredAt)) return ['INVALID_COMMAND_METADATA'];
  if (events.some(event => event.id === input.eventId.trim())) return ['DUPLICATE_EVENT_ID'];
  if (records.filter(record => record.id === input.id.trim()).length > 1) return ['DUPLICATE_ID'];
  const previous = records.find(record => record.id === input.id.trim());
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== (previous?.revision ?? 0)) return ['STALE_REVISION'];
  if (previous && input.occurredAt < previous.updatedAt) return ['BACKDATED_CHANGE'];
  if (input.origin !== undefined && input.origin !== 'simulated'
    || input.validationStatus !== undefined && input.validationStatus !== 'pending'
    || input.moduleId !== undefined && input.moduleId !== 'control-mf'
    || input.provenance !== undefined) return ['CONTROL_DEMO_REQUIRED'];
  if (previous && (previous.origin !== 'simulated' || previous.provenance?.type !== 'control-session-demo')) return ['MANUAL_DEMO_REQUIRED'];
  return [];
}

function resultWithEvent(record, previous, input, action) {
  if (!Number.isSafeInteger(record.revision) || !Number.isSafeInteger(record.contentVersion)) return fail('REVISION_LIMIT');
  return { ok: true, value: structuredClone(record), event: structuredClone({ id: input.eventId.trim(), recordId: record.id,
    action, occurredAt: input.occurredAt, actorId: action === 'review' ? input.reviewedBy : record.actorId,
    expectedRevision: input.expectedRevision, before: previous ?? null, after: record }) };
}

/** Creates/edits invented manual operations only. No Excel import or real write API. */
export function prepareControlDemo(input, records = [], events = []) {
  const issues = commandIssues(input, records, events);
  if (issues.length) return fail(...issues);
  const previous = records.find(record => record.id === input.id.trim());
  if (!isValidPeriod(input.period) || !isValidDate(input.effectiveDate)) return fail('INVALID_DATE_OR_PERIOD');
  if (typeof input.amount !== 'string' || normalizeAmount(input.amount) === null) return fail('INVALID_AMOUNT');
  if (!identity(input.actorId) || typeof input.description !== 'string' || input.description.length > 1000
    || !text(input.provenanceNote) || input.provenanceNote.length > 500) return fail('INCOMPLETE_DECLARATION');
  const id = input.id.trim();
  if (!previous && (!text(input.sessionId) || !text(input.operationId))) return fail('MISSING_OPERATION_IDENTITY');
  if (previous && (input.operationId !== previous.provenance.operationId || input.sessionId !== previous.provenance.sourceId)) return fail('IMMUTABLE_OPERATION_IDENTITY');
  const record = { id, schemaVersion: 1, moduleId: 'control-mf', origin: 'simulated', validationStatus: 'pending',
    householdId: 'control-demo-household', revision: (previous?.revision ?? 0) + 1, contentVersion: (previous?.contentVersion ?? 0) + 1,
    kind: input.kind, effectiveDate: input.effectiveDate, period: structuredClone(input.period), currency: input.currency,
    amount: normalizeAmount(input.amount), contributorId: input.contributorId, purpose: input.purpose,
    description: input.description.trim(), actorId: input.actorId, createdAt: previous?.createdAt ?? input.occurredAt, updatedAt: input.occurredAt,
    demoReviews: structuredClone(previous?.demoReviews ?? []),
    provenance: previous ? { ...structuredClone(previous.provenance), statement: input.provenanceNote.trim() }
      : { type: 'control-session-demo', sourceId: input.sessionId.trim(), operationId: input.operationId.trim(),
        statement: input.provenanceNote.trim(), enteredBy: input.actorId, enteredAt: input.occurredAt,
        original: { ...structuredClone(facts({ ...input, amount: input.amount })), operationId: input.operationId.trim() } } };
  const candidates = [...records.filter(other => other.id !== id), record];
  const inspection = inspectControlSession(candidates).find(item => item.record.id === id);
  if (inspection.errors.length) return fail(...inspection.errors);
  const possible = possibleControlDuplicates(record, records);
  if (possible.length && !text(input.distinctOperationReason)) return { ...fail('POSSIBLE_DUPLICATE_REQUIRES_REVIEW'), possibleDuplicates: possible };
  record.distinctOperationReason = possible.length ? input.distinctOperationReason.trim() : null;
  return resultWithEvent(record, previous, input, previous ? 'edit' : 'create');
}

/** A declared, explicit demonstration review; never authentication or confirmation. */
export function prepareControlReview(input, records = [], events = []) {
  const issues = commandIssues(input, records, events);
  if (issues.length) return fail(...issues);
  const previous = records.find(record => record.id === input.id.trim());
  if (!previous) return fail('MOVEMENT_NOT_FOUND');
  if (!text(input.reviewId) || records.some(record => record.demoReviews?.some(review => review.id.trim() === input.reviewId.trim()))) return fail('DUPLICATE_OR_MISSING_REVIEW_ID');
  const record = structuredClone(previous);
  if (input.acceptPeriodAssignment === true && input.decision === 'accepted') {
    record.periodAssignment = { decision: 'accepted', effectivePeriod: { year: Number(record.effectiveDate.slice(0, 4)), month: Number(record.effectiveDate.slice(5, 7)) },
      postingPeriod: structuredClone(record.period), reason: input.reason, reviewedBy: input.reviewedBy, evidenceReference: input.evidenceReference };
  }
  const review = { id: input.reviewId.trim(), decision: input.decision, binding: controlReviewBinding(record),
    reason: input.reason, reviewedBy: input.reviewedBy, reviewedAt: input.occurredAt, evidenceReference: input.evidenceReference };
  if (!validReview(review)) return fail('INCOMPLETE_DEMO_REVIEW');
  const inspection = inspectControlSession(records.map(other => other.id === record.id ? record : other)).find(item => item.record.id === record.id);
  if (inspection.errors.length) return fail(...inspection.errors);
  if (input.decision === 'accepted' && inspection.pendingReasons.length) return fail(...inspection.pendingReasons);
  record.demoReviews.push(review);
  record.revision += 1;
  record.updatedAt = input.occurredAt;
  return resultWithEvent(record, previous, input, 'review');
}

export function summarizeControlDemo(records, period, context) {
  if (!isValidPeriod(period)) return { status: 'invalid', groups: [], entries: [] };
  const entries = inspectControlSession(records, context).filter(item => item.record?.period?.year === period.year && item.record.period.month === period.month);
  const grouped = new Map();
  for (const entry of entries.filter(item => item.status === 'reviewed')) {
    const { record } = entry;
    const key = json([record.currency, record.kind, record.purpose, record.kind === 'deposit' ? record.contributorId : null]);
    const group = grouped.get(key) ?? { currency: record.currency, kind: record.kind, purpose: record.purpose,
      contributorId: record.kind === 'deposit' ? record.contributorId : null, total: '0', count: 0 };
    group.total = addAmounts(group.total, record.amount);
    group.count += 1;
    grouped.set(key, group);
  }
  return { status: 'demo-only', groups: [...grouped.values()], entries,
    deposits: entries.filter(item => item.record.kind === 'deposit').length,
    withdrawals: entries.filter(item => item.record.kind === 'withdrawal').length,
    pending: entries.filter(item => item.status === 'pending').length };
}
