import { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { usePeriodStore } from '../store/periodStore.js';
import { formatAmount, formatPeriod, parsePeriodInput } from '../presentation/format.js';
import DistributionDetails from '../components/DistributionDetails.jsx';
import { fieldClass } from '../components/FiorellaSession.jsx';
import { FIXED_CATEGORIES, FIXED_SUBCATEGORIES } from '../domain/fiorellaCategories.js';
import { fiorellaHistory } from '../domain/fiorellaSession.js';

const labels = { income: 'Ingreso', appliedFixedExpense: 'GF aplicado', budgetAmount: 'Presupuesto GF', actualAmount: 'Gasto GF', amount: 'Importe GV', description: 'Descripción', effectiveDate: 'Fecha', categoryId: 'Categoría', subcategory: 'Subcategoría', notes: 'Notas' };
const textFields = ['description', 'effectiveDate', 'subcategory', 'notes'];
const categoryName = id => {
  const category = FIXED_SUBCATEGORIES.find(item => item.id === id);
  return category ? `${FIXED_CATEGORIES.find(group => group.id === category.parentId).name} / ${category.name}` : id === 'salud' ? 'Salud' : 'Ocio';
};
const show = (field, value) => value == null ? 'Sin registrar' : textFields.includes(field) ? value : field === 'categoryId' ? categoryName(value) : formatAmount(value);
const PAGE = 15;
const kinds = { 'monthly-plan': 'Datos del mes', 'fixed-budget': 'GF', 'variable-expense': 'GV' };
const sourceLabel = (record, persisted) => !persisted ? '' : `${record.provenance?.type === 'fiorella-excel' ? 'Cargado del Excel' : 'Registrado en MilFi'} · `;

function HistoryRecord({ record, persisted }) {
  const title = record.kind === 'monthly-plan' ? `Datos del mes${record.planStatus === 'projected' ? ' · proyectado' : ''}` : `${kinds[record.kind]} · ${categoryName(record.categoryId)}`;
  const shown = Object.entries(labels).filter(([field]) => Object.hasOwn(record, field) && field !== 'categoryId' && (record[field] != null || !textFields.includes(field)));
  return <article className="bg-white p-4 rounded-2xl text-sm space-y-1">
    <h4 className="font-bold">{title}</h4>
    <dl className="grid grid-cols-2 gap-x-3">{shown.map(([field, label]) => <div key={field} className="py-1 min-w-0"><dt className="text-xs">{label}</dt><dd className="font-bold break-words">{show(field, record[field])}</dd></div>)}</dl>
    <details className="text-xs text-texto-light">
      <summary className="cursor-pointer min-h-11 flex items-center">Detalles</summary>
      <p className="pb-2">{sourceLabel(record, persisted)}Revisión {record.revision}</p>
    </details>
  </article>;
}

export default function Historial() {
  const simulations = useStore(state => state.simulations);
  const records = useStore(state => state.fiorellaDemoRecords);
  const events = useStore(state => state.fiorellaDemoEvents);
  const persisted = useStore(state => !!state.remote);
  const [kind, setKind] = useState('all');
  const [category, setCategory] = useState('all');
  // Opens on the month selected in the module, not on every month at once.
  const selected = usePeriodStore(state => state.selectedPeriod);
  const [month, setMonth] = useState(selected);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const groups = fiorellaHistory(records, events, simulations, persisted ? 'real' : 'simulated');
  const text = search.trim().toLocaleLowerCase('es');
  const matches = record => (kind === 'all' || record.kind === kind) && (category === 'all' || record.categoryId === category || record.categoryId?.startsWith(`${category}-`))
    && (!text || [record.description, record.subcategory, record.notes, record.categoryId && categoryName(record.categoryId)].some(value => value?.toLocaleLowerCase('es').includes(text)));
  const order = record => [record.kind === 'variable-expense' ? 0 : record.kind === 'fixed-budget' ? 1 : 2, record.effectiveDate ? -Date.parse(record.effectiveDate) : 0, categoryName(record.categoryId ?? '') ?? ''];
  const sorted = list => [...list].sort((a, b) => { const x = order(a); const y = order(b); return x[0] - y[0] || x[1] - y[1] || String(x[2]).localeCompare(String(y[2])); });
  const matching = groups.filter(group => month === 'all' || group.key === month).map(group => ({ ...group, shown: sorted(group.records.filter(matches)) })).filter(group => group.shown.length);
  const total = matching.reduce((sum, group) => sum + group.shown.length, 0);
  // Page through the records, keeping them grouped by month.
  const starts = matching.map((_, index) => matching.slice(0, index).reduce((sum, group) => sum + group.shown.length, 0));
  const visible = matching.map((group, index) => ({ ...group, total: group.shown.length, shown: group.shown.slice(0, Math.max(0, shown - starts[index])) })).filter(group => group.shown.length);
  const change = setter => event => { setter(event.target.value); setShown(PAGE); };
  return (
    <div className="pb-10">
      <header className="mt-2 mb-4"><h1 className="text-2xl md:text-3xl font-bold">Historial</h1><p className="text-sm text-texto-light mt-1">Ingresos, presupuestos y gastos</p></header>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" role="search" aria-label="Filtrar historial">
        <div><label htmlFor="history-kind" className="block font-bold text-xs mb-1">Tipo</label><select id="history-kind" className={fieldClass} value={kind} onChange={change(setKind)}>
          <option value="all">Todos</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div><label htmlFor="history-category" className="block font-bold text-xs mb-1">Categoría</label><select id="history-category" className={fieldClass} value={category} onChange={change(setCategory)}>
          <option value="all">Todas</option><option value="salud">GV · Salud</option><option value="ocio">GV · Ocio</option>
          {FIXED_CATEGORIES.map(group => <option key={group.id} value={group.id}>GF · {group.name}</option>)}</select></div>
        <div><label htmlFor="history-month" className="block font-bold text-xs mb-1">Mes</label><select id="history-month" className={fieldClass} value={month} onChange={change(setMonth)}>
          <option value="all">Todos los meses</option>{!groups.some(group => group.key === selected) && <option value={selected}>{formatPeriod(parsePeriodInput(selected))}</option>}
          {groups.map(group => <option key={group.key} value={group.key}>{formatPeriod(group.period)}</option>)}</select></div>
        <div><label htmlFor="history-search" className="block font-bold text-xs mb-1">Buscar</label><input id="history-search" type="search" className={fieldClass} value={search} onChange={change(setSearch)} /></div>
      </div>
      {!records.length && <p className="text-sm mb-5">Todavía no hay registros.</p>}
      {!!records.length && !visible.length && <p className="text-sm mb-5">Ningún registro {month === 'all' ? 'coincide con el filtro' : 'en este mes con ese filtro'}.{month !== 'all' && <button type="button" className="underline font-bold ml-2 min-h-11" onClick={() => { setMonth('all'); setShown(PAGE); }}>Ver todos los meses</button>}</p>}
      {visible.map(group => <section key={group.key} className="space-y-3 mb-6" data-demo-period={group.key}>
        <h2 className="font-bold first-letter:uppercase">{formatPeriod(group.period)} · {group.total} registro(s)</h2>
        <div className="grid gap-2 md:grid-cols-2">{group.shown.map(record => <HistoryRecord key={record.id} record={record} persisted={persisted} />)}</div>
        {!!group.events.length && <details className="text-sm bg-secundario/20 p-3 rounded-2xl"><summary className="cursor-pointer font-bold min-h-11 py-2">Historial de cambios ({group.events.length})</summary>
          {group.events.map(event => <article key={event.id} className="border-t border-secundario py-2">
            <p className="font-bold">{event.action === 'created' ? 'Registro creado' : 'Registro actualizado'} · Revisión {event.revision}</p>
            <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</time>
            {Object.entries(labels).filter(([field]) => Object.hasOwn(event.after, field) && event.before?.[field] !== event.after[field]).map(([field, label]) => <p key={field} className="break-words mt-1">{label}: {show(field, event.before?.[field])} → {show(field, event.after[field])}</p>)}
            {event.similarExpenseAcknowledged && <p className="mt-1">Se indicó expresamente que es otro gasto con datos coincidentes.</p>}
          </article>)}
        </details>}
      </section>)}
      {total > shown && <button type="button" className="mb-6 bg-texto text-white font-bold px-4 py-3 rounded-xl w-full sm:w-auto" onClick={() => setShown(value => value + PAGE)}>Ver más ({total - shown} restantes)</button>}
      {(!persisted || simulations.length > 0) && <>
      <h2 className="font-bold text-lg mb-2">Simulaciones de esta sesión</h2>
      <p className="text-sm mb-5">Son ejemplos independientes. No representan ingresos ni ahorros reales y se pierden al recargar.</p>
      {simulations.length === 0 ? <p className="text-sm bg-white p-5 rounded-[24px] shadow-soft">Todavía no guardaste simulaciones en esta sesión.</p> : (
        <div className="space-y-4">
          {groups.filter(group => group.simulations.length).map(group => <section key={group.key} className="space-y-4">
            <h3 className="font-bold first-letter:uppercase">{formatPeriod(group.period)}</h3>
            {group.simulations.map(simulation => (
              <details key={simulation.id} className="bg-white p-5 rounded-[24px] shadow-soft">
                <summary className="cursor-pointer font-bold"><span className="first-letter:uppercase">{formatPeriod(simulation.period)}</span> · {formatAmount(simulation.distribution.income)}<span className="block text-sm font-normal mt-1">Simulación · Ver distribución</span></summary>
                <div className="mt-4"><DistributionDetails distribution={simulation.distribution} /></div>
                <p className="text-sm mt-3">Importes exactos, sin redondear.{simulation.requiresRoundingDecision && ' Contiene fracciones de céntimo pendientes de criterio monetario.'}</p>
              </details>
            ))}</section>)}
        </div>
      )}
      </>}
    </div>
  );
}
