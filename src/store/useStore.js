import { create } from 'zustand';
import { prepareSimulation } from '../application/simulations.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { IDENTITIES, MODULE_DEFINITIONS } from '../domain/models.js';
import { prepareFiorellaDemo } from '../domain/fiorellaSession.js';
import { prepareSavingsGoal } from '../application/savingsGoals.js';

// The server sets authoritative timestamps; align the client one so clock skew
// cannot be mistaken for a backdated change by the domain check.
const alignedTimestamp = (occurredAt, previous) => previous?.updatedAt && occurredAt < previous.updatedAt
  ? new Date(Date.parse(previous.updatedAt) + 1).toISOString() : occurredAt;

export function createMilfiStore() {
  return create((set, get) => {
    // Saves first, then reloads; the caller only sees success after the database accepted it.
    async function persist(remote, record, previous) {
      const saved = await remote.saveFiorellaRecord(record, previous ?? null);
      if (!saved.ok) return saved;
      await get().refreshRemote();
      return { ok: true, value: saved.value };
    }
    return {
    rules: FINANCIAL_RULES,
    identities: IDENTITIES,
    modules: MODULE_DEFINITIONS,
    historyStatus: { fiorella: 'awaiting_updated_source', control: 'awaiting_import' },
    fiorellaRecords: [],
    controlMovements: [],
    simulations: [],
    savingsGoals: [],
    // Persisted mode (Phase 4.2): set while an authorized session is connected.
    // Without it the module keeps its session-only demo behaviour.
    remote: null, remoteStatus: 'off', remoteError: null,
    async connectRemote(persistence) {
      if (get().remote === persistence) return;
      set({ remote: persistence, remoteStatus: 'loading', remoteError: null, fiorellaDemoRecords: [], fiorellaDemoEvents: [], savingsGoals: [] });
      await get().refreshRemote();
    },
    disconnectRemote() {
      set({ remote: null, remoteStatus: 'off', remoteError: null, fiorellaDemoRecords: [], fiorellaDemoEvents: [], savingsGoals: [] });
    },
    async refreshRemote() {
      const remote = get().remote;
      if (!remote) return { ok: false, errors: ['NOT_CONNECTED'] };
      const [data, history] = await Promise.all([remote.loadFiorella(), remote.loadFiorellaHistory()]);
      if (get().remote !== remote) return { ok: false, errors: ['NOT_CONNECTED'] };
      if (!data.ok || !history.ok) { set({ remoteStatus: 'error', remoteError: (data.errors ?? history.errors)[0] }); return { ok: false, errors: data.errors ?? history.errors }; }
      set({ remoteStatus: 'ready', remoteError: null, fiorellaDemoRecords: data.records, savingsGoals: data.goals, fiorellaDemoEvents: history.events });
      return { ok: true };
    },
    saveSavingsGoal: input => {
      const id = typeof input?.id === 'string' ? input.id.trim() : null;
      const previous = get().savingsGoals.find(goal => goal.id === id);
      const remote = get().remote;
      const result = prepareSavingsGoal(remote ? { ...input, occurredAt: alignedTimestamp(input.occurredAt, previous) } : input, previous);
      if (!result.ok || result.unchanged) return result;
      if (remote) return persist(remote, { ...result.value, kind: 'savings-goal' }, previous);
      const snapshot = structuredClone(result.value);
      set(state => ({ savingsGoals: [...state.savingsGoals.filter(goal => goal.id !== snapshot.id), snapshot] }));
      return result;
    },
    // Deletes an own goal (never one loaded from the workbook), after the caller confirmed.
    deleteSavingsGoal: async goal => {
      const current = get().savingsGoals.find(item => item.id === goal?.id);
      if (!current) return { ok: false, errors: ['NOT_FOUND_OR_FORBIDDEN'] };
      if (current.origin === 'real') return { ok: false, errors: ['WORKBOOK_GOAL'] };
      const remote = get().remote;
      if (remote) {
        const removed = await remote.deleteSavingsGoal(current);
        if (!removed.ok) return removed;
        await get().refreshRemote();
        return { ok: true };
      }
      set(state => ({ savingsGoals: state.savingsGoals.filter(item => item.id !== current.id) }));
      return { ok: true };
    },
    fiorellaDemoRecords: [],
    fiorellaDemoEvents: [],
    saveFiorellaDemo: input => {
      const remote = get().remote;
      if (remote) {
        const previous = get().fiorellaDemoRecords.find(record => record.id === input?.id);
        const result = prepareFiorellaDemo({ ...input, occurredAt: alignedTimestamp(input?.occurredAt, previous) }, get().fiorellaDemoRecords, [], { origin: 'real' });
        if (!result.ok || result.unchanged) return result;
        const record = { ...result.value, distinctOperationReason: input.allowSimilar === true ? 'Indicado expresamente como gasto distinto con datos coincidentes' : null };
        return persist(remote, record, previous);
      }
      const result = prepareFiorellaDemo(input, get().fiorellaDemoRecords, get().fiorellaDemoEvents);
      if (!result.ok || result.unchanged) return result;
      const snapshot = structuredClone(result.value);
      const event = structuredClone(result.event);
      set(state => ({ fiorellaDemoRecords: [...state.fiorellaDemoRecords.filter(record => record.id !== snapshot.id), snapshot],
        fiorellaDemoEvents: [...state.fiorellaDemoEvents, event] }));
      return result;
    },
    // Session-only simulation. No real-data write/import, identity switch,
    // persistence, financial confirmation or reconciliation is implemented.
    saveSimulation: input => {
      const result = prepareSimulation(input);
      if (!result.ok) return result;
      if (get().simulations.some(record => record.id === result.value.id)) {
        return { ok: false, errors: ['DUPLICATE_SIMULATION_ID'] };
      }
      const snapshot = structuredClone(result.value);
      set(state => ({ simulations: [snapshot, ...state.simulations] }));
      return result;
    },
  };
  });
}

export const useStore = createMilfiStore();
