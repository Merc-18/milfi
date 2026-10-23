import { controlMoney } from '../../presentation/control.js';
import { formatAmount, formatPeriod } from '../../presentation/format.js';
import { LIGHT_DOT } from '../../presentation/tones.js';

const HEADS = ['Mes', 'Gastos (Milton)', 'Ahorro depositado', 'Plan del mes', 'Cubierto', 'Estado', 'Retiros'];
const money = list => list.length ? list.map(item => <span key={item.currency} className="block">{controlMoney(item.amount, item.currency)}</span>) : '—';

// Month by month, like "Depósitos mensuales": what came in (period = M) and what
// covers the month's savings plan (plan month = M), with its traffic light.
export default function MonthlyTable({ rows, selected }) {
  return <section className="rounded-[24px] bg-white p-4 shadow-soft" data-testid="control-monthly" aria-labelledby="monthly-title">
    <h2 id="monthly-title" className="font-bold min-h-11 flex items-center">Mes a mes</h2>
    {!rows.length ? <p className="text-sm text-texto-light">Aún no hay movimientos revisados.</p> : <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[40rem] text-xs sm:text-sm">
        <thead><tr className="text-left">{HEADS.map(head => <th key={head} scope="col" className="p-1.5 font-bold">{head}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.key} data-month={row.key}
          className={`border-t border-secundario align-top ${row.key === selected ? 'bg-principal/30' : ''}`}>
          <th scope="row" className="p-1.5 text-left font-normal whitespace-nowrap first-letter:uppercase">{formatPeriod(row.period)}</th>
          <td className="p-1.5 tabular-nums">{money(row.expenses)}</td>
          <td className="p-1.5 tabular-nums">{money(row.savings)}</td>
          <td className="p-1.5 tabular-nums">{row.plan == null ? '—' : formatAmount(row.plan)}</td>
          <td className="p-1.5 tabular-nums">{row.covered == null ? '—' : formatAmount(row.covered)}</td>
          <td className="p-1.5" data-light={row.light.light}><span className="flex items-center gap-1.5 font-bold">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-texto/40 ${LIGHT_DOT[row.light.light]}`} aria-hidden="true" />
            {row.light.word}</span></td>
          <td className="p-1.5 tabular-nums">{money(row.withdrawals)}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}
