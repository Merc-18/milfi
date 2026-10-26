import { useMemo } from 'react';
import { fiorellaEvolution } from '../domain/fiorellaDashboard.js';
import { useStore } from '../store/useStore.js';
import { withFixedCap } from './fixedCap.js';

// Fiorella's couple-savings plan per month ('YYYY-MM' → { amount, projected }),
// the reference Control compares its deposits with.
export function useControlPlans() {
  const fiorella = useStore(state => state.fiorellaDemoRecords);
  const persisted = useStore(state => !!state.remote);
  return useMemo(() => new Map(fiorellaEvolution(withFixedCap(fiorella), persisted ? 'real' : 'simulated')
    .filter(row => row.couplePlanned != null).map(row => [row.key, { amount: row.couplePlanned, projected: row.projected }])), [fiorella, persisted]);
}
