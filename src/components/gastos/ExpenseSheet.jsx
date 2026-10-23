import { useEffect, useRef, useState } from 'react';
import { FINANCIAL_RULES } from '../../domain/financialRules.js';
import { sessionCommand, sessionResultMessage, usePersisted } from '../../presentation/fiorellaSession.js';
import { formatPeriod, todayInLima } from '../../presentation/format.js';
import { noticeClass } from '../../presentation/tones.js';
import { usePeriodStore } from '../../store/periodStore.js';
import { useStore } from '../../store/useStore.js';
import { buttonClass, fieldClass } from '../FiorellaSession.jsx';
import Sheet from '../ui/Sheet.jsx';

const DUPLICATE = 'POSSIBLE_DUPLICATE_EXPENSE';
const periodOfDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) ? { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) } : null;
const keyOf = period => `${period.year}-${String(period.month).padStart(2, '0')}`;
const label = (id, text) => <label htmlFor={id} className="block font-bold text-sm mb-1">{text}</label>;
const segmentClass = 'flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-4 text-sm has-[:checked]:bg-texto has-[:checked]:font-bold'
  + ' has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-texto';

function ExpenseForm({ input, period, record, suggestions, onDone, onCancel }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const select = usePeriodStore(state => state.selectPeriod);
  const persisted = usePersisted();
  const today = todayInLima();
  const [base] = useState(record);
  const [amount, setAmount] = useState(record?.amount ?? '');
  const [category, setCategory] = useState(record?.categoryId ?? 'salud');
  const [description, setDescription] = useState(record?.description ?? '');
  const [date, setDate] = useState(record?.effectiveDate ?? (today.startsWith(input) ? today : ''));
  const [subcategory, setSubcategory] = useState(record?.subcategory ?? '');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [duplicate, setDuplicate] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const retry = useRef(null);
  // The warning may sit below the fold of the sheet: bring its action into view.
  useEffect(() => { if (duplicate) retry.current?.focus(); }, [duplicate]);
  // Any change after a duplicate warning asks again from scratch.
  const edit = setter => value => { setter(value); setDuplicate(false); };
  const send = async allowSimilar => {
    // A new expense belongs to the month of its own date; an edit keeps its month.
    const target = record ? period : periodOfDate(date) ?? period;
    setSaving(true); setError('');
    const result = await save(sessionCommand('variable-expense', target, base, { effectiveDate: date, categoryId: category,
      description, amount, subcategory, notes, allowSimilar }));
    setSaving(false);
    if (!result.ok) {
      if (result.errors?.[0] === DUPLICATE) setDuplicate(true);
      else setError(sessionResultMessage(result, persisted));
      return;
    }
    const moved = keyOf(target) !== input;
    const where = moved ? ` en ${formatPeriod(target)}` : '';
    onDone(`${record ? 'Gasto actualizado' : 'Gasto guardado'}${where}.${persisted ? ` ${sessionResultMessage(result, persisted)}` : ''}`);
    if (moved) select(keyOf(target));
  };
  const origin = record?.provenance?.type === 'fiorella-excel' ? 'Cargado del Excel. ' : 'Registrado en MilFi. ';
  const source = !record ? null : `${persisted ? origin : ''}Revisión ${record.revision}.`;
  return <form aria-label="Gasto variable" onSubmit={event => { event.preventDefault(); send(false); }} className="space-y-4">
    <div>{label('gv-amount', 'Importe (S/)')}
      <input id="gv-amount" data-autofocus type="text" inputMode="decimal" maxLength={100} autoComplete="off" required value={amount}
        onChange={event => edit(setAmount)(event.target.value)} className={`${fieldClass} text-3xl font-bold tabular-nums`} placeholder="0.00" /></div>
    <fieldset>
      <legend className="block font-bold text-sm mb-1">Categoría</legend>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-white p-1 shadow-soft">
        {FINANCIAL_RULES.variableCategories.map(item => <label key={item.id} htmlFor={`gv-category-${item.id}`} className={segmentClass}>
          <input id={`gv-category-${item.id}`} type="radio" name="gv-category" value={item.id} className="sr-only" checked={category === item.id}
            onChange={() => edit(setCategory)(item.id)} />{item.name}</label>)}
      </div>
    </fieldset>
    <div>{label('gv-description', 'Descripción')}
      <input id="gv-description" className={fieldClass} maxLength={300} required value={description}
        onChange={event => edit(setDescription)(event.target.value)} /></div>
    <div>{label('gv-date', 'Fecha')}
      <input id="gv-date" type="date" min="0001-01-01" max="9999-12-31" className={fieldClass} required value={date}
        onChange={event => edit(setDate)(event.target.value)} /></div>
    <details open={!!(record?.subcategory || record?.notes)} className="rounded-xl bg-white px-3">
      <summary className="cursor-pointer min-h-11 flex items-center font-bold text-sm">Más opciones</summary>
      <div className="space-y-3 pb-3">
        <div>{label('gv-subcategory', 'Subcategoría')}
          <input id="gv-subcategory" className={fieldClass} maxLength={80} list="gv-subcategories" value={subcategory} placeholder="Opcional"
            onChange={event => setSubcategory(event.target.value)} />
          <datalist id="gv-subcategories">{suggestions.map(item => <option key={item} value={item} />)}</datalist></div>
        <div>{label('gv-notes', 'Notas')}
          <input id="gv-notes" className={fieldClass} maxLength={500} value={notes} placeholder="Opcional"
            onChange={event => setNotes(event.target.value)} /></div>
      </div>
    </details>
    {duplicate && <div role="alert" className={`${noticeClass()} space-y-2`} data-testid="duplicate-warning">
      <p className="font-bold">Ya hay un gasto igual ese día.</p>
      <button ref={retry} type="button" className={buttonClass} disabled={saving} onClick={() => send(true)}>Guardar de todas formas</button>
    </div>}
    {error && <p role="alert" className={noticeClass()}>{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Guardando…' : record ? 'Guardar cambios' : 'Guardar'}</button>
      <button type="button" className="min-h-11 px-3 underline text-sm" onClick={onCancel}>Cancelar</button>
    </div>
    {source && <p className="text-xs text-texto-light" data-testid="expense-source">{source}</p>}
  </form>;
}

// New or edited variable expense in a sheet.
export default function ExpenseSheet({ open, record, input, period, suggestions, onDone, onClose }) {
  return <Sheet open={open} onClose={onClose} title={record ? 'Editar gasto' : 'Registrar gasto'}>
    <ExpenseForm key={record?.id ?? 'new'} input={input} period={period} record={record} suggestions={suggestions} onDone={onDone} onCancel={onClose} />
  </Sheet>;
}
