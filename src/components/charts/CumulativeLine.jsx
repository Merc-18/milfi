import { formatAmount } from '../../presentation/format.js';

const WIDTH = 300;
const HEIGHT = 120;

// Cumulative spending of the month in SVG: actual line, dashed ideal pace up to the
// allocation, the allocation as a horizontal line and a "today" mark. Number() is
// used only for coordinates; the amounts shown come from the exact strings.
export default function CumulativeLine({ series, label }) {
  const { days, points, allocation, referenceDay, timing, later } = series;
  const reached = points.filter(point => point.actual !== null);
  const top = Math.max(1, Number(allocation ?? 0), ...reached.map(point => Number(point.actual)), Number(series.actual)) * 1.08;
  const x = day => (day / days) * WIDTH;
  const y = amount => HEIGHT - (Number(amount) / top) * HEIGHT;
  const line = [[0, '0'], ...reached.map(point => [point.day, point.actual])].map(([day, amount]) => `${x(day)},${y(amount)}`).join(' ');
  // Expenses dated after today: a dotted stepped segment from today to their day.
  let step = series.upToToday;
  const scheduled = later.length ? [[referenceDay, step], ...later.flatMap(point => {
    const segment = [[point.day, step], [point.day, point.actual]];
    step = point.actual;
    return segment;
  })].map(([day, amount]) => `${x(day)},${y(amount)}`).join(' ') : null;
  const summary = `${label}: gastado ${formatAmount(series.actual)}${allocation === null ? '' : ` de ${formatAmount(allocation)} asignado`} en ${days} días.`;
  return <figure className="space-y-2">
    {allocation !== null && <p className="text-xs text-texto-light">Asignado {formatAmount(allocation)}</p>}
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-40 w-full overflow-visible" role="img" aria-label={summary}>
      <line x1="0" x2={WIDTH} y1={HEIGHT} y2={HEIGHT} className="stroke-secundario" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {allocation !== null && <>
        <line x1="0" x2={WIDTH} y1={y(allocation)} y2={y(allocation)} className="stroke-texto-light" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={HEIGHT} x2={WIDTH} y2={y(allocation)} className="stroke-texto-light" strokeWidth="1.5" strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke" />
      </>}
      {timing === 'current' && <line x1={x(referenceDay)} x2={x(referenceDay)} y1="0" y2={HEIGHT} className="stroke-excedido/50" strokeWidth="1.5"
        strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}
      {timing !== 'future' && <polyline points={line} fill="none" className="stroke-texto" strokeWidth="2.5" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke" />}
      {scheduled && <polyline points={scheduled} fill="none" className="stroke-texto" strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round"
        vectorEffect="non-scaling-stroke" />}
    </svg>
    <div className="flex justify-between text-[11px] text-texto-light" aria-hidden="true"><span>1</span>
      {timing === 'current' && <span className="font-bold text-texto">Hoy, día {referenceDay}</span>}<span>{days}</span></div>
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-hidden="true">
      <li className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-texto" />Gastado</li>
      {!!later.length && <li className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dotted border-texto" />Con fecha posterior a hoy</li>}
      {allocation !== null && <li className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-texto-light" />Ritmo ideal</li>}
      {allocation !== null && <li className="flex items-center gap-1.5"><span className="h-px w-5 bg-texto-light" />Asignado</li>}
    </ul>
    {/* Wrapped: an sr-only table can still widen the page on some engines. */}
    <div className="sr-only">
      <table>
        <caption>{allocation === null ? 'Gasto acumulado por día'
          : `Gasto acumulado por día; el ritmo ideal reparte ${formatAmount(allocation)} en ${days} días`}</caption>
        <thead><tr><th scope="col">Día</th><th scope="col">Acumulado</th></tr></thead>
        <tbody>{reached.map(point => <tr key={point.day}><th scope="row">{point.day}</th><td>{formatAmount(point.actual)}</td></tr>)}
          {later.map(point => <tr key={point.day}><th scope="row">{point.day}, con fecha posterior a hoy</th>
            <td>{formatAmount(point.actual)}</td></tr>)}</tbody>
      </table>
    </div>
  </figure>;
}
