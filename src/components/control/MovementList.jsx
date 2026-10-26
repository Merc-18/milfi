import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { contributionParts, contributionLabel } from '../../domain/controlContributions.js';
import { periodKey } from '../../domain/fiorellaSession.js';
import { controlMoney, personName, statusName, statusTone, currencyOriginWarning } from '../../presentation/control.js';
import { movementMonth } from '../../presentation/controlLedgerView.js';
import { formatShortDate } from '../../presentation/format.js';
import Badge from '../ui/Badge.jsx';
import Sheet from '../ui/Sheet.jsx';
import MovementFilters from './MovementFilters.jsx';

const CHIPS = [['all', 'Todos'], ['deposit', 'Depósitos'], ['withdrawal', 'Retiros']];
const GROUPS = [['Depósitos de gastos', record => record.kind === 'deposit' && record.purpose === 'expenses'],
  ['Depósitos de ahorro', record => record.kind === 'deposit' && record.purpose !== 'expenses'], ['Retiros', record => record.kind === 'withdrawal']];
const chipClass = active => `rounded-full px-4 py-2 min-h-11 text-sm ${active ? 'bg-texto text-white font-bold' : 'bg-white shadow-soft'}`;
const ALL = { who: 'all', currency: 'all', purpose: 'all' };

const matches = (record, { who, currency, purpose }) => (who === 'all' || record.contributorId === who)
  && (currency === 'all' || (currency === 'unknown' ? !record.currency : record.currency === currency))
  && (purpose === 'all' || record.purpose === purpose);
// The historical "Sin clasificación" label lives in the detail only.
const typeLabel = record => record.kind === 'deposit' && contributionParts(record).kind !== 'unclassified' ? contributionLabel(record) : null;

function Row({ record, status, title, onOpen }) {
  const label = typeLabel(record);
  return <li data-ledger-id={record.id} data-ledger-state={status} className="border-t border-secundario/60 first:border-t-0">
    <button type="button" onClick={() => onOpen(record.id)} className="flex w-full min-h-11 items-center gap-3 py-2 text-left hover:bg-principal/20"
      aria-label={`Ver ${title.toLowerCase()} ${controlMoney(record.amount, record.currency)}`}>
      <span className="w-12 shrink-0 text-xs text-texto-light">{record.effectiveDate ? formatShortDate(record.effectiveDate) : 'Sin fecha'}</span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {record.description || (record.kind === 'deposit' ? personName(record.contributorId) : 'Retiro')}
        {label && <span className="block text-[10px] text-texto-light">{label}</span>}
        {currencyOriginWarning(record) && <span className="block text-[10px]">Moneda por confirmar</span>}</span>
      {!['reviewed', 'imported'].includes(status) && <Badge tone={statusTone(status)}>{statusName(status)}</Badge>}
      <span className="max-w-[45%] text-right text-sm font-bold tabular-nums">{controlMoney(record.amount, record.currency)}</span>
    </button>
  </li>;
}

// The selected month's movements (or the whole history) by type; a row opens its detail.
export default function MovementList({ entries, selected, onOpen }) {
  const [kind, setKind] = useState('all');
  const [filters, setFilters] = useState(ALL);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(false);
  const active = Object.values(filters).filter(value => value !== 'all').length;
  const visible = entries.filter(({ record }) => matches(record, filters) && (kind === 'all' || record.kind === kind)
    && (all || (movementMonth(record) && periodKey(movementMonth(record)) === selected)))
    .sort((a, b) => (b.record.effectiveDate ?? '').localeCompare(a.record.effectiveDate ?? '') || a.record.id.localeCompare(b.record.id));
  return <section className="space-y-3" aria-labelledby="movements-title" data-testid="control-movements">
    <h2 id="movements-title" className="font-bold text-lg">Movimientos</h2>
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Tipo de movimiento" className="flex flex-wrap gap-2">
        {CHIPS.map(([id, label]) => <button key={id} type="button" aria-pressed={kind === id} className={chipClass(kind === id)}
          onClick={() => setKind(id)}>{label}</button>)}
      </div>
      <button type="button" className={`${chipClass(active > 0)} inline-flex items-center gap-2`} onClick={() => setOpen(true)}>
        <SlidersHorizontal size={16} aria-hidden="true" />Filtros{active > 0 ? ` (${active})` : ''}</button>
      <label className="inline-flex min-h-11 items-center gap-2 text-sm">
        <input id="movement-history" type="checkbox" role="switch" checked={all} onChange={event => setAll(event.target.checked)} />
        Ver todo el historial</label>
    </div>
    {!visible.length && <p className="rounded-[24px] bg-white p-4 text-sm shadow-soft">Sin movimientos para este mes y filtro.</p>}
    <div className="grid gap-3 lg:grid-cols-3 items-start">
      {GROUPS.map(([title, test]) => {
        const rows = visible.filter(entry => test(entry.record));
        return !!rows.length && <section key={title} className="rounded-[24px] bg-white p-4 shadow-soft" aria-label={title}>
          <h3 className="text-xs font-bold text-texto-light">{title}</h3>
          <ul>{rows.map(({ record, status }) => <Row key={record.id} record={record} status={status} title={title} onOpen={onOpen} />)}</ul>
        </section>;
      })}
    </div>
    <Sheet open={open} onClose={() => setOpen(false)} title="Filtros">
      <MovementFilters filters={filters} onChange={setFilters} />
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="min-h-11 rounded-xl bg-texto px-4 font-bold text-white" onClick={() => setOpen(false)}>Ver movimientos</button>
        {active > 0 && <button type="button" className="min-h-11 font-bold underline" onClick={() => setFilters(ALL)}>Quitar filtros</button>}
      </div>
    </Sheet>
  </section>;
}
