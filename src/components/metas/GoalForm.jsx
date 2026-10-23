import { useState } from 'react';
import { estimateSavingsGoal } from '../../domain/savingsPlanning.js';
import { sessionResultMessage, usePersisted } from '../../presentation/fiorellaSession.js';
import { formatAmount } from '../../presentation/format.js';
import { ceilCents, monthsToReach } from '../../presentation/goalPlan.js';
import { noticeClass } from '../../presentation/tones.js';
import { normalizeAmount } from '../../domain/amounts.js';
import { useStore } from '../../store/useStore.js';
import { buttonClass, fieldClass, MoneyInput } from '../FiorellaSession.jsx';

const MESSAGES = {
  INVALID_TARGET: 'El objetivo debe ser un importe positivo, con punto decimal y sin símbolos.',
  INVALID_MONTH_COUNT: 'Indica una cantidad entera y positiva de meses.',
  INVALID_GOAL_ID_OR_TITLE: 'Ponle un nombre de hasta 120 caracteres.',
};
const PERSISTENCE = new Set(['STALE_REVISION', 'DUPLICATE', 'FORBIDDEN', 'CONSTRAINT_VIOLATION', 'SESSION_EXPIRED', 'NOT_FOUND_OR_FORBIDDEN',
  'NOT_CONNECTED', 'PERSISTENCE_ERROR']);

// Months are required by the domain; with a capacity they start as M ("Con tu plan,
// unos M meses") until the person types their own value, which is then kept.
export default function GoalForm({ record, capacity, onDone, onCancel }) {
  const save = useStore(state => state.saveSavingsGoal);
  const persisted = usePersisted();
  const [base] = useState(record);
  const [title, setTitle] = useState(record?.title ?? '');
  const [target, setTarget] = useState(record?.target ?? '');
  const [months, setMonths] = useState(record?.months ?? '');
  const [touched, setTouched] = useState(!!record);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const amount = normalizeAmount(target);
  const suggested = amount && capacity ? monthsToReach(amount, capacity) : null;
  const effective = touched || !suggested ? months : String(suggested);
  const estimate = estimateSavingsGoal({ target, months: effective });
  const needed = estimate.status === 'estimated'
    ? ceilCents(estimate.monthlyContribution.numerator, estimate.monthlyContribution.denominator) : null;
  const submit = async event => {
    event.preventDefault();
    setSaving(true); setError('');
    const result = await save({ id: base?.id ?? crypto.randomUUID(), expectedRevision: base?.revision ?? 0, title, target, months: effective,
      occurredAt: new Date().toISOString() });
    setSaving(false);
    if (result.ok) onDone(result.unchanged ? 'La meta no cambió.' : base ? 'Meta actualizada.' : 'Meta guardada.');
    else setError(MESSAGES[result.errors?.[0]] ?? (PERSISTENCE.has(result.errors?.[0]) ? sessionResultMessage(result, persisted)
      : 'Revisa nombre, objetivo y meses. No se guardó nada.'));
  };
  return <form aria-label="Meta de ahorro" onSubmit={submit} className="space-y-4">
    <div><label htmlFor="goal-title" className="block text-sm font-bold mb-1">Nombre</label>
      <input id="goal-title" data-autofocus className={fieldClass} value={title} maxLength={120} required
        onChange={event => setTitle(event.target.value)} /></div>
    <MoneyInput id="goal-target" label="Objetivo (S/)" value={target} onChange={setTarget} />
    <div><label htmlFor="goal-months" className="block text-sm font-bold mb-1">¿En cuántos meses?</label>
      <input id="goal-months" type="text" inputMode="numeric" maxLength={16} required className={fieldClass} value={effective}
        aria-describedby={suggested ? 'goal-months-help' : undefined} onChange={event => { setTouched(true); setMonths(event.target.value); }} />
      {suggested && <p id="goal-months-help" className="text-xs text-texto-light mt-1">
        Con tu plan, unos {suggested} {suggested === 1 ? 'mes' : 'meses'}</p>}</div>
    <p className="text-sm font-bold min-h-5" aria-live="polite" data-testid="goal-preview">{needed && `Necesitas ${formatAmount(needed)} al mes`
      + (suggested ? `; llegas en unos ${suggested} ${suggested === 1 ? 'mes' : 'meses'}` : '')}</p>
    {estimate.status === 'invalid' && (target || effective) && <p className="text-xs">{MESSAGES[estimate.reason]}</p>}
    {error && <p role="alert" className={noticeClass()}>{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" className={buttonClass} disabled={saving || estimate.status !== 'estimated'}>
        {saving ? 'Guardando…' : record ? 'Guardar cambios' : 'Guardar'}</button>
      <button type="button" className="min-h-11 px-3 underline text-sm" onClick={onCancel}>Cancelar</button>
    </div>
  </form>;
}
