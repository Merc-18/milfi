import { useState } from 'react';
import PeriodInput from './PeriodInput.jsx';
import { currentPeriodInput, parsePeriodInput } from '../presentation/format.js';
import { controlButtonClass as buttonClass, controlFieldClass as fieldClass } from '../presentation/control.js';
import { fieldLabels, resolutionMessage } from '../presentation/preimport.js';

const periodText = period => period ? `${String(period.year).padStart(4, '0')}-${String(period.month).padStart(2, '0')}` : null;

function ReviewerFields({ prefix, draft, change }) {
  return <>
    <div><label htmlFor={`${prefix}-reviewer`} className="block text-sm font-bold mb-2">Responsable declarado</label>
      <select id={`${prefix}-reviewer`} className={fieldClass} value={draft.reviewedBy} onChange={change('reviewedBy')}><option value="">Seleccionar</option><option value="milton">Milton</option><option value="fiorella">Fiorella</option></select></div>
    <div><label htmlFor={`${prefix}-reason`} className="block text-sm font-bold mb-2">Motivo de la decisión</label>
      <input id={`${prefix}-reason`} maxLength={500} className={fieldClass} value={draft.reason} onChange={change('reason')} /></div>
    <div><label htmlFor={`${prefix}-reference`} className="block text-sm font-bold mb-2">Referencia de evidencia consultada</label>
      <input id={`${prefix}-reference`} maxLength={300} className={fieldClass} value={draft.evidenceReference} onChange={change('evidenceReference')} /></div>
  </>;
}

/** Explicit resolution of ambiguous fields. Bulk only applies the same decision to same-evidence records. */
export function PreimportResolutionForm({ entry, fields, siblings, onSubmit, onCancel }) {
  const { record } = entry;
  const dateMonth = record.effectiveDate ? record.effectiveDate.slice(0, 7) : null;
  const [draft, setDraft] = useState({ field: fields[0], amount: record.amount ?? '', currency: record.currency ?? '', contributorId: record.contributorId ?? '',
    effectiveDate: record.effectiveDate ?? '', period: periodText(record.period) ?? dateMonth ?? currentPeriodInput(), purpose: record.purpose ?? '',
    acceptPeriodAssignment: false, bulk: false, reviewedBy: '', reason: '', evidenceReference: '' });
  const [periodValid, setPeriodValid] = useState(true);
  const [errors, setErrors] = useState([]);
  const change = key => event => setDraft(value => ({ ...value, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const field = draft.field;
  const crossPeriod = field === 'period' && dateMonth && draft.period !== dateMonth;
  const bulkTargets = siblings[field] ?? [];
  const submit = event => {
    event.preventDefault();
    if (field === 'period' && !periodValid) return setErrors(['INVALID_PERIOD']);
    const value = { amount: { amount: draft.amount, currency: draft.currency.trim() }, currency: draft.currency.trim(), contributorId: draft.contributorId,
      effectiveDate: draft.effectiveDate, period: parsePeriodInput(draft.period), purpose: draft.purpose, distinct: null }[field];
    const result = onSubmit({ field, value, acceptPeriodAssignment: draft.acceptPeriodAssignment,
      recordIds: [record.id, ...(draft.bulk ? bulkTargets.map(item => item.record.id) : [])],
      reviewedBy: draft.reviewedBy, reason: draft.reason, evidenceReference: draft.evidenceReference });
    setErrors(result.errors ?? []);
  };
  return <form aria-label="Resolver campo de preimportación" onSubmit={submit} className="space-y-4 rounded-2xl border border-secundario p-4">
    <h3 className="font-bold">Resolver un campo de esta operación</h3>
    <p className="text-sm">Tu decisión queda registrada con responsable, motivo y referencia, vinculada a la evidencia del Excel. Si la operación o su evidencia cambian, deja de valer.</p>
    <div><label htmlFor="preimport-field" className="block text-sm font-bold mb-2">Campo</label>
      <select id="preimport-field" className={fieldClass} value={field} onChange={change('field')}>{fields.map(item => <option key={item} value={item}>{fieldLabels[item]}</option>)}</select></div>
    {(field === 'amount') && <div><label htmlFor="preimport-amount" className="block text-sm font-bold mb-2">Importe interpretado</label>
      <input id="preimport-amount" inputMode="decimal" maxLength={100} className={fieldClass} value={draft.amount} onChange={change('amount')} placeholder="Sin símbolos, punto decimal" /></div>}
    {(field === 'amount' || field === 'currency') && <div><label htmlFor="preimport-currency" className="block text-sm font-bold mb-2">Moneda explícita (código ISO)</label>
      <input id="preimport-currency" maxLength={3} className={fieldClass} value={draft.currency} onChange={change('currency')} placeholder="PEN, USD…" />
      <p className="text-xs mt-1">El Excel no indica moneda. Nada se asume por defecto.</p></div>}
    {field === 'contributorId' && <div><label htmlFor="preimport-contributor" className="block text-sm font-bold mb-2">Aportante</label>
      <select id="preimport-contributor" className={fieldClass} value={draft.contributorId} onChange={change('contributorId')}><option value="">Seleccionar</option><option value="milton">Milton</option><option value="fiorella">Fiorella</option></select></div>}
    {field === 'effectiveDate' && <div><label htmlFor="preimport-date" className="block text-sm font-bold mb-2">Fecha de la operación</label>
      <input id="preimport-date" type="date" min="0001-01-01" max="9999-12-31" className={fieldClass} value={draft.effectiveDate} onChange={change('effectiveDate')} /></div>}
    {field === 'period' && <PeriodInput id="preimport-period" label="Periodo de imputación" applied={draft.period} className={fieldClass}
      onValidChange={value => setDraft(previous => ({ ...previous, period: value }))} onDraftValidity={setPeriodValid} />}
    {crossPeriod && <div className="flex gap-3 items-start text-sm"><input id="preimport-cross-period" type="checkbox" className="mt-1 shrink-0" checked={draft.acceptPeriodAssignment} onChange={change('acceptPeriodAssignment')} />
      <label htmlFor="preimport-cross-period">La fecha es de otro mes. He revisado explícitamente esta imputación para esta operación concreta.</label></div>}
    {field === 'purpose' && <div><label htmlFor="preimport-purpose" className="block text-sm font-bold mb-2">Destino del dinero</label>
      <select id="preimport-purpose" className={fieldClass} value={draft.purpose} onChange={change('purpose')}><option value="">Seleccionar</option><option value="expenses">Gastos</option><option value="savings">Ahorro</option></select></div>}
    {field === 'distinct' && <p className="text-sm">Confirmas que esta operación es distinta de las coincidentes. No se fusionan ni se eliminan registros.</p>}
    {!!bulkTargets.length && <div className="flex gap-3 items-start text-sm"><input id="preimport-bulk" type="checkbox" className="mt-1 shrink-0" checked={draft.bulk} onChange={change('bulk')} />
      <label htmlFor="preimport-bulk">Aplicar la misma decisión a {bulkTargets.length} movimiento(s) pendiente(s) con la misma evidencia de origen. Cada uno recibe su propia revisión.</label></div>}
    <ReviewerFields prefix="preimport-resolution" draft={draft} change={change} />
    {!!errors.length && <div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">{errors.map(error => <p key={error}>{resolutionMessage(error)}</p>)}</div>}
    <div className="flex flex-wrap gap-3"><button type="submit" className={buttonClass}>Registrar resolución</button><button type="button" className={buttonClass} onClick={onCancel}>Cancelar</button></div>
  </form>;
}

export function PreimportDecisionForm({ decision, onSubmit, onCancel }) {
  const [draft, setDraft] = useState({ reviewedBy: '', reason: '', evidenceReference: '' });
  const [errors, setErrors] = useState([]);
  const change = key => event => setDraft(value => ({ ...value, [key]: event.target.value }));
  const label = decision === 'prepared' ? 'Preparar para importación futura' : 'Rechazar movimiento';
  return <form aria-label={label} className="space-y-4 rounded-2xl border border-secundario p-4" onSubmit={event => {
    event.preventDefault();
    setErrors(onSubmit({ decision, ...draft }).errors ?? []);
  }}>
    <h3 className="font-bold">{label}</h3>
    <p className="text-sm">{decision === 'prepared' ? 'No confirma dinero ni escribe en el historial real: solo deja la operación lista para una importación futura.' : 'El movimiento se conserva rechazado en esta sesión, con su evidencia original.'}</p>
    <ReviewerFields prefix="preimport-decision" draft={draft} change={change} />
    {!!errors.length && <div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">{errors.map(error => <p key={error}>{resolutionMessage(error)}</p>)}</div>}
    <div className="flex flex-wrap gap-3"><button type="submit" className={buttonClass}>{label}</button><button type="button" className={buttonClass} onClick={onCancel}>Cancelar</button></div>
  </form>;
}
