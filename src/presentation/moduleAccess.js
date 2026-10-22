import { createContext, useContext } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '../store/sessionStore.js';

// Optional read-only view of the session (used to render permission states in
// tests). Without a provider the live session store is used.
export const SessionViewContext = createContext(null);

export function useSessionView() {
  const override = useContext(SessionViewContext);
  const live = useSessionStore(useShallow(state => ({ mode: state.mode, status: state.status, access: state.access })));
  return override ?? live;
}

/** UI mirror of the database permissions. It improves usability; RLS enforces. */
export function useModuleAccess(module) {
  const { mode, access } = useSessionView();
  return mode === 'demo' ? 'demo' : access?.[module] ?? 'none';
}
