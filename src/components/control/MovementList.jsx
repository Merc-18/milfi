import { useState } from 'react';
import { controlMoney, personName, purposeName, statusName, statusTone, currencyOriginWarning } from '../../presentation/control.js';
import { formatShortDate } from '../../presentation/format.js';
import { contributionLabel } from '../../domain/controlContributions.js';
import { movementMonth } from '../../presentation/controlLedgerView.js';
import { periodKey } from '../../domain/fiorellaSession.js';
import { formatPeriod, parsePeriodInput } from '../../presentation/format.js';
import Badge from '../ui/Badge.jsx';

const CHIPS = [['all', 'Todos'], ['deposit', 'Depósitos'], ['withdrawal', 'Retiros'], ['pending', 'Por revisar']];
const GROUPS = [['Depósitos de gastos', record => record.kind === 'deposit' && record.purpose === 'expenses'],
  ['Depósitos de ahorro', record => record.kind === 'deposit' && record.purpose !== 'expenses'], ['Retiros', record => record.kind === 'withdrawal']];
const chipClass = active => `rounded-full px-4 py-2 min-h-11 text-sm ${active ? 'bg-texto text-white font-bold' : 'bg-white shadow-soft'}`;

// The month's movements by type; a row opens its detail.
export default function MovementList({ entries, selected, onOpen }) {
  const [filter, setFilter] = useState('all');
  const [who, setWho] = useState('all'); const [currency, setCurrency] = useState('all'); const [purpose, setPurpose] = useState('all');
  const [period, setPeriod] = useState(selected ?? 'all');
  const periodMap = new Map(entries.map(entry => movementMonth(entry.record)).filter(Boolean).map(value => [periodKey(value), value]));
  if (parsePeriodInput(selected)) periodMap.set(selected, parsePeriodInput(selected));
  const periods = [...periodMap].sort().reverse();
  const visible = entries.filter(entry => (who === 'all' || entry.record.contributorId === who)
    && (currency === 'all' || (currency === 'unknown' ? !entry.record.currency : entry.record.currency === currency))
    && (purpose === 'all' || entry.record.purpose === purpose)
    && (period === 'all' || (movementMonth(entry.record) && periodKey(movementMonth(entry.record)) === period)))
    .filter(entry => filter === 'all' || (filter === 'pending' ? entry.status === 'pending' : entry.record.kind === filter))
    .sort((a, b) => (b.record.effectiveDate ?? '').localeCompare(a.record.effectiveDate ?? '') || a.record.id.localeCompare(b.record.id));
  return <section className="space-y-3" aria-labelledby="movements-title" data-testid="control-movements">
    <h2 id="movements-title" className="font-bold text-lg">Historial de movimientos</h2>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {[['movement-person', 'Aportante', who, setWho, [['all', 'Todos'], ['milton', 'Milton'], ['fiorella', 'Fiorella']]],
        ['movement-currency', 'Moneda', currency, setCurrency, [['all', 'Todas'], ['PEN', 'PEN'], ['USD', 'USD'], ['unknown', 'Por confirmar']]],
        ['movement-purpose', 'Destino', purpose, setPurpose, [['all', 'Todos'], ['expenses', purposeName('expenses')], ['savings', purposeName('savings')]]],
        ['movement-period', 'Periodo', period, setPeriod, [['all', 'Todos'], ...periods.map(([key, value]) => [key, formatPeriod(value)])]]].map(([id, name, value, change, options]) => <div key={id}>
          <label htmlFor={id} className="block text-xs font-bold">{name}</label><select id={id} value={value} onChange={event => change(event.target.value)} className="w-full min-w-0 min-h-11 rounded-xl bg-white px-2 text-sm">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></div>)}
    </div>
    <div role="group" aria-label="Filtrar movimientos" className="flex flex-wrap gap-2">
      {CHIPS.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} className={chipClass(filter === id)}
        onClick={() => setFilter(id)}>{label}</button>)}
    </div>
    {!visible.length && <p className="rounded-[24px] bg-white p-4 text-sm shadow-soft">Sin movimientos para este mes y filtro.</p>}
    <div className="grid gap-3 lg:grid-cols-3 items-start">
      {GROUPS.map(([title, test]) => {
        const rows = visible.filter(entry => test(entry.record));
        return !!rows.length && <section key={title} className="rounded-[24px] bg-white p-4 shadow-soft" aria-label={title}>
          <h3 className="text-xs font-bold text-texto-light">{title}</h3>
          <ul>{rows.map(({ record, status }) => <li key={record.id} data-ledger-id={record.id} data-ledger-state={status}
            className="border-t border-secundario/60 first:border-t-0">
            <button type="button" onClick={() => onOpen(record.id)} className="flex w-full min-h-11 items-center gap-3 py-2 text-left hover:bg-principal/20"
              aria-label={`Ver ${title.toLowerCase()} ${controlMoney(record.amount, record.currency)}`}>
              <span className="w-12 shrink-0 text-xs text-texto-light">{record.effectiveDate ? formatShortDate(record.effectiveDate) : 'Sin fecha'}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {record.description || (record.kind === 'deposit' ? personName(record.contributorId) : 'Retiro')}
                {record.kind === 'deposit' && <span className="block text-[10px] text-texto-light">{contributionLabel(record)}</span>}
                {currencyOriginWarning(record) && <span className="block text-[10px]">Moneda por confirmar</span>}</span>
              {!['reviewed', 'imported'].includes(status) && <Badge tone={statusTone(status)}>{statusName(status)}</Badge>}
              <span className="shrink-0 text-sm font-bold tabular-nums">{controlMoney(record.amount, record.currency)}</span>
            </button>
          </li>)}</ul>
        </section>;
      })}
    </div>
  </section>;
}
