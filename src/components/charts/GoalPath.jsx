import { percentageOf } from '../../domain/amounts.js';
import { formatAmount, formatShortPeriod } from '../../presentation/format.js';
import { addMonths } from '../../presentation/goalPlan.js';

const WIDTH = 300;
const HEIGHT = 120;
const times = (amount, count) => percentageOf(amount, count * 100);

// Path to a goal in SVG: projected accumulated savings (C × month), the target as
// a horizontal line, a mark at the goal's term and the arrival point; a dotted
// second line for the "¿y si…?" capacity. Number() only for coordinates.
export default function GoalPath({ target, capacity, months, termMonths, alternative, start, label }) {
  const end = Math.max(1, months ?? 0, termMonths ?? 0, alternative?.months ?? 0);
  const top = Math.max(Number(target), Number(capacity ?? 0) * end, Number(alternative?.capacity ?? 0) * end) * 1.08 || 1;
  const x = month => (month / end) * WIDTH;
  const y = amount => HEIGHT - (amount / top) * HEIGHT;
  const line = value => `0,${HEIGHT} ${WIDTH},${y(Number(value) * end)}`;
  const monthLabel = count => formatShortPeriod(addMonths(start, count - 1));
  const milestones = [...new Set([1, termMonths, months, alternative?.months, end].filter(Boolean))].sort((a, b) => a - b);
  const summary = `${label}: objetivo ${formatAmount(target)}`
    + (months ? `, con ${formatAmount(capacity)} al mes llegas en el mes ${months} (${monthLabel(months)})` : '')
    + (termMonths ? `, plazo en el mes ${termMonths}` : '') + '.';
  return <figure className="space-y-2">
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-44 w-full overflow-visible" role="img" aria-label={summary}>
      <line x1="0" x2={WIDTH} y1={HEIGHT} y2={HEIGHT} className="stroke-secundario" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" x2={WIDTH} y1={y(Number(target))} y2={y(Number(target))} className="stroke-texto-light" strokeWidth="1.5"
        vectorEffect="non-scaling-stroke" />
      {termMonths && <line x1={x(termMonths)} x2={x(termMonths)} y1="0" y2={HEIGHT} className="stroke-excedido/60" strokeWidth="1.5" strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke" />}
      {months && <polyline points={line(capacity)} fill="none" className="stroke-texto" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />}
      {alternative?.months && <polyline points={line(alternative.capacity)} fill="none" className="stroke-texto" strokeWidth="2" strokeDasharray="1 4"
        strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      {months && <circle cx={x(months)} cy={y(Number(target))} r="4" className="fill-exito stroke-texto" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
    </svg>
    <div className="flex justify-between gap-2 text-[11px] text-texto-light" aria-hidden="true">
      <span>{monthLabel(1)}</span>
      {months && <span className="font-bold text-texto">Llegada: {monthLabel(months)}</span>}
      <span>{monthLabel(end)}</span>
    </div>
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-hidden="true">
      <li className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-texto" />Ahorro proyectado</li>
      {alternative?.months && <li className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dotted border-texto" />Con el «¿y si…?»</li>}
      <li className="flex items-center gap-1.5"><span className="h-px w-5 bg-texto-light" />Objetivo</li>
      {termMonths && <li className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-excedido/60" />Plazo</li>}
    </ul>
    <table className="sr-only">
      <caption>Ahorro de pareja acumulado proyectado por mes</caption>
      <thead><tr><th scope="col">Mes</th><th scope="col">Con tu plan</th>{alternative?.months && <th scope="col">Con el «¿y si…?»</th>}</tr></thead>
      <tbody>{milestones.map(month => <tr key={month}>
        <th scope="row">{monthLabel(month)}{month === termMonths ? ', plazo' : ''}{month === months ? ', llegada' : ''}</th>
        <td>{capacity ? formatAmount(times(capacity, month)) : 'Sin estimación'}</td>
        {alternative?.months && <td>{formatAmount(times(alternative.capacity, month))}</td>}
      </tr>)}</tbody>
    </table>
  </figure>;
}
