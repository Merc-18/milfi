import { addAmounts, normalizeAmount } from './amounts.js';
import { IDENTITIES, inspectMovementBatch, isValidDate, isValidPeriod } from './models.js';
import { possibleControlDuplicates } from './controlSession.js';

// Real Control Finanzas M&F ledger (Phase 4.2). Manual movements typed by the
// Control manager are real but stay "pending": a review records that the data
// were checked; it never confirms or reconciles money. Imported Excel movements
// keep the preimport decision and provenance they were imported with.
const text = value => typeof value === 'string' && !!value.trim();
const identity = value => IDENTITIES.some(person => person.id === value);
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const json = value => JSON.stringify(canonical(value));
const fail = (...errors) => ({ ok: false, errors });
const FACTS = ['kind', 'effectiveDate', 'period', 'currency', 'amount', 'contributorId', 'purpose', 'description'];
const facts = record => Object.fromEntries(FACTS.map(key => [key, record[key] ?? null]));
const sameMonth = (date, period) => Number(date.slice(0, 4)) === period.year && Number(date.slice(5, 7)) === period.month;

/** A review binds to the whole movement state: any later edit makes it stale. */
export function ledgerReviewBinding(record) {
  return json({ id: record.id, facts: facts(record), provenance: record.provenance, periodAssignment: record.periodAssignment ?? null });
}

export function inspectLedger(records) {
  return inspectMovementBatch(records).map(inspection => {
    const { record } = inspection;
    const source = record?.provenance?.type;
    if (source === 'control-excel') {
      // Evidence captures are not stored, so imported rows are shown with the
      // decision they were imported with, never re-declared as verified.
      const decision = (record.preimportDecisions ?? []).at(-1) ?? null;
      return { record, errors: [], pendingReasons: [], status: 'imported', review: decision, staleReviews: 0 };
    }
    const errors = [...inspection.errors];
    if (source !== 'control-manual' || record.origin !== 'real' || record.validationStatus !== 'pending') errors.push('LEDGER_SOURCE_REQUIRED');
    const pendingReasons = inspection.pendingReasons.filter(reason => reason !== 'MISSING_CONFIRMED_HOUSEHOLD' || !record.householdId);
    if (record.amount === '0') pendingReasons.push('ZERO_AMOUNT_POLICY_PENDING');
    const reviews = record.manualReviews ?? [];
    const binding = ledgerReviewBinding(record);
    const current = reviews.findLast(review => review.binding === binding) ?? null;
    const unique = [...new Set(pendingReasons)];
    const status = errors.length ? 'invalid' : current?.decision === 'rejected' ? 'rejected'
      : current?.decision === 'accepted' && !unique.length ? 'reviewed' : 'pending';
    return { record, errors: [...new Set(errors)], pendingReasons: unique, status, review: current,
      staleReviews: reviews.filter(review => review.binding !== binding).length };
  });
}

/** Prepares a new or edited real manual movement. Persistence assigns timestamps. */
export function prepareControlEntry(input, records = []) {
  if (!plain(input)) return fail('INVALID_COMMAND');
  const previous = records.find(record => record.id === input.id);
  if (!text(input.id) || !text(input.householdId)) return fail('INVALID_COMMAND');
  if (previous && previous.provenance?.type !== 'control-manual') return fail('MANUAL_ENTRY_REQUIRED');
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== (previous?.revision ?? 0)) return fail('STALE_REVISION');
  if (!isValidPeriod(input.period) || !isValidDate(input.effectiveDate)) return fail('INVALID_DATE_OR_PERIOD');
  if (typeof input.amount !== 'string' || normalizeAmount(input.amount) === null) return fail('INVALID_AMOUNT');
  if (!identity(input.actorId) || typeof input.description !== 'string' || input.description.length > 1000
    || !text(input.provenanceNote) || input.provenanceNote.length > 500) return fail('INCOMPLETE_DECLARATION');
  if (!previous && !text(input.operationId)) return fail('MISSING_OPERATION_IDENTITY');
  const current = { kind: input.kind, effectiveDate: input.effectiveDate, period: { year: input.period.year, month: input.period.month },
    currency: input.currency, amount: normalizeAmount(input.amount), contributorId: input.contributorId, purpose: input.purpose,
    description: input.description.trim() || null };
  const record = { id: input.id, schemaVersion: 1, moduleId: 'control-mf', origin: 'real', validationStatus: 'pending',
    householdId: input.householdId, revision: previous?.revision ?? 0, actorId: input.actorId, ...current,
    provenance: previous
      ? { ...structuredClone(previous.provenance), statement: input.provenanceNote.trim() }
      : { type: 'control-manual', sourceId: 'milfi-app', operationId: input.operationId.trim(), statement: input.provenanceNote.trim(),
        enteredBy: input.actorId, original: { ...current, amount: input.amount } },
    manualReviews: structuredClone(previous?.manualReviews ?? []) };
  const inspection = inspectLedger([...records.filter(other => other.id !== record.id), record]).find(item => item.record.id === record.id);
  if (inspection.errors.length) return fail(...inspection.errors);
  const possible = possibleControlDuplicates(record, records);
  if (possible.length && !text(input.distinctOperationReason)) return { ...fail('POSSIBLE_DUPLICATE_REQUIRES_REVIEW'), possibleDuplicates: possible };
  record.provenance.distinctOperationReason = possible.length ? input.distinctOperationReason.trim() : null;
  return { ok: true, value: record, previous: previous ?? null };
}

/** Prepares an explicit review; may record a reviewed cross-period assignment. */
export function prepareControlEntryReview(input, records = []) {
  const previous = records.find(record => record.id === input?.id);
  if (!previous) return fail('MOVEMENT_NOT_FOUND');
  if (input.expectedRevision !== previous.revision) return fail('STALE_REVISION');
  if (!['accepted', 'rejected'].includes(input.decision) || !identity(input.reviewedBy) || !text(input.reason) || !text(input.evidenceReference)) return fail('INCOMPLETE_DEMO_REVIEW');
  const record = structuredClone(previous);
  let changed = false;
  if (input.decision === 'accepted' && input.acceptPeriodAssignment === true && !sameMonth(record.effectiveDate, record.period)) {
    record.periodAssignment = { decision: 'accepted', effectivePeriod: { year: Number(record.effectiveDate.slice(0, 4)), month: Number(record.effectiveDate.slice(5, 7)) },
      postingPeriod: structuredClone(record.period), reason: input.reason.trim(), reviewedBy: input.reviewedBy, evidenceReference: input.evidenceReference.trim() };
    changed = true;
  }
  const inspection = inspectLedger(records.map(other => other.id === record.id ? record : other)).find(item => item.record.id === record.id);
  if (inspection.errors.length) return fail(...inspection.errors);
  if (input.decision === 'accepted' && inspection.pendingReasons.length) return fail(...inspection.pendingReasons);
  return { ok: true, record, changed, review: { review_type: 'manual', field: null, decision: input.decision, binding: ledgerReviewBinding(record),
    reason: input.reason.trim(), evidence_reference: input.evidenceReference.trim() } };
}

/** Reviewed manual movements per currency/kind/destination; never a balance. */
export function summarizeLedger(entries, period) {
  if (!isValidPeriod(period)) return { status: 'invalid', groups: [], entries: [] };
  const selected = entries.filter(entry => entry.record.period?.year === period.year && entry.record.period?.month === period.month);
  const groups = new Map();
  for (const { record } of selected.filter(entry => entry.status === 'reviewed')) {
    const contributorId = record.kind === 'deposit' ? record.contributorId : null;
    const key = json([record.currency, record.kind, record.purpose, contributorId]);
    const group = groups.get(key) ?? { currency: record.currency, kind: record.kind, purpose: record.purpose, contributorId, total: '0', count: 0 };
    group.total = addAmounts(group.total, record.amount);
    group.count += 1;
    groups.set(key, group);
  }
  return { status: 'ledger', groups: [...groups.values()], entries: selected,
    deposits: selected.filter(entry => entry.record.kind === 'deposit').length,
    withdrawals: selected.filter(entry => entry.record.kind === 'withdrawal').length,
    pending: selected.filter(entry => entry.status === 'pending').length,
    imported: selected.filter(entry => entry.status === 'imported').length };
}
