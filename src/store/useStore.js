import { create } from 'zustand';
import { prepareSimulation } from '../application/simulations.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { IDENTITIES, MODULE_DEFINITIONS } from '../domain/models.js';
import { prepareFiorellaDemo } from '../domain/fiorellaSession.js';
import { currentPeriodInput, parsePeriodInput } from '../presentation/format.js';

export function createMilfiStore() {
  return create((set, get) => ({
    rules: FINANCIAL_RULES,
    identities: IDENTITIES,
    modules: MODULE_DEFINITIONS,
    historyStatus: { fiorella: 'awaiting_updated_source', control: 'awaiting_import' },
    fiorellaRecords: [],
    controlMovements: [],
    simulations: [],
    selectedFiorellaPeriod: currentPeriodInput(),
    fiorellaDemoRecords: [],
    fiorellaDemoEvents: [],
    selectFiorellaPeriod: value => {
      if (!parsePeriodInput(value)) return false;
      set({ selectedFiorellaPeriod: value });
      return true;
    },
    saveFiorellaDemo: input => {
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
  }));
}

export const useStore = createMilfiStore();
