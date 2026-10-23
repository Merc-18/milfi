import { useState } from 'react';
import { FINANCIAL_RULES } from '../../domain/financialRules.js';
import { formatAmount, formatPeriod } from '../../presentation/format.js';
import { groupByDay } from '../../presentation/variablePace.js';
import { buttonClass, cardClass, fieldClass } from '../FiorellaSession.jsx';

const PAGE = 15;
const CHIPS = [['all', 'Todas'], ...FINANCIAL_RULES.variableCategories.map(category => [category.id, category.name])];
const categoryName = id => FINANCIAL_RULES.variableCategories.find(category => category.id === id)?.name ?? id;
const chipClass = active => `rounded-full px-4 py-2 min-h-11 text-sm ${active ? 'bg-texto text-white font-bold' : 'bg-white shadow-soft'}`;
const rowClass = 'flex w-full min-h-11 items-center gap-3 py-2 text-left';

function ExpenseRow({ record, onEdit }) {
  const content = <>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-bold">{record.description}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-texto-light">{categoryName(record.categoryId)}
        {record.subcategory && <span className="rounded-full bg-secundario px-2 py-0.5 text-texto">{record.subcategory}</span>}</span>
    </span>
    <span className="shrink-0 font-bold tabular-nums">{formatAmount(record.amount)}</span>
  </>;
  return <li data-expense-id={record.id} className="border-t border-secundario/60 first:border-t-0">
    {onEdit ? <button type="button" className={`${rowClass} hover:bg-principal/20`} onClick={() => onEdit(record)}
      aria-label={`Editar ${record.description}, ${formatAmount(record.amount)}`}>{content}</button>
      : <div className={rowClass}>{content}</div>}
  </li>;
}

// The month's variable expenses by day, with search and category chips.
export default function ExpenseList({ records, period, today, manage, onEdit }) {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const text = search.trim().toLocaleLowerCase('es');
  const visible = records.filter(record => (category === 'all' || record.categoryId === category)
    && (!text || [record.description, record.subcategory, record.notes].some(value => value?.toLocaleLowerCase('es').includes(text))));
  // Page the newest expenses first, then group the visible page by day.
  const newest = [...visible].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || a.id.localeCompare(b.id));
  const paged = groupByDay(newest.slice(0, shown), today);
  if (!records.length) return <section className={`${cardClass} space-y-3`} aria-label="Gastos variables">
    <p className="text-sm">Aún no hay gastos variables en {formatPeriod(period)}.</p>
    {manage && <p className="text-xs text-texto-light">Usa «Registrar gasto», arriba.</p>}
  </section>;
  return <section className="space-y-3" aria-label="Gastos variables">
    <div className="space-y-2">
      <div><label htmlFor="gv-filter-text" className="block text-xs font-bold mb-1">Buscar</label>
        <input id="gv-filter-text" type="search" className={fieldClass} value={search}
          onChange={event => { setSearch(event.target.value); setShown(PAGE); }} /></div>
      <div role="group" aria-label="Categoría" className="flex flex-wrap gap-2">
        {CHIPS.map(([id, label]) => <button key={id} type="button" aria-pressed={category === id} className={chipClass(category === id)}
          onClick={() => { setCategory(id); setShown(PAGE); }}>{label}</button>)}
      </div>
    </div>
    {!visible.length && <p className={cardClass}>Ningún gasto coincide con la búsqueda.</p>}
    <div className="grid gap-3 lg:grid-cols-2 items-start">
      {paged.map(day => <section key={day.date} className={cardClass} aria-labelledby={`gv-day-${day.date}`}>
        <h3 id={`gv-day-${day.date}`} className="text-xs font-bold text-texto-light">{day.label}</h3>
        <ul>{day.records.map(record => <ExpenseRow key={record.id} record={record} onEdit={manage ? onEdit : null} />)}</ul>
      </section>)}
    </div>
    {visible.length > shown && <button type="button" className={`${buttonClass} w-full sm:w-auto`} onClick={() => setShown(value => value + PAGE)}>
      Ver más ({visible.length - shown} restantes)</button>}
  </section>;
}
