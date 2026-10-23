import { useState } from 'react';
import { FIXED_CATEGORIES, FIXED_SUBCATEGORIES } from '../../domain/fiorellaCategories.js';
import { displayName } from '../../presentation/categoryLabels.js';
import { sessionCommand, sessionResultMessage, usePersisted } from '../../presentation/fiorellaSession.js';
import { fixedExpenseTotal } from '../../presentation/fixedEntry.js';
import { formatAmount, formatPeriod } from '../../presentation/format.js';
import { noticeClass } from '../../presentation/tones.js';
import { useStore } from '../../store/useStore.js';
import { buttonClass, fieldClass, MoneyInput } from '../FiorellaSession.jsx';
import { segmentClass, segmentGroupClass } from './formStyles.js';

const MODES = [['add', 'Sumar'], ['replace', 'Reemplazar']];

// A fixed expense has no date: it adds to (or replaces) the month's total of one
// subcategory in the selected month, keeping its budget exactly as it is.
export default function FixedExpenseForm({ period, summary, onDone, onCancel }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const persisted = usePersisted();
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('add');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const category = FIXED_SUBCATEGORIES.find(item => item.id === categoryId) ?? null;
  const record = summary.fixed.find(item => item.categoryId === categoryId) ?? null;
  const current = record?.actualAmount ?? null;
  const next = category ? fixedExpenseTotal(current, amount, mode) : null;
  const month = formatPeriod(period);
  const submit = async event => {
    event.preventDefault();
    if (next === null) return;
    setSaving(true); setError('');
    const result = await save(sessionCommand('fixed-budget', period, record,
      { categoryId, budgetAmount: record?.budgetAmount ?? '', actualAmount: next }));
    setSaving(false);
    if (!result.ok) { setError(sessionResultMessage(result, persisted)); return; }
    onDone(`Guardado · ${displayName(category)}: ${formatAmount(next)} en ${month}.`);
  };
  return <form aria-label="Gasto fijo" onSubmit={submit} className="space-y-4">
    <div><label htmlFor="gf-category" className="block font-bold text-sm mb-1">Subcategoría</label>
      <select id="gf-category" data-autofocus className={fieldClass} required value={categoryId} onChange={event => setCategoryId(event.target.value)}>
        <option value="">Elige una subcategoría</option>
        {FIXED_CATEGORIES.map(group => <optgroup key={group.id} label={group.name}>
          {group.children.map(item => <option key={item.id} value={item.id}>{displayName(item)}</option>)}</optgroup>)}
      </select></div>
    <MoneyInput id="gf-amount" label="Importe (S/)" value={amount} onChange={setAmount} />
    <fieldset>
      <legend className="sr-only">Cómo se registra</legend>
      <div className={segmentGroupClass}>
        {MODES.map(([id, label]) => <label key={id} htmlFor={`gf-mode-${id}`} className={segmentClass}>
          <input id={`gf-mode-${id}`} type="radio" name="gf-mode" value={id} className="sr-only" checked={mode === id}
            onChange={() => setMode(id)} />{label}</label>)}
      </div>
    </fieldset>
    <div aria-live="polite" className="space-y-1 text-sm" data-testid="fixed-preview">
      <p className="font-bold first-letter:uppercase">{mode === 'add' ? `Se suma a ${month}` : `Reemplaza el total de ${month}`}</p>
      {category && next !== null && <p className="tabular-nums">
        {displayName(category)}: {current == null ? 'sin registrar' : formatAmount(current)} → {formatAmount(next)} este mes</p>}
    </div>
    {error && <p role="alert" className={noticeClass()}>{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" className={buttonClass} disabled={saving || next === null}>{saving ? 'Guardando…' : 'Guardar'}</button>
      <button type="button" className="min-h-11 px-3 underline text-sm" onClick={onCancel}>Cancelar</button>
    </div>
  </form>;
}
