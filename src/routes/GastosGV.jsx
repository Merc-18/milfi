import { sessionCommand, sessionResultMessage, useDemoLabel, useFiorellaPeriod, usePersisted } from '../presentation/fiorellaSession.js';
import { useMemo, useState } from 'react';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import { useStore } from '../store/useStore.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { formatAmount } from '../presentation/format.js';
import { buttonClass, cardClass, Comparison, fieldClass, Help, MoneyInput, PeriodPicker, Progress, SessionNotice } from '../components/FiorellaSession.jsx';

function VariableForm({ period, record, onDone, onCancel, suggestions }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const [base] = useState(record);
  const [date, setDate] = useState(record?.effectiveDate ?? '');
  const [category, setCategory] = useState(record?.categoryId ?? 'salud');
  const [description, setDescription] = useState(record?.description ?? '');
  const [amount, setAmount] = useState(record?.amount ?? '');
  const [subcategory, setSubcategory] = useState(record?.subcategory ?? '');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const demo = useDemoLabel();
  const [similar, setSimilar] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const persisted = usePersisted();
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    const result = await save(sessionCommand('variable-expense', period, base, { effectiveDate: date, categoryId: category,
      description, amount, subcategory, notes, allowSimilar: similar }));
    setSaving(false);
    if (result.ok) onDone(sessionResultMessage(result, persisted));
    else setError(sessionResultMessage(result, persisted));
  };
  return <form aria-label={`Gasto variable${demo ? ' de demostración' : ''}`} onSubmit={submit} className={`${cardClass} space-y-4`}>
    <h2 className="font-bold text-lg">{record ? 'Editar gasto GV' : 'Nuevo gasto GV'}{demo}</h2>
    <div><label htmlFor="gv-date" className="block font-bold text-sm mb-1">Fecha</label><input id="gv-date" type="date" min="0001-01-01" max="9999-12-31" className={fieldClass} value={date} onChange={event => setDate(event.target.value)} required /></div>
    <div><label htmlFor="gv-category" className="block font-bold text-sm mb-1">Categoría</label><select id="gv-category" className={fieldClass} value={category} onChange={event => setCategory(event.target.value)}>{FINANCIAL_RULES.variableCategories.map(item => <option key={item.id} value={item.id}>{item.name} · {item.percentage}%</option>)}</select></div>
    <div><label htmlFor="gv-subcategory" className="block font-bold text-sm mb-1">Subcategoría (opcional)</label><input id="gv-subcategory" className={fieldClass} maxLength={80} list="gv-subcategories" value={subcategory} onChange={event => setSubcategory(event.target.value)} />
      <datalist id="gv-subcategories">{suggestions.map(item => <option key={item} value={item} />)}</datalist></div>
    <div><label htmlFor="gv-description" className="block font-bold text-sm mb-1">Descripción</label><input id="gv-description" className={fieldClass} maxLength={300} value={description} onChange={event => setDescription(event.target.value)} required /></div>
    <MoneyInput id="gv-amount" label={`Importe${demo} (S/)`} value={amount} onChange={setAmount} />
    <div><label htmlFor="gv-notes" className="block font-bold text-sm mb-1">Notas (opcional)</label><input id="gv-notes" className={fieldClass} maxLength={500} value={notes} onChange={event => setNotes(event.target.value)} /></div>
    <label htmlFor="gv-similar" className="flex gap-3 items-start text-sm"><input id="gv-similar" type="checkbox" className="mt-1 shrink-0" checked={similar} onChange={event => setSimilar(event.target.checked)} />Es otro gasto distinto aunque coincidan fecha, categoría, descripción e importe.</label>
    <Help><p>Usa punto decimal. La fecha debe pertenecer al periodo seleccionado. Ningún gasto redistribuye fondos.</p></Help>
    <button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Guardando…' : `${record ? 'Actualizar gasto' : persisted ? 'Guardar gasto' : 'Registrar gasto'}${persisted ? '' : ' · sesión'}`}</button>
    {record && <button type="button" className="block underline text-sm" onClick={onCancel}>Cancelar edición</button>}
    {error && <p role="alert" className="text-sm">{error}</p>}
  </form>;
}

function VariableWorkspace({ period, summary, manage }) {
  const records = useStore(state => state.fiorellaDemoRecords);
  const persisted = usePersisted();
  const demo = useDemoLabel();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const suggestions = useMemo(() => [...new Set(records.filter(record => record.kind === 'variable-expense' && record.subcategory).map(record => record.subcategory))].sort(), [records]);
  const text = search.trim().toLocaleLowerCase('es');
  const visible = summary.variable.filter(record => (category === 'all' || record.categoryId === category)
    && (!text || [record.description, record.subcategory, record.notes].some(value => value?.toLocaleLowerCase('es').includes(text))));
  const [editing, setEditing] = useState(null);
  const [generation, setGeneration] = useState(0);
  const [feedback, setFeedback] = useState('');
  const done = message => { setFeedback(message); setEditing(null); setGeneration(value => value + 1); };
  return <>
    {summary.categories.map(category => <section key={category.id} className={`${cardClass} text-sm space-y-2`}>
      <h2 className="font-bold text-lg">{category.name} · {category.percentage}% GV</h2>
      <p>Asignado: {category.allocation === null ? 'Sin distribución' : <span className="break-all">{formatAmount(category.allocation)}</span>}</p>
      <p>{persisted ? 'Anotado' : 'Acumulado de la sesión'}: {category.executed.amount === null ? 'Sin gastos registrados' : <span className="break-all">{formatAmount(category.executed.amount)}</span>}</p>
      <Progress value={category.executed.amount ?? '0'} limit={category.allocation} label={`${category.name}: gasto frente a lo asignado`} />
      <p><Comparison budget={category.allocation} spent={category.executed.amount} /></p>
    </section>)}
    {summary.requiresRoundingDecision && <p className="text-sm">Importes exactos con fracciones de céntimo; redondeo monetario pendiente.</p>}
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    {manage ? <VariableForm key={`${editing ?? 'new'}:${generation}`} suggestions={suggestions} period={period} record={summary.variable.find(record => record.id === editing)} onDone={done} onCancel={() => done('Edición cancelada.')} /> : <ReadOnlyNotice>Tu usuario puede consultar las finanzas personales de Fiorella, pero no crear, editar ni eliminar sus registros.</ReadOnlyNotice>}
    <section className="space-y-3"><h2 className="font-bold text-lg">Gastos del periodo{demo}</h2>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="gv-filter-category" className="block font-bold text-xs mb-1">Categoría</label><select id="gv-filter-category" className={fieldClass} value={category} onChange={event => setCategory(event.target.value)}>
          <option value="all">Todas</option>{FINANCIAL_RULES.variableCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div><label htmlFor="gv-filter-text" className="block font-bold text-xs mb-1">Buscar</label><input id="gv-filter-text" type="search" className={fieldClass} value={search} onChange={event => setSearch(event.target.value)} /></div>
      </div>
      {!summary.variable.length && <p className={cardClass}>Sin gastos registrados en este periodo.</p>}
      {!!summary.variable.length && !visible.length && <p className={cardClass}>Ningún gasto coincide con el filtro.</p>}
      {[...visible].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || a.id.localeCompare(b.id)).map(record => <article key={record.id} className={`${cardClass} text-sm space-y-1`}>
        <p className="flex flex-wrap justify-between gap-2"><span className="font-bold">{record.effectiveDate} · {record.categoryId === 'salud' ? 'Salud' : 'Ocio'}{record.subcategory ? ` / ${record.subcategory}` : ''}</span><span className="font-bold break-all">{formatAmount(record.amount)}</span></p>
        <p className="break-words">{record.description}</p>
        {record.notes && <p className="break-words text-texto-light">{record.notes}</p>}
        <p className="text-xs">{persisted ? (record.provenance?.type === 'fiorella-excel' ? 'Cargado del Excel' : 'Registrado en MilFi') : 'Demostración'} · Revisión {record.revision}</p>
        {manage && <button type="button" className="underline font-bold" onClick={() => { setEditing(record.id); setFeedback(''); }}>Editar {record.description}</button>}
      </article>)}
    </section>
  </>;
}

export default function GastosGV() {
  const manage = canManage(useModuleAccess('fiorella'));
  const { input, period, summary } = useFiorellaPeriod();
  const persisted = usePersisted();
  return <div className="pb-10 space-y-5"><header className="my-6"><h1 className="text-2xl font-bold">Seguimiento GV</h1><p className="text-sm mt-2">Salud y Ocio{persisted ? '' : ' · registros de demostración'}</p></header>
    <SessionNotice /><PeriodPicker />
    <VariableWorkspace key={input} period={period} summary={summary} manage={manage} />
  </div>;
}
