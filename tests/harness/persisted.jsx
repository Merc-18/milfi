// TEST ONLY: mounts the real app routes with the stores connected to a fake
// persistence that serves invented records prepared by the test (PGlite + RPC).
// It never talks to Supabase and is not part of the application bundle.
import '../../src/index.css';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../../src/routes/AppRoutes.jsx';
import { SessionViewContext } from '../../src/presentation/moduleAccess.js';
import { useStore } from '../../src/store/useStore.js';
import { useLedgerStore } from '../../src/store/ledgerStore.js';
import { createMemoryControlPersistence } from '../../src/application/memoryControlPersistence.js';
import { usePeriodStore } from '../../src/store/periodStore.js';

let root = null;
window.mountMilfi = async ({ fixture, identity, access, path, period }) => {
  root?.unmount();
  const control = createMemoryControlPersistence({ householdId: fixture.householdId, actor: identity, initialRecords: fixture.control.records, initialCommitments: fixture.control.commitments ?? [] });
  const persistence = { ...control, householdId: fixture.householdId,
    loadFiorella: async () => structuredClone(fixture.fiorella), loadFiorellaHistory: async () => ({ ok: true, events: [] }),
    loadControl: control.loadControl, loadControlHistory: control.loadControlHistory };
  usePeriodStore.getState().selectPeriod(period);
  root = createRoot(document.getElementById('root'));
  root.render(<SessionViewContext.Provider value={{ mode: 'auth', status: 'ready', access }}>
    <MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></SessionViewContext.Provider>);
  // After the first render: the layout's sync clears stores while no real session exists.
  await new Promise(resolve => setTimeout(resolve, 50));
  await useStore.getState().connectRemote(persistence);
  await useLedgerStore.getState().connect(persistence, identity);
  window.controlSnapshot = async () => ({ householdId: fixture.householdId, fiorella: structuredClone(fixture.fiorella), control: await control.loadControl() });
  return true;
};
