import { useState } from 'react';
import { periodDraftState } from '../presentation/periodDraft.js';
import { formatPeriod, parsePeriodInput } from '../presentation/format.js';

// Let the browser own intermediate native month segments. A controlled value
// would overwrite partial year/month edits; Firefox's text fallback works too.
export default function PeriodInput({ id, label, applied, onValidChange, onDraftValidity, className, labelClassName = 'block font-bold text-sm mb-2' }) {
  const [initial] = useState(applied);
  const [error, setError] = useState(false);
  const change = (value, blurred) => {
    const draft = periodDraftState(value, applied, blurred);
    setError(draft.showError);
    onDraftValidity?.(draft.valid);
    if (draft.valid && value !== applied) onValidChange(value);
  };
  return <div>
    <label htmlFor={id} className={labelClassName}>{label}</label>
    <input id={id} type="month" min="0001-01" max="9999-12" placeholder="AAAA-MM" defaultValue={initial}
      className={className} aria-describedby={`${id}-applied`} aria-invalid={error}
      onChange={event => change(event.currentTarget.value, false)} onBlur={event => change(event.currentTarget.value, true)} />
    <p id={`${id}-applied`} className="sr-only">Periodo aplicado: {formatPeriod(parsePeriodInput(applied))}. Solo cambia al completar un mes y año válidos.</p>
    {error && <p role="alert" className="text-sm mt-2">Completa el periodo con formato AAAA-MM. Se mantiene el periodo aplicado.</p>}
  </div>;
}
