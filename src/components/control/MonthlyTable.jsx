import { controlMoney } from '../../presentation/control.js';
import { planText } from '../../presentation/controlLedgerView.js';
import { formatPeriod } from '../../presentation/format.js';
import LightWord from './LightWord.jsx';

const HEADS = ['Mes', 'Gastos (Milton)', 'Ahorro (Fiorella)', 'Plan del mes anterior', 'Estado', 'Retiros'];
const money = list => list.length ? list.map(item => <span key={item.currency} className="block">{controlMoney(item.amount, item.currency)}</span>) : '—';

function Savings({ row }) {
  return <>{money(row.fiorellaSavings)}{row.miltonSavings.map(item => <span key={item.currency} className="block text-xs">
    + {controlMoney(item.amount, item.currency)} de Milton</span>)}</>;
}

function AssignButton({ items, onAssign }) {
  return !!items?.length && <button type="button" className="min-h-11 text-sm font-bold underline"
    onClick={() => onAssign(items, items.length > 1 ? 'batch' : 'single')}>Asignar</button>;
}

// Desktop table (sm and up).
function Table({ rows, selected, toAssign, onAssign }) {
  return <div className="hidden sm:block">
    <table className="w-full text-sm">
      <thead><tr className="text-left">{HEADS.map(head => <th key={head} scope="col" className="p-1.5 font-bold">{head}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.key} data-month={row.key}
        className={`border-t border-secundario align-top ${row.key === selected ? 'bg-principal/30' : ''}`}>
        <th scope="row" className="p-1.5 text-left font-normal first-letter:uppercase">{formatPeriod(row.period)}</th>
        <td className="p-1.5 tabular-nums">{money(row.expenses)}</td>
        <td className="p-1.5 tabular-nums"><Savings row={row} /></td>
        <td className="p-1.5 tabular-nums">{planText(row)}</td>
        <td className="p-1.5"><div className="flex flex-col items-start"><LightWord {...row.light} />
          <AssignButton items={toAssign.get(row.key)} onAssign={onAssign} /></div></td>
        <td className="p-1.5 tabular-nums">{money(row.withdrawals)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

// Phone cards (below 640 px): one card per month.
function Cards({ rows, selected, toAssign, onAssign }) {
  return <ul className="space-y-2 sm:hidden">{rows.map(row => <li key={row.key} data-month-card={row.key}
    className={`rounded-2xl border border-secundario p-3 text-sm space-y-1 ${row.key === selected ? 'bg-principal/30' : ''}`}>
    <p className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold first-letter:uppercase">{formatPeriod(row.period)}</span>
      <LightWord {...row.light} /></p>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 tabular-nums">
      <dt>Gastos</dt><dd className="text-right">{money(row.expenses)}</dd>
      <dt>Ahorro</dt><dd className="text-right"><Savings row={row} /></dd>
      <dt>Plan</dt><dd className="text-right">{planText(row)}</dd>
      {!!row.withdrawals.length && <><dt>Retiros</dt><dd className="text-right">{money(row.withdrawals)}</dd></>}
    </dl>
    <AssignButton items={toAssign.get(row.key)} onAssign={onAssign} />
  </li>)}</ul>;
}

// Receipt months and the previous month's plan; no movement or plan is moved.
export default function MonthlyTable({ rows, selected, toAssign = new Map(), onAssign }) {
  return <section className="rounded-[24px] bg-white p-4 shadow-soft space-y-3" data-testid="control-monthly" aria-labelledby="monthly-title">
    <div><h2 id="monthly-title" className="font-bold">Mes a mes</h2>
      <p className="text-sm text-texto-light">El ahorro de cada plan se deposita al mes siguiente.</p></div>
    {!rows.length ? <p className="text-sm text-texto-light">Aún no hay movimientos revisados.</p> : <>
      <Table rows={rows} selected={selected} toAssign={toAssign} onAssign={onAssign} />
      <Cards rows={rows} selected={selected} toAssign={toAssign} onAssign={onAssign} /></>}
  </section>;
}
