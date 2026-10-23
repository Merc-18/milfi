import { compareAmounts } from '../../domain/amounts.js';
import { formatAmount } from '../../presentation/format.js';

const FILL = { ok: 'fill-exito', aviso: 'fill-acento', neutral: 'fill-secundario', excedido: 'fill-excedido' };
const ratio = (value, scale) => value == null || Number(scale) === 0 ? 0 : Math.min(1, Number(value) / Number(scale)) * 100;
const rowClass = 'grid w-full min-h-11 grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-center gap-x-3 rounded-xl px-2 py-1.5 text-left'
  + ' hover:bg-principal/30 sm:grid-cols-[9rem_minmax(0,1fr)_auto]';
const money = value => value == null ? 'sin registrar' : formatAmount(value);

// One bullet: the budget is the background track, the actual the inner bar in
// its tone and a vertical mark sits at 100 % of the budget. Number() only sizes it.
export function BulletTrack({ budget, actual, tone = 'neutral', className = 'h-4 w-full' }) {
  const hasBudget = budget != null && Number(budget) > 0;
  const scale = !hasBudget ? actual ?? '0' : actual != null && compareAmounts(actual, budget) > 0 ? actual : budget;
  const mark = hasBudget ? ratio(budget, scale) : null;
  return <svg viewBox="0 0 100 10" preserveAspectRatio="none" className={className} aria-hidden="true">
    <rect x="0" y="0" width="100" height="10" rx="2" className="fill-fondo" />
    {hasBudget && <rect x="0" y="0" width={mark} height="10" rx="2" className="fill-secundario/60" />}
    <rect x="0" y="2.5" width={ratio(actual, scale)} height="5" rx="1.5" className={hasBudget ? FILL[tone] : 'fill-texto-light'} />
    {mark !== null && <line x1={mark} x2={mark} y1="0" y2="10" className="stroke-texto" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
  </svg>;
}

// Bullet chart by group. Each row is a button when onSelect is given (it leads to
// the group), so the bars are decorative and the data is also in an sr-only table.
// items: [{ key, label, budget, actual, tone }]
export default function BulletBars({ items, label, onSelect }) {
  return <figure className="space-y-1">
    <figcaption className="sr-only">{label}</figcaption>
    <table className="sr-only">
      <thead><tr><th scope="col">Grupo</th><th scope="col">Gastado</th><th scope="col">Presupuesto</th></tr></thead>
      <tbody>{items.map(item => <tr key={item.key}><th scope="row">{item.label}</th><td>{money(item.actual)}</td><td>{money(item.budget)}</td></tr>)}</tbody>
    </table>
    {items.map(item => {
      const Row = onSelect ? 'button' : 'div';
      return <Row key={item.key} {...(onSelect ? { type: 'button', onClick: () => onSelect(item.key) } : { 'aria-hidden': true })}
        className={rowClass}>
        <span className="text-sm font-bold truncate">{item.label}</span>
        <BulletTrack budget={item.budget} actual={item.actual} tone={item.tone} />
        <span className="col-span-2 text-xs tabular-nums text-texto-light sm:col-span-1 sm:text-right">
          {item.budget == null ? `${money(item.actual)}, sin presupuesto` : `${money(item.actual)} de ${formatAmount(item.budget)}`}</span>
      </Row>;
    })}
  </figure>;
}
