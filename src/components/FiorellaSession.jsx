import { useStore } from '../store/useStore.js';
import { formatAmount } from '../presentation/format.js';
import { moneyDifference } from '../domain/fiorellaSession.js';
import StatusNotice from './StatusNotice.jsx';
import Badge from './ui/Badge.jsx';
import { TONE_FILL } from '../presentation/tones.js';
import { usageStatus } from '../presentation/status.js';

export const fieldClass = 'w-full min-w-0 bg-fondo border border-secundario p-3 rounded-xl';
export const buttonClass = 'bg-texto text-white font-bold px-4 py-3 rounded-xl disabled:opacity-50';
export const cardClass = 'bg-white p-4 rounded-[24px] shadow-soft min-w-0';

// Only problems and loading are announced; the demo is explained by the header badge.
export function SessionNotice() {
  const remote = useStore(state => state.remote ? state.remoteStatus : null);
  const error = useStore(state => state.remoteError);
  if (remote === 'error') return <StatusNotice title="No se pudieron cargar los datos guardados"><p role="alert">MilFi no pudo leer la información ({error}). No se muestran datos incompletos como si fueran definitivos. Recarga o vuelve a iniciar sesión.</p></StatusNotice>;
  if (remote === 'loading') return <p role="status" className="text-sm mb-4">Cargando datos…</p>;
  return null;
}

export function Help({ title = 'Ayuda', children }) {
  return <details className="text-sm rounded-xl bg-secundario/20 px-3"><summary className="cursor-pointer min-h-11 py-3 font-bold">{title}</summary><div className="pb-3 space-y-2">{children}</div></details>;
}

// Visual proportion only (display width); amounts themselves stay exact strings.
export function Progress({ value, limit, label }) {
// The tone comes from the exact comparison; the text beside it states the result.
  const ratio = value != null && limit != null && Number(limit) > 0 ? Number(value) / Number(limit) : null;
  if (ratio === null) return null;
  return <div className="h-2 rounded-full bg-secundario/40 overflow-hidden" role="img" aria-label={label}>
    <div className={`h-full rounded-full ${TONE_FILL[usageStatus(value, limit)]}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} /></div>;
}

export function Kpi({ label, amount, children, tone = 'bg-white' }) {
  return <div className={`${tone} p-4 rounded-[24px] shadow-soft min-w-0 space-y-1`}><h3 className="text-xs font-bold">{label}</h3>
    <p className="text-lg font-bold break-all">{amount == null ? 'Sin registrar' : formatAmount(amount)}</p>{children}</div>;
}

export function PageHeader({ title, subtitle, children }) {
  return <header className="flex flex-wrap items-end justify-between gap-3 mt-2 mb-4">
    <div className="min-w-0"><h1 className="text-2xl md:text-3xl font-bold">{title}</h1>{subtitle && <p className="text-sm text-texto-light mt-1">{subtitle}</p>}</div>
    {children}
  </header>;
}

export function FixedTotalComparison({ summary }) {
  if (summary.fixedComparison.status === 'unavailable') return <p className="text-sm">Sin diferencia global GF: información incompleta. {summary.fixedCoverage.matched}/{summary.budget.expected} subcategorías con presupuesto y gasto; revisa cada una.</p>;
  return <p className="text-sm">Diferencia global GF · detalle completo: <Comparison budget={summary.budget.amount} spent={summary.actual.amount} /></p>;
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
  const prefix = comparison.status === 'over' ? 'Exceso: −' : comparison.status === 'equal' ? 'Diferencia: ' : 'Diferencia a favor: ';
  return <Badge tone={usageStatus(spent, budget)}>{partial ? 'Comparación parcial · ' : ''}{prefix}{formatAmount(comparison.amount)}</Badge>;
}

export function AmountStatus({ label, amount, detail }) {
  return <div className={cardClass}><h3 className="text-sm font-bold">{label}</h3>
    <p className="text-xl font-bold mt-1 break-all">{amount == null ? 'Sin registrar' : formatAmount(amount)}</p>
    {detail && <p className="text-xs mt-2">{detail}</p>}</div>;
}
