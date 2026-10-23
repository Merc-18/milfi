import { useState } from 'react';
import { controlMoney, personName, statusName, statusTone } from '../../presentation/control.js';
import { formatShortDate } from '../../presentation/format.js';
import Badge from '../ui/Badge.jsx';

const CHIPS = [['all', 'Todos'], ['deposit', 'Depósitos'], ['withdrawal', 'Retiros'], ['pending', 'Por revisar']];
const GROUPS = [['Depósitos de gastos', record => record.kind === 'deposit' && record.purpose === 'expenses'],
  ['Depósitos de ahorro', record => record.kind === 'deposit' && record.purpose !== 'expenses'], ['Retiros', record => record.kind === 'withdrawal']];
const chipClass = active => `rounded-full px-4 py-2 min-h-11 text-sm ${active ? 'bg-texto text-white font-bold' : 'bg-white shadow-soft'}`;

// The month's movements by type; a row opens its detail.
export default function MovementList({ entries, onOpen }) {
  const [filter, setFilter] = useState('all');
  const visible = entries.filter(entry => filter === 'all' || (filter === 'pending' ? entry.status === 'pending' : entry.record.kind === filter))
    .sort((a, b) => (b.record.effectiveDate ?? '').localeCompare(a.record.effectiveDate ?? '') || a.record.id.localeCompare(b.record.id));
  return <section className="space-y-3" aria-labelledby="movements-title" data-testid="control-movements">
    <h2 id="movements-title" className="font-bold text-lg">Movimientos del mes</h2>
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
                {record.description || (record.kind === 'deposit' ? personName(record.contributorId) : 'Retiro')}</span>
              {!['reviewed', 'imported'].includes(status) && <Badge tone={statusTone(status)}>{statusName(status)}</Badge>}
              <span className="shrink-0 text-sm font-bold tabular-nums">{controlMoney(record.amount, record.currency)}</span>
            </button>
          </li>)}</ul>
        </section>;
      })}
    </div>
  </section>;
}
