import { prepareContributionCommitment } from '../domain/controlContributions.js';
import { create } from 'zustand';
import { prepareControlEntry, prepareControlEntryReview, prepareControlPlanAssignment, prepareImportedReview } from '../domain/controlLedger.js';

// Persisted Control Finanzas M&F ledger for the signed-in household. Every write
// is validated by the domain, then stored; on any failure nothing is reported as
// saved and the previous data stay visible. Data are cleared on disconnect.
const empty = { persistence: null, identity: null, status: 'off', error: null, records: [], events: [], commitments: [], commitmentsAvailable: false };

export function createLedgerStore() {
  return create((set, get) => {
    const reload = async () => {
      const { persistence } = get();
      if (!persistence) return { ok: false, errors: ['NOT_CONNECTED'] };
      const [movements, history] = await Promise.all([persistence.loadControl(), persistence.loadControlHistory()]);
      if (get().persistence !== persistence) return { ok: false, errors: ['NOT_CONNECTED'] };
      if (!movements.ok || !history.ok) { set({ status: 'error', error: (movements.errors ?? history.errors)[0] }); return { ok: false, errors: movements.errors ?? history.errors }; }
      set({ status: 'ready', error: null, records: movements.records, events: history.events, commitments: movements.commitments ?? [], commitmentsAvailable: movements.commitmentsAvailable === true });
      return { ok: true };
    };
    return {
      ...empty,
      async connect(persistence, identity) {
        if (get().persistence === persistence) return;
        set({ ...empty, persistence, identity, status: 'loading' });
        await reload();
      },
      disconnect() { set({ ...empty }); },
      refresh: reload,
      async saveCommitment(draft) {
        const { persistence, identity } = get();
        if (!persistence || !get().commitmentsAvailable) return { ok: false, errors: ['COMMITMENTS_UNAVAILABLE'] };
        if (identity !== 'milton') return { ok: false, errors: ['FORBIDDEN'] };
        const prepared = prepareContributionCommitment(draft);
        if (!prepared.ok) return prepared;
        const saved = await persistence.saveContributionCommitment(prepared.value);
        if (saved.ok) await reload();
        return saved;
      },
      async saveEntry(draft) {
        const { persistence, identity, records } = get();
        if (!persistence) return { ok: false, errors: ['NOT_CONNECTED'] };
        const prepared = prepareControlEntry({ ...draft, householdId: persistence.householdId, actorId: identity }, records);
        if (!prepared.ok) return prepared;
        const saved = await persistence.saveControlEntry(prepared.value, prepared.previous);
        if (!saved.ok) return saved;
        await reload();
        return saved;
      },
      async review(draft) {
        const { persistence, identity, records } = get();
        if (!persistence) return { ok: false, errors: ['NOT_CONNECTED'] };
        const prepared = prepareControlEntryReview({ ...draft, reviewedBy: identity }, records);
        if (!prepared.ok) return prepared;
        const previous = records.find(record => record.id === draft.id);
        const saved = await persistence.addControlReview(prepared.record, previous, prepared.review, prepared.changed);
        await reload();
        return saved;
      },
      // Workbook rows: corrections plus an accepted/rejected review, bound to the new state.
      async reviewImported(draft) {
        const { persistence, identity, records } = get();
        if (!persistence) return { ok: false, errors: ['NOT_CONNECTED'] };
        const prepared = prepareImportedReview({ ...draft, reviewedBy: identity }, records);
        if (!prepared.ok) return prepared;
        const previous = records.find(record => record.id === draft.id);
        const saved = await persistence.addControlReview(prepared.record, previous, prepared.review, prepared.changed);
        await reload();
        return saved;
      },
      // The Fiorella plan month of a savings deposit (manual or imported); never changes its review.
      async assignPlan(draft) {
        const { persistence, records } = get();
        if (!persistence) return { ok: false, errors: ['NOT_CONNECTED'] };
        const prepared = prepareControlPlanAssignment(draft, records);
        if (!prepared.ok) return prepared;
        const saved = await persistence.saveControlEntry(prepared.value, prepared.previous);
        if (!saved.ok) return saved;
        await reload();
        return saved;
      },
      async importPrepared(batch, preparedRecords) {
        const { persistence } = get();
        if (!persistence) return { ok: false, errors: ['NOT_CONNECTED'] };
        const result = await persistence.importPrepared(batch, preparedRecords);
        if (result.ok) await reload();
        return result;
      },
    };
  });
}

export const useLedgerStore = createLedgerStore();
