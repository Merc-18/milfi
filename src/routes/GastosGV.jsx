import { sessionCommand, sessionResultMessage, useFiorellaPeriod } from '../presentation/fiorellaSession.js';
import { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { formatAmount } from '../presentation/format.js';
import { buttonClass, cardClass, Comparison, fieldClass, MoneyInput, PeriodPicker, SessionNotice } from '../components/FiorellaSession.jsx';

function VariableForm({ period, record, onDone, onCancel }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const [base] = useState(record);
  const [date, setDate] = useState(record?.effectiveDate ?? '');
  const [category, setCategory] = useState(record?.categoryId ?? 'salud');
  const [description, setDescription] = useState(record?.description ?? '');
  const [amount, setAmount] = useState(record?.amount ?? '');
  const [similar, setSimilar] = useState(false);
  const [error, setError] = useState('');
  const submit = event => {
    event.preventDefault();
    const result = save(sessionCommand('variable-expense', period, base, { effectiveDate: date, categoryId: category,
      description, amount, allowSimilar: similar }));
    if (result.ok) onDone(sessionResultMessage(result));
    else setError(sessionResultMessage(result));
  };
  return <form aria-label="Gasto variable de demostración" onSubmit={submit} className={`${cardClass} space-y-4`}>
    <h2 className="font-bold text-lg">{record ? 'Editar gasto GV' : 'Nuevo gasto GV'} · demo</h2>
    <div><label htmlFor="gv-date" className="block font-bold text-sm mb-1">Fecha</label><input id="gv-date" type="date" min="0001-01-01" max="9999-12-31" className={fieldClass} value={date} onChange={event => setDate(event.target.value)} required /></div>
    <div><label htmlFor="gv-category" className="block font-bold text-sm mb-1">Categoría</label><select id="gv-category" className={fieldClass} value={category} onChange={event => setCategory(event.target.value)}>{FINANCIAL_RULES.variableCategories.map(item => <option key={item.id} value={item.id}>{item.name} · {item.percentage}%</option>)}</select></div>
    <div><label htmlFor="gv-description" className="block font-bold text-sm mb-1">Descripción</label><input id="gv-description" className={fieldClass} maxLength={300} value={description} onChange={event => setDescription(event.target.value)} required /></div>
    <MoneyInput id="gv-amount" label="Importe · demo (S/)" value={amount} onChange={setAmount} />
    <label htmlFor="gv-similar" className="flex gap-3 items-start text-sm"><input id="gv-similar" type="checkbox" className="mt-1 shrink-0" checked={similar} onChange={event => setSimilar(event.target.checked)} />Es otro gasto distinto aunque coincidan fecha, categoría, descripción e importe.</label>
    <p className="text-sm">Usa punto decimal. La fecha debe pertenecer al periodo seleccionado. Ningún gasto redistribuye fondos.</p>
    <button type="submit" className={buttonClass}>{record ? 'Actualizar gasto' : 'Registrar gasto'} · sesión</button>
    {record && <button type="button" className="block underline text-sm" onClick={onCancel}>Cancelar edición</button>}
    {error && <p role="alert" className="text-sm">{error}</p>}
  </form>;
}

function VariableWorkspace({ period, summary }) {
  const [editing, setEditing] = useState(null);
  const [generation, setGeneration] = useState(0);
  const [feedback, setFeedback] = useState('');
  const done = message => { setFeedback(message); setEditing(null); setGeneration(value => value + 1); };
  return <>
    {summary.categories.map(category => <section key={category.id} className={`${cardClass} text-sm space-y-2`}>
      <h2 className="font-bold text-lg">{category.name} · {category.percentage}% GV</h2>
      <p>Distribución calculada: {category.allocation === null ? 'Sin distribución' : <span className="break-all">{formatAmount(category.allocation)}</span>}</p>
      <p>Acumulado de la sesión: {category.executed.amount === null ? 'Sin gastos registrados' : <span className="break-all">{formatAmount(category.executed.amount)}</span>}</p>
      <p><Comparison budget={category.allocation} spent={category.executed.amount} /></p>
    </section>)}
    {summary.requiresRoundingDecision && <p className="text-sm">Importes exactos con fracciones de céntimo; redondeo monetario pendiente.</p>}
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    <VariableForm key={`${editing ?? 'new'}:${generation}`} period={period} record={summary.variable.find(record => record.id === editing)} onDone={done} onCancel={() => done('Edición cancelada.')} />
    <section className="space-y-3"><h2 className="font-bold text-lg">Gastos del periodo · demo</h2>
      {!summary.variable.length && <p className={cardClass}>Sin gastos registrados en este periodo.</p>}
      {[...summary.variable].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || a.id.localeCompare(b.id)).map(record => <article key={record.id} className={`${cardClass} text-sm space-y-2`}>
        <p className="font-bold">{record.effectiveDate} · {record.categoryId === 'salud' ? 'Salud' : 'Ocio'}</p>
        <p className="break-words">{record.description}</p><p className="font-bold break-all">{formatAmount(record.amount)}</p>
        <p>Demostración · Revisión {record.revision}</p>
        <button type="button" className="underline font-bold" onClick={() => { setEditing(record.id); setFeedback(''); }}>Editar {record.description}</button>
      </article>)}
    </section>
  </>;
}

export default function GastosGV() {
  const { input, period, summary } = useFiorellaPeriod();
  return <div className="pb-10 space-y-5"><header className="my-6"><h1 className="text-2xl font-bold">Seguimiento GV</h1><p className="text-sm mt-2">Salud y Ocio · registros de demostración</p></header>
    <SessionNotice /><PeriodPicker />
    <VariableWorkspace key={input} period={period} summary={summary} />
  </div>;
}
