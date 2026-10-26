import { controlMoney } from '../../presentation/control.js';
import { formatShortPeriod } from '../../presentation/format.js';

const WIDTH = 300;
const HEIGHT = 120;
const signedMoney = (value, currency) => `${value.negative ? '−' : ''}${controlMoney(value.amount, currency)}`;

// Savings balance of a single currency as monthly steps: each deposit raises it, each same-currency
// withdrawal lowers it (a point, with its description). The selected month is
// highlighted. Number() only for coordinates; amounts come from exact strings.
export default function BalanceSteps({ series, selected, label, currency = 'PEN' }) {
  const { steps, withdrawals } = series;
  if (!steps.length) return <p className="text-sm text-texto-light">Aún no hay depósitos de ahorro ni retiros revisados.</p>;
  const value = step => (step.balance.negative ? -1 : 1) * Number(step.balance.amount);
  const top = Math.max(1, ...steps.map(value)) * 1.1;
  const bottom = Math.min(0, ...steps.map(value)) * 1.1;
  const slot = WIDTH / steps.length;
  const y = amount => HEIGHT - ((amount - bottom) / (top - bottom)) * HEIGHT;
  const path = steps.map((step, index) => `${index ? 'L' : 'M'}${index * slot},${y(value(step))} L${(index + 1) * slot},${y(value(step))}`).join(' ');
  const index = steps.findIndex(step => step.key === selected);
  const last = steps.at(-1);
  return <figure className="space-y-2">
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-40 w-full overflow-visible" role="img"
      aria-label={`${label}: ${signedMoney(last.balance, currency)} al cierre de ${formatShortPeriod(last.period)}, con ${withdrawals.length} retiro(s) en ${currency}.`}>
      {index >= 0 && <rect x={index * slot} y="0" width={slot} height={HEIGHT} className="fill-principal/60" />}
      <line x1="0" x2={WIDTH} y1={y(0)} y2={y(0)} className="stroke-secundario" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={path} fill="none" className="stroke-texto" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {withdrawals.map(point => {
        const at = steps.findIndex(step => step.key === point.key);
        const title = `${point.description ?? 'Retiro'}: ${controlMoney(point.amount, point.currency)}`;
        return at >= 0 && <circle key={point.id} cx={(at + 0.5) * slot} cy={y(value(steps[at]))} r="4" className="fill-semaforo-rojo stroke-white"
          strokeWidth="1.5" vectorEffect="non-scaling-stroke"><title>{title}</title></circle>;
      })}
    </svg>
    <div className="flex justify-between text-[11px] text-texto-light" aria-hidden="true">
      <span>{formatShortPeriod(steps[0].period)}</span><span>{formatShortPeriod(last.period)}</span></div>
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-hidden="true">
      <li className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-texto" />Saldo {currency}</li>
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-semaforo-rojo" />Retiro</li>
      <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-principal" />Mes elegido</li>
    </ul>
    {/* Wrapped: an sr-only table can still widen the page on some engines. */}
    <div className="sr-only">
      <table>
        <caption>{label} por mes</caption>
        <thead><tr><th scope="col">Mes</th><th scope="col">Depositado</th><th scope="col">Retirado</th><th scope="col">Saldo</th></tr></thead>
        <tbody>{steps.map(step => <tr key={step.key}><th scope="row">{formatShortPeriod(step.period)}</th><td>{controlMoney(step.deposited, currency)}</td>
          <td>{controlMoney(step.withdrawn, currency)}
            {withdrawals.filter(point => point.key === step.key).map(point => ` (${point.description ?? 'Retiro'})`).join('')}</td>
          <td>{signedMoney(step.balance, currency)}</td></tr>)}</tbody>
      </table>
    </div>
  </figure>;
}
