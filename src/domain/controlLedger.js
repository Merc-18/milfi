import { validContribution } from './controlContributions.js';
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
// planPeriod is deliberately not a fact: assigning or changing the plan month of a
// savings deposit is an allocation, so it never makes a review stale.
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
    if (record?.provenance?.contribution && (record.kind !== 'deposit' || !validContribution(record.provenance.contribution, record.amount))) {
      return { record, errors: ['INVALID_CONTRIBUTION_SPLIT'], pendingReasons: ['INVALID_CONTRIBUTION_SPLIT'], status: 'invalid', review: null, staleReviews: 0 };
    }
    if (source === 'control-excel') {
      // Evidence captures are not stored, so imported rows are shown with the
      // decision they were imported with, never re-declared as verified. An
      // in-app review bound to the current state (see prepareImportedReview)
      // takes over; otherwise rows without a "prepared" decision stay pending.
      // "imported" only counts when no review reason is left on the row.
      const missing = inspection.pendingReasons.filter(reason => !['MISSING_CONFIRMED_HOUSEHOLD', 'SOURCE_NOT_VERIFIED'].includes(reason));
      if (record.amount === '0') missing.push('ZERO_AMOUNT_POLICY_PENDING');
      const unique = [...new Set(missing)];
      const reviews = record.manualReviews ?? [];
      const binding = ledgerReviewBinding(record);
      const current = reviews.findLast(review => review.binding === binding) ?? null;
      if (current?.decision === 'rejected') return { record, errors: [], pendingReasons: unique, status: 'rejected', review: current, staleReviews: 0 };
      if (current?.decision === 'accepted' && !unique.length) return { record, errors: [], pendingReasons: [], status: 'reviewed', review: current, staleReviews: 0 };
      const decision = (record.preimportDecisions ?? []).at(-1) ?? null;
      if (decision?.decision === 'prepared' && !unique.length) return { record, errors: [], pendingReasons: [], status: 'imported', review: decision, staleReviews: 0 };
      return { record, errors: [], pendingReasons: unique.length ? unique : ['IMPORT_REVIEW_REQUIRED'], status: 'pending', review: null,
        staleReviews: reviews.filter(review => review.binding !== binding).length };
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
  // A plan assignment is explicit and optional; receipt dates are never shifted.
  const planPeriod = input.planPeriod !== undefined ? input.planPeriod : previous?.planPeriod ?? null;
  if (planPeriod !== null && !isValidPeriod(planPeriod)) return fail('INVALID_PLAN_PERIOD');
  const record = { id: input.id, schemaVersion: 1, moduleId: 'control-mf', origin: 'real', validationStatus: 'pending',
    householdId: input.householdId, revision: previous?.revision ?? 0, actorId: input.actorId, ...current,
    planPeriod: current.kind === 'deposit' && current.purpose === 'savings' && planPeriod ? { year: planPeriod.year, month: planPeriod.month } : null,
    provenance: previous
      ? { ...structuredClone(previous.provenance), statement: input.provenanceNote.trim() }
      : { type: 'control-manual', sourceId: 'milfi-app', operationId: input.operationId.trim(), statement: input.provenanceNote.trim(),
        enteredBy: input.actorId, original: { ...current, amount: input.amount } },
    manualReviews: structuredClone(previous?.manualReviews ?? []) };
  if (Object.hasOwn(input, 'contribution') && input.contribution !== undefined) {
    if (current.kind !== 'deposit' || (input.contribution !== null && !validContribution(input.contribution, current.amount))) return fail('INVALID_CONTRIBUTION_SPLIT');
    if (input.contribution === null) delete record.provenance.contribution;
    else record.provenance.contribution = { version: 1, regular: normalizeAmount(input.contribution.regular), extra: normalizeAmount(input.contribution.extra) };
  }
  if (current.kind !== 'deposit') delete record.provenance.contribution;
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

const CORRECTABLE = ['amount', 'currency', 'contributorId', 'effectiveDate', 'period', 'description'];

/**
 * In-app review of a movement loaded from the workbook: optional corrections of
 * its unresolved fields (the original values stay in provenance), then an
 * accepted or rejected review bound to the corrected state. Accepting requires
 * no pending reason left; a cross-period assignment is accepted explicitly.
 */
export function prepareImportedReview(input, records = []) {
  const previous = records.find(record => record.id === input?.id);
  if (!previous) return fail('MOVEMENT_NOT_FOUND');
  if (previous.provenance?.type !== 'control-excel') return fail('IMPORTED_MOVEMENT_REQUIRED');
  if (input.expectedRevision !== previous.revision) return fail('STALE_REVISION');
  if (!['accepted', 'rejected'].includes(input.decision) || !identity(input.reviewedBy) || !text(input.reason) || !text(input.evidenceReference)) {
    return fail('INCOMPLETE_DEMO_REVIEW');
  }
  const corrections = plain(input.corrections) ? input.corrections : {};
  if (Object.keys(corrections).some(key => !CORRECTABLE.includes(key))) return fail('INVALID_CORRECTION');
  const record = structuredClone(previous);
  let changed = false;
  for (const [field, value] of Object.entries(corrections)) {
    const next = field === 'amount' ? (typeof value === 'string' ? normalizeAmount(value) : null)
      : field === 'period' ? (isValidPeriod(value) ? { year: value.year, month: value.month } : null)
        : field === 'effectiveDate' ? (isValidDate(value) ? value : null) : typeof value === 'string' && value.trim() ? value.trim() : null;
    if (next === null) return fail(`INVALID_${field.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
    if (json(record[field] ?? null) !== json(next)) { record[field] = next; changed = true; }
  }
  if (input.decision === 'accepted' && input.acceptPeriodAssignment === true && isValidDate(record.effectiveDate) && isValidPeriod(record.period)
    && !sameMonth(record.effectiveDate, record.period)) {
    record.periodAssignment = { decision: 'accepted', effectivePeriod: { year: Number(record.effectiveDate.slice(0, 4)), month: Number(record.effectiveDate.slice(5, 7)) },
      postingPeriod: structuredClone(record.period), reason: input.reason.trim(), reviewedBy: input.reviewedBy, evidenceReference: input.evidenceReference.trim() };
    changed = true;
  }
  const inspection = inspectLedger(records.map(other => other.id === record.id ? record : other)).find(item => item.record.id === record.id);
  if (inspection.errors.length) return fail(...inspection.errors);
  if (input.decision === 'accepted') {
    const left = inspection.pendingReasons.filter(reason => reason !== 'IMPORT_REVIEW_REQUIRED');
    if (left.length) return fail(...left);
  }
  return { ok: true, record, changed, review: { review_type: 'manual', field: null, decision: input.decision, binding: ledgerReviewBinding(record),
    reason: input.reason.trim(), evidence_reference: input.evidenceReference.trim() } };
}

/** Assigns (or clears) the Fiorella plan month of a savings deposit, manual or imported. */
export function prepareControlPlanAssignment(input, records = []) {
  const previous = records.find(record => record.id === input?.id);
  if (!previous) return fail('MOVEMENT_NOT_FOUND');
  if (input.expectedRevision !== previous.revision) return fail('STALE_REVISION');
  if (previous.kind !== 'deposit' || previous.purpose !== 'savings') return fail('SAVINGS_DEPOSIT_REQUIRED');
  if (input.planPeriod !== null && !isValidPeriod(input.planPeriod)) return fail('INVALID_PLAN_PERIOD');
  const record = { ...structuredClone(previous), planPeriod: input.planPeriod ? { year: input.planPeriod.year, month: input.planPeriod.month } : null };
  return { ok: true, value: record, previous };
}

/** Reviewed movements (manual or imported as prepared) per currency/kind/destination; never a balance. */
export function summarizeLedger(entries, period) {
  if (!isValidPeriod(period)) return { status: 'invalid', groups: [], entries: [] };
  const selected = entries.filter(entry => entry.record.period?.year === period.year && entry.record.period?.month === period.month);
  const groups = new Map();
  for (const { record } of selected.filter(entry => entry.status === 'reviewed' || entry.status === 'imported')) {
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
