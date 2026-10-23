import { useEffect, useRef, useState } from 'react';
import { sessionCommand, sessionResultMessage, usePersisted } from '../../presentation/fiorellaSession.js';
import { displayName } from '../../presentation/categoryLabels.js';
import { noticeClass } from '../../presentation/tones.js';
import { useStore } from '../../store/useStore.js';
import { buttonClass, MoneyInput } from '../FiorellaSession.jsx';

// Inline editor of one GF subcategory: focus on the first field, Esc cancels,
// one submit at a time and the error stays next to the fields.
export default function BudgetEditor({ category, record, period, onCancel, onSaved, onBusy }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const [base] = useState(record);
  const [budget, setBudget] = useState(record?.budgetAmount ?? '');
  const [actual, setActual] = useState(record?.actualAmount ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const form = useRef(null);
  const persisted = usePersisted();
  const name = displayName(category);
  useEffect(() => { form.current?.querySelector('input')?.focus(); }, []);
  const submit = async event => {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setSaving(true); onBusy(true); setError(null);
    try {
      const result = await save(sessionCommand('fixed-budget', period, base, { categoryId: category.id, budgetAmount: budget, actualAmount: actual }));
      if (result.ok) onSaved(`Guardado · ${name}.${persisted ? ` ${sessionResultMessage(result, persisted)}` : ''}`);
      else setError(sessionResultMessage(result, persisted));
    } catch {
      setError(sessionResultMessage({ errors: ['PERSISTENCE_ERROR'] }, persisted));
    } finally {
      locked.current = false;
      setSaving(false); onBusy(false);
    }
  };
  const escape = event => { if (event.key === 'Escape' && !locked.current) { event.preventDefault(); onCancel(); } };
  return <form ref={form} onSubmit={submit} aria-label={`Presupuesto ${category.id}`} aria-busy={saving} onKeyDown={escape}
    className="rounded-xl bg-fondo p-3 space-y-3 my-2">
    <fieldset disabled={saving} className="space-y-3">
      <legend className="text-sm font-bold">Editar {name}</legend>
      <div className="grid grid-cols-2 gap-3">
        <MoneyInput id={`budget-${category.id}`} label="Presupuesto (S/)" value={budget} onChange={setBudget} />
        <MoneyInput id={`actual-${category.id}`} label="Gastado (S/)" value={actual} onChange={setActual} />
      </div>
      <p className="text-xs text-texto-light">En blanco queda sin registrar; 0 cuenta como gastado.</p>
      <div className="flex gap-3 items-center">
        <button type="submit" className={`${buttonClass} min-h-11`}>{saving ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="min-h-11 px-3 underline text-sm" onClick={onCancel}>Cancelar</button>
      </div>
    </fieldset>
    {saving && <p role="status" className="text-xs">Guardando…</p>}
    {error && <p role="alert" className={noticeClass()}>{error}</p>}
  </form>;
}
