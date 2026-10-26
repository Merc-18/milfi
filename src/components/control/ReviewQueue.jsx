import { controlMoney, kindName, purposeName } from '../../presentation/control.js';
import { assignmentText } from '../../presentation/controlLedgerView.js';
import { formatShortDate } from '../../presentation/format.js';

const itemClass = 'rounded-2xl bg-white p-3 shadow-soft space-y-1 text-sm';
const linkClass = 'min-h-11 font-bold underline';

function ToConfirm({ items, manage, onResolve }) {
  return <ul className="grid gap-2 lg:grid-cols-2 items-start">{items.map(({ entry, reasons }) => <li key={entry.record.id}
    data-review-id={entry.record.id} className={itemClass}>
    <p className="flex flex-wrap justify-between gap-2 font-bold">
      <span>{kindName(entry.record.kind)} de {purposeName(entry.record.purpose).toLowerCase()}
        {entry.record.effectiveDate ? `, ${formatShortDate(entry.record.effectiveDate)}` : ''}</span>
      <span className="tabular-nums">{controlMoney(entry.record.amount, entry.record.currency)}</span></p>
    {entry.record.description && <p>{entry.record.description}</p>}
    <ul className="list-disc pl-5">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    {manage && <button type="button" className={linkClass} onClick={() => onResolve(entry.record.id)}>Resolver</button>}
  </li>)}</ul>;
}

function ToAssign({ items, manage, onAssign }) {
  return <ul className="grid gap-2 lg:grid-cols-2 items-start">{items.map(item => <li key={item.entry.record.id}
    data-review-id={item.entry.record.id} data-assign-id={item.entry.record.id} className={itemClass}>
    <p className="tabular-nums">{assignmentText(item)}</p>
    {item.entry.record.description && <p className="text-texto-light">{item.entry.record.description}</p>}
    {manage && <button type="button" className={linkClass} onClick={() => onAssign([item], 'single')}>Asignar</button>}
  </li>)}</ul>;
}

// What is waiting, in the order to resolve it. Deposits older than Fiorella's
// plans are listed apart, folded, and are not tasks.
export default function ReviewQueue({ tasks, manage, onResolve, onAssign }) {
  const exact = tasks.withoutPlan.filter(item => item.plan.exact);
  return <div id="por-revisar" tabIndex={-1} className="space-y-4 scroll-mt-32" data-testid="control-review">
    <h3 className="font-bold">Por revisar ({tasks.total})</h3>
    {!!tasks.toConfirm.length && <section className="space-y-2" aria-label="Por confirmar">
      <h4 className="text-sm font-bold">Por confirmar</h4>
      <ToConfirm items={tasks.toConfirm} manage={manage} onResolve={onResolve} /></section>}
    {!!tasks.withoutPlan.length && <section className="space-y-2" aria-label="Sin mes del plan">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold">Sin mes del plan</h4>
        {manage && exact.length >= 2 && <button type="button" className="min-h-11 rounded-xl bg-texto px-4 font-bold text-white"
          onClick={() => onAssign(exact, 'batch')}>Asignar los {exact.length} que coinciden con su plan</button>}</div>
      <ToAssign items={tasks.withoutPlan} manage={manage} onAssign={onAssign} /></section>}
    {!!tasks.noPlan.length && <details className="rounded-2xl bg-white/60 p-3 text-sm" data-testid="control-no-plan">
      <summary className="min-h-11 cursor-pointer py-2 font-bold">Depósitos sin plan de Fiorella ({tasks.noPlan.length})</summary>
      <p className="mb-2">No hay plan registrado para el mes anterior; no requieren acción.</p>
      <ToAssign items={tasks.noPlan} manage={manage} onAssign={onAssign} />
    </details>}
  </div>;
}
