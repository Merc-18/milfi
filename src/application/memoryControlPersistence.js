// In-memory stand-in for the Control persistence used by the demo (no account):
// the same ledger domain and screens, nothing leaves the browser tab and a reload
// starts empty. Revisions and the change history behave like the database.
export function createMemoryControlPersistence({ householdId = 'demo-household', actor = 'milton' } = {}) {
  let records = [];
  let events = [];
  let sequence = 0;
  const now = () => new Date().toISOString();
  const store = (record, previous) => {
    const stored = records.find(item => item.id === record.id);
    if (previous && stored?.revision !== previous.revision) return { ok: false, errors: ['STALE_REVISION'] };
    if (!previous && stored) return { ok: false, errors: ['DUPLICATE'] };
    const time = now();
    const value = { ...structuredClone(record), householdId, revision: (previous?.revision ?? 0) + 1, createdAt: stored?.createdAt ?? time, updatedAt: time,
      manualReviews: structuredClone(stored?.manualReviews ?? record.manualReviews ?? []) };
    records = [...records.filter(item => item.id !== record.id), value];
    events = [...events, { id: `demo-event-${++sequence}`, recordId: value.id, action: previous ? 'edit' : 'create', occurredAt: time, actorId: actor,
      before: stored ? structuredClone(stored) : null, after: structuredClone(value) }];
    return { ok: true, value: structuredClone(value) };
  };
  return {
    householdId,
    async loadControl() { return { ok: true, records: structuredClone(records) }; },
    async loadControlHistory() { return { ok: true, events: structuredClone(events).reverse() }; },
    async saveControlEntry(record, previous) { return store(record, previous); },
    async addControlReview(record, previous, review, changed) {
      if (changed) { const updated = store(record, previous); if (!updated.ok) return updated; }
      const target = records.find(item => item.id === record.id);
      if (!target) return { ok: false, errors: ['MOVEMENT_NOT_FOUND'] };
      const added = { id: `demo-review-${++sequence}`, decision: review.decision, binding: review.binding, reason: review.reason,
        reviewedBy: actor, reviewedAt: now(), evidenceReference: review.evidence_reference };
      target.manualReviews = [...(target.manualReviews ?? []), added];
      return { ok: true, value: structuredClone(target) };
    },
  };
}
