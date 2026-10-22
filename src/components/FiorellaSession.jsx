import { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { formatAmount } from '../presentation/format.js';
import { moneyDifference } from '../domain/fiorellaSession.js';
import StatusNotice from './StatusNotice.jsx';

export const fieldClass = 'w-full min-w-0 bg-fondo border border-secundario p-3 rounded-xl';
export const buttonClass = 'bg-texto text-white font-bold px-4 py-3 rounded-xl disabled:opacity-50';
export const cardClass = 'bg-white p-4 rounded-[24px] shadow-soft min-w-0';

export function SessionNotice() {
  return <StatusNotice title="Demostración de esta sesión"><p>Estos registros son ejemplos, no información financiera confirmada. Solo permanecen en memoria y se pierden al recargar. Historial real aún no importado.</p></StatusNotice>;
}

export function PeriodPicker() {
  const input = useStore(state => state.selectedFiorellaPeriod);
  const select = useStore(state => state.selectFiorellaPeriod);
  const [error, setError] = useState(false);
  return <div className={`${cardClass} mb-5`}>
    <label htmlFor="fiorella-period" className="block font-bold mb-2">Mes y año</label>
    <input id="fiorella-period" type="month" min="0001-01" max="9999-12" className={fieldClass} value={input}
      onChange={event => setError(!select(event.target.value))} />
    {error && <p role="alert" className="text-sm mt-2">Selecciona un periodo válido. Se mantiene el último periodo válido.</p>}
  </div>;
}

export function MoneyInput({ id, label, value, onChange }) {
  return <div className="min-w-0"><label htmlFor={id} className="block text-sm font-bold mb-1">{label}</label>
    <input id={id} type="text" inputMode="decimal" maxLength={100} autoComplete="off" className={fieldClass}
      value={value} onChange={event => onChange(event.target.value)} placeholder="Sin registrar" />
  </div>;
}

export function Comparison({ budget, spent, partial = false }) {
  const comparison = moneyDifference(budget, spent);
  if (comparison.status === 'unavailable') return <span>Sin comparación: faltan importes registrados.</span>;
  return <span className={comparison.status === 'over' ? 'font-bold text-red-800' : 'font-bold'}>
    {partial ? 'Comparación parcial · ' : ''}{comparison.status === 'over' ? 'Exceso: −' : comparison.status === 'equal' ? 'Diferencia: ' : 'Diferencia a favor: '}{formatAmount(comparison.amount)}
  </span>;
}

export function AmountStatus({ label, amount, detail }) {
  return <div className={cardClass}><h3 className="text-sm font-bold">{label}</h3>
    <p className="text-xl font-bold mt-1 break-all">{amount == null ? 'Sin registrar' : formatAmount(amount)}</p>
    {detail && <p className="text-xs mt-2">{detail}</p>}</div>;
}
