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
import { useControlStore } from '../../src/store/controlStore.js';

let root = null;
window.mountMilfi = async ({ fixture, identity, access, path, fiorellaPeriod, controlPeriod }) => {
  root?.unmount();
  const persistence = { householdId: fixture.householdId,
    loadFiorella: async () => structuredClone(fixture.fiorella), loadFiorellaHistory: async () => ({ ok: true, events: [] }),
    loadControl: async () => structuredClone(fixture.control), loadControlHistory: async () => ({ ok: true, events: [] }) };
  useStore.getState().selectFiorellaPeriod(fiorellaPeriod);
  useControlStore.getState().selectPeriod(controlPeriod);
  root = createRoot(document.getElementById('root'));
  root.render(<SessionViewContext.Provider value={{ mode: 'auth', status: 'ready', access }}>
    <MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></SessionViewContext.Provider>);
  // After the first render: the layout's sync clears stores while no real session exists.
  await new Promise(resolve => setTimeout(resolve, 50));
  await useStore.getState().connectRemote(persistence);
  await useLedgerStore.getState().connect(persistence, identity);
  return true;
};
