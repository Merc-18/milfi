import { evidenceBinding, isEvidenceReview } from '../domain/excelEvidence.js';
import { inspectMovement } from '../domain/models.js';

// Prepare a traceable, record-specific review. This is a pure domain operation:
// it neither authenticates the declared reviewer nor confirms/posts any money.
export function prepareEvidenceReview({ record, field, id, reason, reviewedBy, reviewedAt, evidenceReference } = {}, context) {
  const inspection = inspectMovement(record, context);
  if (inspection.errors.length || record?.origin !== 'real' || record.validationStatus === 'rejected') {
    return { ok: false, reason: 'RECORD_NOT_REVIEWABLE' };
  }
  const binding = evidenceBinding(record, field, context);
  const review = { id, field, decision: 'accepted', binding, reason, reviewedBy, reviewedAt, evidenceReference };
  if (!isEvidenceReview(review)) return { ok: false, reason: 'INCOMPLETE_EVIDENCE_REVIEW' };
  if (record.evidenceReviews !== undefined && !Array.isArray(record.evidenceReviews)) return { ok: false, reason: 'INVALID_REVIEW_HISTORY' };
  const history = record.evidenceReviews ?? [];
  if (history.some(previous => previous?.id.trim() === id.trim())) return { ok: false, reason: 'DUPLICATE_REVIEW_ID' };
  if (!Number.isSafeInteger(record.revision + 1)) return { ok: false, reason: 'REVISION_LIMIT' };
  return { ok: true, value: structuredClone({ ...record, validationStatus: 'pending', revision: record.revision + 1,
    evidenceReviews: [...history, review] }) };
}
