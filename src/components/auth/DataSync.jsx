import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '../../store/sessionStore.js';
import { useStore } from '../../store/useStore.js';
import { useLedgerStore } from '../../store/ledgerStore.js';
import { createMemoryControlPersistence } from '../../application/memoryControlPersistence.js';

const DEMO_CONTROL = createMemoryControlPersistence();

// Connects the modules to the database while an authorized session exists.
// Signing out or expiring disconnects them and clears every loaded record.
// Returning to the window reloads
// the data so changes made in another session or device become visible.
export default function DataSync() {
  const { persistence, identity, demo } = useSessionStore(useShallow(state => ({ persistence: state.persistence,
    identity: state.profile?.identity ?? null, demo: state.mode === 'demo' })));
  useEffect(() => {
    if (persistence) {
      useStore.getState().connectRemote(persistence);
      useLedgerStore.getState().connect(persistence, identity);
    } else {
      useStore.getState().disconnectRemote();
      // Without an account Control runs on the same ledger, kept only in this tab.
      if (demo) useLedgerStore.getState().connect(DEMO_CONTROL, 'milton');
      else useLedgerStore.getState().disconnect();
    }
  }, [persistence, identity, demo]);
  useEffect(() => {
    if (!persistence) return undefined;
    let last = 0;
    const refresh = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 5000) return;
      last = Date.now();
      useStore.getState().refreshRemote();
      useLedgerStore.getState().refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [persistence]);
  return null;
}
