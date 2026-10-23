import { create } from 'zustand';
import { prepareFieldResolution, preparePreimportDecision, readControlWorkbook } from '../application/controlPreimport.js';

// Session memory only: no localStorage/sessionStorage/IndexedDB, uploads or logs.
// Reloading discards every file, capture, review and decision.
export function createPreimportStore(reader = readControlWorkbook) {
  return create((set, get) => ({
    batches: [], records: [], context: { workbooks: new Map() }, imported: {},
    reset: () => set({ batches: [], records: [], context: { workbooks: new Map() }, imported: {} }),
    markImported: (fingerprint, result) => set(state => ({ imported: { ...state.imported, [fingerprint]: result } })),
    loadWorkbook: async (bytes, fileName) => {
      const result = await reader(bytes);
      if (!result.ok) return result;
      if (get().batches.some(batch => batch.fingerprint === result.batch.fingerprint)) return { ok: false, code: 'ALREADY_LOADED' };
      const workbooks = new Map(get().context.workbooks).set(result.batch.fingerprint, result.workbook);
      set(state => ({ batches: [...state.batches, { ...result.batch, fileName: typeof fileName === 'string' ? fileName.slice(0, 200) : 'archivo.xlsx' }],
        records: [...state.records, ...structuredClone(result.records)], context: { workbooks } }));
      return { ok: true, batch: result.batch };
    },
    discardWorkbook: fingerprint => set(state => {
      const workbooks = new Map(state.context.workbooks);
      workbooks.delete(fingerprint);
      return { batches: state.batches.filter(batch => batch.fingerprint !== fingerprint),
        records: state.records.filter(record => record.provenance.sourceFingerprint !== fingerprint), context: { workbooks } };
    }),
    resolveField: input => {
      const result = prepareFieldResolution(input, get().records, get().context);
      if (!result.ok) return result;
      const updated = new Map(result.value.map(record => [record.id, structuredClone(record)]));
      set(state => ({ records: state.records.map(record => updated.get(record.id) ?? record) }));
      return result;
    },
    decide: input => {
      const result = preparePreimportDecision(input, get().records, get().context);
      if (!result.ok) return result;
      const value = structuredClone(result.value);
      set(state => ({ records: state.records.map(record => record.id === value.id ? value : record) }));
      return result;
    },
  }));
}

export const usePreimportStore = createPreimportStore();
