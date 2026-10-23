import { create } from 'zustand';
import { currentPeriodInput, parsePeriodInput } from '../presentation/format.js';

// The month being looked at, shared by both modules so switching between
// Fiorella and Control keeps it. Lives apart from the data stores because those
// are cleared when a session connects or disconnects; the chosen month is not.
export function createPeriodStore() {
  return create(set => ({
    selectedPeriod: currentPeriodInput(),
    selectPeriod: value => {
      if (!parsePeriodInput(value)) return false;
      set({ selectedPeriod: value });
      return true;
    },
  }));
}

export const usePeriodStore = createPeriodStore();
