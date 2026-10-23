import { create } from 'zustand';
import { prepareControlDemo, prepareControlReview } from '../domain/controlSession.js';

// Independent, memory-only module (the month lives in periodStore). No real import, persistence or auth action.
export function createControlStore() {
  return create((set, get) => {
    const apply = (prepare, input) => {
      const result = prepare(input, get().demoMovements, get().events);
      if (!result.ok) return result;
      const value = structuredClone(result.value);
      const event = structuredClone(result.event);
      set(state => ({ demoMovements: [...state.demoMovements.filter(record => record.id !== value.id), value], events: [...state.events, event] }));
      return result;
    };
    return {
      demoMovements: [], events: [],
      saveDemo: input => apply(prepareControlDemo, input),
      reviewDemo: input => apply(prepareControlReview, input),
    };
  });
}

export const useControlStore = createControlStore();
