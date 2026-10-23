import { sessionCommand, sessionResultMessage, useDemoLabel, useFiorellaPeriod, usePersisted } from '../presentation/fiorellaSession.js';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import { useStore } from '../store/useStore.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { fixedGroups, summarizeExpenses } from '../domain/fiorellaDashboard.js';
import { formatAmount, formatPeriod } from '../presentation/format.js';
import { buttonClass, cardClass, Comparison, fieldClass, Help, Kpi, MoneyInput, PageHeader, PeriodPicker, Progress, SessionNotice } from '../components/FiorellaSession.jsx';

const PAGE = 15;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const periodOfDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) ? { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) } : null;
const label = (id, text) => <label htmlFor={id} className="block font-bold text-sm mb-1">{text}</label>;

function VariableForm({ input, period, record, onDone, onCancel, suggestions }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const select = useStore(state => state.selectFiorellaPeriod);
  const [base] = useState(record);
  const [date, setDate] = useState(record?.effectiveDate ?? (today().startsWith(input) ? today() : ''));
  const [category, setCategory] = useState(record?.categoryId ?? 'salud');
  const [description, setDescription] = useState(record?.description ?? '');
  const [amount, setAmount] = useState(record?.amount ?? '');
  const [subcategory, setSubcategory] = useState(record?.subcategory ?? '');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [similar, setSimilar] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const persisted = usePersisted();
  const demo = useDemoLabel();
  const submit = async event => {
    event.preventDefault();
    // A new expense belongs to the month of its own date; an edit keeps its month.
    const target = record ? period : periodOfDate(date) ?? period;
    setSaving(true);
    const result = await save(sessionCommand('variable-expense', target, base, { effectiveDate: date, categoryId: category,
      description, amount, subcategory, notes, allowSimilar: similar }));
    setSaving(false);
    if (!result.ok) { setError(sessionResultMessage(result, persisted)); return; }
    const moved = `${target.year}-${String(target.month).padStart(2, '0')}` !== input;
    onDone(`${record ? 'Gasto actualizado' : 'Gasto guardado'}${moved ? ` en ${formatPeriod(target)}` : ''}. ${sessionResultMessage(result, persisted)}`);
    if (moved) select(`${target.year}-${String(target.month).padStart(2, '0')}`);
  };
  return <form aria-label={`Gasto variable${demo ? ' de demostración' : ''}`} onSubmit={submit} className="space-y-3 pt-3">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div>{label('gv-date', 'Fecha')}<input id="gv-date" type="date" min="0001-01-01" max="9999-12-31" className={fieldClass} value={date} onChange={event => setDate(event.target.value)} required /></div>
      <MoneyInput id="gv-amount" label={`Importe${demo} (S/)`} value={amount} onChange={setAmount} />
      <div>{label('gv-category', 'Categoría')}<select id="gv-category" className={fieldClass} value={category} onChange={event => setCategory(event.target.value)}>{FINANCIAL_RULES.variableCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div>{label('gv-subcategory', 'Subcategoría')}<input id="gv-subcategory" className={fieldClass} maxLength={80} list="gv-subcategories" value={subcategory} onChange={event => setSubcategory(event.target.value)} placeholder="Opcional" />
        <datalist id="gv-subcategories">{suggestions.map(item => <option key={item} value={item} />)}</datalist></div>
      <div className="col-span-2">{label('gv-description', 'Descripción')}<input id="gv-description" className={fieldClass} maxLength={300} value={description} onChange={event => setDescription(event.target.value)} required /></div>
      <div className="col-span-2">{label('gv-notes', 'Notas')}<input id="gv-notes" className={fieldClass} maxLength={500} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Opcional" /></div>
    </div>
    <label htmlFor="gv-similar" className="flex gap-3 items-start text-xs"><input id="gv-similar" type="checkbox" className="mt-1 shrink-0" checked={similar} onChange={event => setSimilar(event.target.checked)} />Es otro gasto aunque coincidan fecha, categoría, descripción e importe.</label>
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Guardando…' : `${record ? 'Actualizar gasto' : persisted ? 'Guardar gasto' : 'Registrar gasto'}${persisted ? '' : ' · sesión'}`}</button>
      {record && <button type="button" className="underline text-sm min-h-11" onClick={onCancel}>Cancelar edición</button>}
    </div>
    {error && <p role="alert" className="text-sm rounded-xl bg-rose-50 px-3 py-2">{error}</p>}
    <Help><p>Usa punto decimal. El gasto se guarda en el mes de su fecha. Ningún gasto redistribuye fondos.</p></Help>
  </form>;
}

const FILTERS = [['all', 'Todos'], ['fixed', 'Fijos'], ['variable', 'Variables']];
const amountOrMissing = value => value == null ? 'Sin registrar' : formatAmount(value);

// GF real: monthly totals per subcategory from Presupuestos GF (no dates, no copies).
function FixedExpenses({ summary, manage }) {
  const demo = useDemoLabel();
  return <section className="space-y-3" aria-label="Gastos fijos">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold text-lg">Gastos fijos (GF){demo}</h2>
      {manage && <Link to="/fiorella/presupuestos" className="inline-flex items-center gap-2 rounded-xl bg-white shadow-soft font-bold px-4 py-2 min-h-11 text-sm"><Pencil size={16} aria-hidden="true" />Editar gasto fijo</Link>}
    </div>
    <p className="text-xs text-texto-light">Total real del mes por subcategoría, sin fecha individual.</p>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-start" data-testid="fixed-expenses">
      {fixedGroups(summary).map(group => <div key={group.id} className={`${cardClass} text-sm`}>
        <p className="flex justify-between gap-2 font-bold"><span>{group.name}</span><span>{amountOrMissing(group.actual)}</span></p>
        <ul className="mt-2 divide-y divide-secundario/60">
          {group.rows.map(({ category, record }) => <li key={category.id} className="flex justify-between gap-3 py-1.5" data-fixed-id={category.id}>
            <span className="min-w-0 truncate">{category.name}</span>
            <span className={record?.actualAmount == null ? 'text-texto-light' : 'font-bold'}>{amountOrMissing(record?.actualAmount)}</span>
          </li>)}
        </ul>
      </div>)}
    </div>
  </section>;
}

function VariableExpenses({ input, period, summary, manage, onFeedback, startOpen }) {
  const records = useStore(state => state.fiorellaDemoRecords);
  const persisted = usePersisted();
  const demo = useDemoLabel();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [editing, setEditing] = useState(null);
  const [generation, setGeneration] = useState(0);
  const [open, setOpen] = useState(startOpen);
  const suggestions = useMemo(() => [...new Set(records.filter(record => record.kind === 'variable-expense' && record.subcategory).map(record => record.subcategory))].sort(), [records]);
  const text = search.trim().toLocaleLowerCase('es');
  const visible = summary.variable.filter(record => (category === 'all' || record.categoryId === category)
    && (!text || [record.description, record.subcategory, record.notes].some(value => value?.toLocaleLowerCase('es').includes(text))))
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || a.id.localeCompare(b.id));
  const done = message => { onFeedback(message); setEditing(null); setGeneration(value => value + 1); };
  return <section className="space-y-3" aria-label="Gastos variables">
    {manage && <details className={cardClass} open={open || !!editing} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="font-bold cursor-pointer min-h-11 flex items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden">
        <span>{editing ? 'Editar gasto variable' : '+ Registrar gasto variable'}{demo}</span><span aria-hidden="true">▾</span></summary>
      <VariableForm key={`${editing ?? 'new'}:${generation}`} input={input} suggestions={suggestions} period={period} record={summary.variable.find(record => record.id === editing)} onDone={done} onCancel={() => done('Edición cancelada.')} />
    </details>}
    <h2 className="font-bold text-lg">Gastos variables (GV){demo}</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      {summary.categories.map(item => <div key={item.id} className={`${cardClass} text-sm space-y-1`}>
        <p className="flex flex-wrap justify-between gap-2"><span className="font-bold">{item.name}</span>
          <span>{item.executed.amount === null ? 'S/ 0' : formatAmount(item.executed.amount)} de {item.allocation === null ? '—' : formatAmount(item.allocation)} asignado</span></p>
        <Progress value={item.executed.amount ?? '0'} limit={item.allocation} label={`${item.name}: gasto frente a lo asignado`} />
        <p className="text-xs"><span className="sr-only">{persisted ? 'Anotado' : 'Acumulado de la sesión'}: </span><Comparison budget={item.allocation} spent={item.executed.amount} /></p>
      </div>)}
    </div>
    {summary.requiresRoundingDecision && <p className="text-sm">Importes con fracciones de céntimo; redondeo pendiente.</p>}
    {!!summary.variable.length && <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
      <div><label htmlFor="gv-filter-category" className="block font-bold text-xs mb-1">Categoría</label><select id="gv-filter-category" className={fieldClass} value={category} onChange={event => { setCategory(event.target.value); setShown(PAGE); }}>
        <option value="all">Todas</option>{FINANCIAL_RULES.variableCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div><label htmlFor="gv-filter-text" className="block font-bold text-xs mb-1">Buscar</label><input id="gv-filter-text" type="search" className={fieldClass} value={search} onChange={event => { setSearch(event.target.value); setShown(PAGE); }} /></div>
    </div>}
    {!summary.variable.length && <p className={cardClass}>Sin gastos variables registrados en {formatPeriod(period)}.</p>}
    {!!summary.variable.length && !visible.length && <p className={cardClass}>Ningún gasto coincide con el filtro.</p>}
    <div className="grid gap-2 lg:grid-cols-2">
      {visible.slice(0, shown).map(record => <article key={record.id} className={`${cardClass} text-sm space-y-1`}>
        <p className="flex flex-wrap justify-between gap-2"><span className="font-bold">{record.effectiveDate} · {record.categoryId === 'salud' ? 'Salud' : 'Ocio'}{record.subcategory ? ` / ${record.subcategory}` : ''}</span><span className="font-bold break-all">{formatAmount(record.amount)}</span></p>
        <p className="break-words">{record.description}</p>
        {record.notes && <p className="break-words text-texto-light">{record.notes}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <details className="text-xs text-texto-light">
            <summary className="cursor-pointer min-h-11 flex items-center">Detalles</summary>
            <p className="pb-2">{persisted ? (record.provenance?.type === 'fiorella-excel' ? 'Cargado del Excel' : 'Registrado en MilFi') : 'Demostración'} · Revisión {record.revision}</p>
          </details>
          {manage && <button type="button" className="underline font-bold min-h-11" onClick={() => { setEditing(record.id); onFeedback(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar<span className="sr-only"> {record.description}</span></button>}
        </div>
      </article>)}
    </div>
    {visible.length > shown && <button type="button" className={`${buttonClass} w-full sm:w-auto`} onClick={() => setShown(value => value + PAGE)}>Ver más ({visible.length - shown} restantes)</button>}
  </section>;
}

// "¿Cuánto gasté realmente este mes y en qué?": GF real and GV real together, each counted once.
export default function GastosGV() {
  const manage = canManage(useModuleAccess('fiorella'));
  const { input, period, summary } = useFiorellaPeriod();
  const [searchParams] = useSearchParams();
  const [feedback, setFeedback] = useState('');
  const [filter, setFilter] = useState('all');
  const demo = useDemoLabel();
  const expenses = summarizeExpenses(summary);
  const projected = summary.monthly?.planStatus === 'projected';
  return <div className="pb-10 space-y-4">
    <PageHeader title="Gastos"><PeriodPicker /></PageHeader>
    <SessionNotice />
    {!manage && <ReadOnlyNotice>Administra Fiorella.</ReadOnlyNotice>}
    {feedback && <p role="status" className="text-sm font-bold rounded-xl bg-exito/60 px-3 py-2">{feedback}</p>}
    {projected && <p className="text-sm font-bold rounded-xl bg-acento/50 px-3 py-2" role="note">Mes proyectado: solo cuentan los gastos efectivamente registrados; presupuestos y planes no son gastos.</p>}
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3" data-testid="expense-summary">
      <Kpi label={`GF real${demo}`} amount={expenses.fixed.amount}><p className="text-xs">{expenses.fixed.registered}/{expenses.fixed.expected} subcategorías con gasto</p></Kpi>
      <Kpi label={`GV real${demo}`} amount={expenses.variable.amount}><p className="text-xs">{expenses.variable.count ? `${expenses.variable.count} gasto(s)` : 'Sin gastos variables'}</p></Kpi>
      <div className="col-span-2 lg:col-span-1"><Kpi label={`Total registrado${expenses.total.partial && expenses.total.amount !== null ? ' · parcial' : ''}${demo}`} amount={expenses.total.amount} tone="bg-principal/40">
        <p className="text-xs">{expenses.total.partial ? `Parcial: GF registrado en ${expenses.fixed.registered}/${expenses.fixed.expected} subcategorías` : 'GF completo + GV'}</p></Kpi></div>
    </div>
    <div className="flex gap-1 rounded-xl bg-white p-1 shadow-soft w-fit" role="group" aria-label="Tipo de gasto">
      {FILTERS.map(([value, text]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
        className={`rounded-lg px-4 py-2 min-h-11 text-sm ${filter === value ? 'bg-texto text-white font-bold' : ''}`}>{text}</button>)}
    </div>
    <div hidden={filter === 'variable'}><FixedExpenses summary={summary} manage={manage} /></div>
    <div hidden={filter === 'fixed'}><VariableExpenses key={input} input={input} period={period} summary={summary} manage={manage} onFeedback={setFeedback} startOpen={searchParams.has('nuevo')} /></div>
  </div>;
}
