import { useState } from 'react';
import { controlExplanation } from '../../presentation/control.js';
import { assignmentText, movementMonth } from '../../presentation/controlLedgerView.js';
import { formatPeriod, plural } from '../../presentation/format.js';
import { noticeClass } from '../../presentation/tones.js';
import { useLedgerStore } from '../../store/ledgerStore.js';
import { buttonClass } from '../FiorellaSession.jsx';
import PlanMonthField from './PlanMonthField.jsx';

const save = (record, planPeriod) => useLedgerStore.getState().assignPlan({ id: record.id, expectedRevision: record.revision, planPeriod });
const reason = result => controlExplanation(result.errors?.[0]);

// One deposit: the suggested plan (R − 1) is shown and preselected, but nothing
// is saved until "Confirmar asignación".
function Single({ item, onDone }) {
  const { record } = item.entry;
  const [plan, setPlan] = useState(item.plan?.period ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const confirm = async () => {
    setSaving(true); setError('');
    const result = await save(record, plan);
    setSaving(false);
    if (result.ok) onDone(`Asignado al plan de ${formatPeriod(plan)}.`); else setError(reason(result));
  };
  return <div className="space-y-3" data-testid="assign-single">
    <p className="font-bold tabular-nums">{assignmentText(item)}</p>
    <PlanMonthField id="assign-plan" value={plan} onChange={setPlan} reference={movementMonth(record)} />
    {error && <p role="alert" className={noticeClass()}>{error}</p>}
    <button type="button" className={buttonClass} disabled={!plan || saving} onClick={confirm}>Confirmar asignación</button>
  </div>;
}

// Several deposits, each to its suggested plan. Only exact matches start
// checked; every box can be unchecked. Saved one by one; each failure is listed.
function Batch({ items, onDone }) {
  const [checked, setChecked] = useState(() => new Set(items.filter(item => item.plan?.exact).map(item => item.entry.record.id)));
  const [failures, setFailures] = useState([]);
  const [saved, setSaved] = useState(0);
  const [saving, setSaving] = useState(false);
  const toggle = id => setChecked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const confirm = async () => {
    setSaving(true);
    const failed = []; let ok = 0;
    for (const item of items.filter(candidate => checked.has(candidate.entry.record.id))) {
      const result = await save(item.entry.record, item.plan.period);
      if (result.ok) ok += 1; else failed.push({ item, reason: reason(result) });
    }
    setSaving(false);
    if (!failed.length) { onDone(`${plural(ok, 'asignación guardada', 'asignaciones guardadas')}.`); return; }
    setSaved(value => value + ok); setFailures(failed);
    setChecked(new Set(failed.map(failure => failure.item.entry.record.id)));
  };
  const pending = failures.length ? failures.map(failure => failure.item) : items;
  return <div className="space-y-3" data-testid="assign-batch">
    {!!failures.length && <div role="alert" className={noticeClass()}>
      <p className="font-bold">{plural(saved, 'asignación guardada', 'asignaciones guardadas')}. No se pudo asignar:</p>
      <ul className="list-disc pl-5">{failures.map(({ item, reason: text }) => <li key={item.entry.record.id}
        data-assign-failure={item.entry.record.id}>{assignmentText(item)}: {text}</li>)}</ul></div>}
    <ul className="space-y-2">{pending.map(item => <li key={item.entry.record.id}>
      <label className="flex items-start gap-3 min-h-11 text-sm tabular-nums">
        <input type="checkbox" className="mt-1 shrink-0" data-assign-check={item.entry.record.id}
          checked={checked.has(item.entry.record.id)} onChange={() => toggle(item.entry.record.id)} />
        <span>{assignmentText(item)}{item.entry.record.description
          && <span className="block text-xs text-texto-light">{item.entry.record.description}</span>}</span></label>
    </li>)}</ul>
    <button type="button" className={buttonClass} disabled={!checked.size || saving} onClick={confirm}>
      Confirmar {plural(checked.size, 'asignación', 'asignaciones')}</button>
  </div>;
}

export default function AssignForm({ items, mode, onDone }) {
  return mode === 'batch' ? <Batch items={items} onDone={onDone} /> : <Single item={items[0]} onDone={onDone} />;
}
