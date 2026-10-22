import { estimateSavingsGoal } from '../domain/savingsPlanning.js';

export function prepareSavingsGoal(input, previous) {
  if (!input || typeof input !== 'object') return { ok: false, errors: ['INVALID_GOAL'] };
  const estimate = estimateSavingsGoal(input);
  if (estimate.status !== 'estimated') return { ok: false, errors: [estimate.reason ?? 'INCOMPLETE_GOAL'] };
  if (input.scope !== undefined && input.scope !== 'couple') return { ok: false, errors: ['UNVERIFIED_GOAL_SCOPE'] };
  if (typeof input.id !== 'string' || !input.id.trim() || typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 120) return { ok: false, errors: ['INVALID_GOAL_ID_OR_TITLE'] };
  if (input.origin !== undefined && input.origin !== 'simulated'
    || input.validationStatus !== undefined && input.validationStatus !== 'pending'
    || input.currency !== undefined && input.currency !== 'PEN'
    || input.moduleId !== undefined && input.moduleId !== 'fiorella'
    || input.ownerId !== undefined && input.ownerId !== 'fiorella') return { ok: false, errors: ['HYPOTHETICAL_GOAL_REQUIRED'] };
  if (typeof input.occurredAt !== 'string' || !Number.isFinite(Date.parse(input.occurredAt)) || new Date(input.occurredAt).toISOString() !== input.occurredAt) return { ok: false, errors: ['INVALID_TIMESTAMP'] };
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== (previous?.revision ?? 0) || previous && previous.id !== input.id.trim()) return { ok: false, errors: ['STALE_REVISION'] };
  if (previous && input.occurredAt < previous.updatedAt) return { ok: false, errors: ['BACKDATED_CHANGE'] };
  if (previous && previous.title === input.title.trim() && previous.target === estimate.target && previous.months === String(estimate.months)) return { ok: true, unchanged: true, value: structuredClone(previous) };
  const revision = (previous?.revision ?? 0) + 1;
  if (!Number.isSafeInteger(revision)) return { ok: false, errors: ['REVISION_LIMIT'] };
  return { ok: true, value: { id: input.id.trim(), schemaVersion: 1, revision, moduleId: 'fiorella', origin: 'simulated', validationStatus: 'pending',
    period: null, householdId: null, actorId: null, currency: 'PEN', kind: 'savings-goal', scope: 'couple',
    title: input.title.trim(), target: estimate.target, months: String(estimate.months),
    provenance: { type: 'manual-simulation', sourceId: 'session-savings-goal' },
    createdAt: previous?.createdAt ?? input.occurredAt, updatedAt: input.occurredAt } };
}
