import { normalizeAmount, subtractAmounts, compareAmounts } from '../../domain/amounts.js';
import { contributionParts } from '../../domain/controlContributions.js';
import { useState } from 'react';
import { controlExplanation, controlMoney } from '../../presentation/control.js';
import { noticeClass } from '../../presentation/tones.js';
import { useLedgerStore } from '../../store/ledgerStore.js';
import { buttonClass, fieldClass } from '../FiorellaSession.jsx';
import { segmentClass, segmentGroupClass } from '../gastos/formStyles.js';
import PlanMonthField from './PlanMonthField.jsx';

const DUPLICATE = 'POSSIBLE_DUPLICATE_REQUIRES_REVIEW';
const monthOf = date => /^\d{4}-\d{2}-\d{2}$/.test(date) ? { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) } : null;
const label = (id, text) => <label htmlFor={id} className="block font-bold text-sm mb-1">{text}</label>;

function Segments({ name, legend, value, options, onChange }) {
  return <fieldset>
    <legend className="block font-bold text-sm mb-1">{legend}</legend>
    <div className={segmentGroupClass}>
      {options.map(([id, text]) => <label key={id} htmlFor={`${name}-${id}`} className={segmentClass}>
        <input id={`${name}-${id}`} type="radio" name={name} value={id} className="sr-only" checked={value === id}
          onChange={() => onChange(id)} />{text}</label>)}
    </div>
  </fieldset>;
}

// The one form to register (or edit) a Control movement. The recorder comes from
// the session, the movement's month from its date and the reference note defaults
// to "Registrado en MilFi"; a savings deposit asks which plan month it covers.
export default function MovementForm({ record, selected, onDone, onCancel }) {
  const [kind, setKind] = useState(record?.kind ?? 'deposit');
  const [purpose, setPurpose] = useState(record?.purpose ?? 'expenses');
  const [contributor, setContributor] = useState(record?.contributorId ?? null);
  const [amount, setAmount] = useState(record?.amount ?? '');
  const [currency, setCurrency] = useState(record?.currency ?? 'PEN');
  const [date, setDate] = useState(record?.effectiveDate ?? '');
  const [plan, setPlan] = useState(record?.planPeriod ?? null);
  const [assignPlan, setAssignPlan] = useState(!!record?.planPeriod);
  const [contributionType, setContributionType] = useState(record ? contributionParts(record).kind : '');
  const [extra, setExtra] = useState(record?.provenance?.contribution?.extra ?? '');
  const [description, setDescription] = useState(record?.description ?? '');
  const [note, setNote] = useState(record?.provenance?.statement && record.provenance.statement !== 'Registrado en MilFi' ? record.provenance.statement : '');
  const [distinct, setDistinct] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const totalValue = normalizeAmount(amount); const extraValue = normalizeAmount(extra);
  const regularPreview = totalValue !== null && extraValue !== null && compareAmounts(extraValue, totalValue) <= 0 ? subtractAmounts(totalValue, extraValue) : null;
  const savings = kind === 'deposit' && purpose === 'savings';
  // Until chosen, the contributor follows the workbook columns: gastos → Milton, ahorro → Fiorella.
  const who = contributor ?? (purpose === 'savings' ? 'fiorella' : 'milton');
  const submit = async event => {
    event.preventDefault();
    setSaving(true); setError('');
    let contribution;
    if (kind === 'deposit' && !['unclassified', ''].includes(contributionType)) {
      const total = normalizeAmount(amount); const extraPart = normalizeAmount(extra);
      if (contributionType === 'combined' && (total === null || extraPart === null || compareAmounts(extraPart, total) > 0)) {
        setSaving(false); setError(controlExplanation('INVALID_CONTRIBUTION_SPLIT')); return;
      }
      contribution = { version: 1, regular: contributionType === 'extraordinary' ? '0' : contributionType === 'combined' ? subtractAmounts(total, extraPart) : amount,
        extra: contributionType === 'habitual' ? '0' : contributionType === 'combined' ? extra : amount };
    }
    const result = await useLedgerStore.getState().saveEntry({ id: record?.id ?? crypto.randomUUID(), expectedRevision: record?.revision ?? 0,
      operationId: record ? undefined : crypto.randomUUID(), kind, effectiveDate: date, period: monthOf(date), currency, amount,
      contributorId: kind === 'deposit' ? who : null, purpose: kind === 'deposit' ? purpose : 'savings', planPeriod: savings && assignPlan ? plan : null, contribution,
      description, provenanceNote: note.trim() || 'Registrado en MilFi', distinctOperationReason: distinct });
    setSaving(false);
    if (result.ok) { onDone(record ? 'Movimiento actualizado, pendiente de revisión.' : 'Movimiento registrado, pendiente de revisión.'); return; }
    if (result.errors?.[0] === DUPLICATE) setDuplicate(true);
    else setError(controlExplanation(result.errors?.[0]));
  };
  return <form aria-label="Movimiento de Control" onSubmit={submit} className="space-y-4">
    <Segments name="control-kind" legend="Tipo" value={kind} onChange={setKind}
      options={[['deposit', 'Depósito'], ['withdrawal', 'Retiro']]} />
    {kind === 'deposit' && <>
      <Segments name="control-purpose" legend="Destino" value={purpose} onChange={setPurpose} options={[['expenses', 'Gastos'], ['savings', 'Ahorro']]} />
      <Segments name="control-contributor" legend="Aportante" value={who} onChange={setContributor}
        options={[['milton', 'Milton'], ['fiorella', 'Fiorella']]} />
    </>}
    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
      <div>{label('control-amount', 'Monto')}
        <input id="control-amount" data-autofocus type="text" inputMode="decimal" maxLength={100} autoComplete="off" required value={amount}
          onChange={event => { setAmount(event.target.value); setDuplicate(false); }} className={`${fieldClass} text-2xl font-bold tabular-nums`}
          placeholder="0.00" /></div>
      <div>{label('control-currency', 'Moneda')}
        <select id="control-currency" className={fieldClass} value={currency} onChange={event => setCurrency(event.target.value)}>
          <option value="PEN">PEN</option><option value="USD">USD</option></select></div>
    </div>
    <div>{label('control-date', 'Fecha')}
      <input id="control-date" type="date" min="0001-01-01" max="9999-12-31" required className={fieldClass} value={date}
        onChange={event => { setDate(event.target.value); setDuplicate(false); }} /></div>
    {kind === 'deposit' && <>
      <div>{label('control-contribution-type', 'Tipo de aporte')}
        <select id="control-contribution-type" className={fieldClass} required value={contributionType} onChange={event => setContributionType(event.target.value)}>
          <option value="">Elige el tipo de aporte</option>
          {record && !record.provenance?.contribution && <option value="unclassified">Sin clasificación histórica</option>}
          <option value="habitual">Habitual</option><option value="extraordinary">Extraordinario</option><option value="combined">Habitual + extraordinario (una transferencia)</option>
        </select></div>
      {contributionType === 'combined' && <div>{label('control-extra', 'Parte extraordinaria del importe total')}
        <input id="control-extra" inputMode="decimal" className={fieldClass} required value={extra} onChange={event => setExtra(event.target.value)} />
        <p className="text-sm" aria-live="polite">Parte habitual: {regularPreview === null ? 'completa el importe total y el extra' : controlMoney(regularPreview, currency)}. Se guarda una sola transferencia.</p></div>}
    </>}
    {savings && <>
      <label className="flex gap-2 items-center text-sm min-h-11"><input id="control-assign-plan" type="checkbox" checked={assignPlan} onChange={event => setAssignPlan(event.target.checked)} />Asignar a un mes del plan</label>
      {assignPlan && <PlanMonthField value={plan} onChange={setPlan} reference={monthOf(date) ?? selected} />}
    </>}
    {kind === 'withdrawal' && <div>{label('control-description', 'Descripción')}
      <input id="control-description" className={fieldClass} maxLength={1000} required value={description}
        onChange={event => setDescription(event.target.value)} /></div>}
    <details className="rounded-xl bg-white px-3">
      <summary className="cursor-pointer min-h-11 flex items-center font-bold text-sm">Más opciones</summary>
      <div className="space-y-3 pb-3">
        {kind === 'deposit' && <div>{label('control-description', 'Descripción')}
          <input id="control-description" className={fieldClass} maxLength={1000} value={description} placeholder="Opcional"
            onChange={event => setDescription(event.target.value)} /></div>}
        <div>{label('control-note', 'Referencia (voucher, extracto…)')}
          <input id="control-note" className={fieldClass} maxLength={500} value={note} placeholder="Opcional"
            onChange={event => setNote(event.target.value)} /></div>
      </div>
    </details>
    {duplicate && <div role="alert" className={`${noticeClass()} space-y-2`} data-testid="control-duplicate">
      <p className="font-bold">Ya hay un movimiento igual.</p>
      <div>{label('control-distinct', '¿Por qué es otro movimiento?')}
        <input id="control-distinct" className={fieldClass} maxLength={500} required value={distinct}
          onChange={event => setDistinct(event.target.value)} /></div>
    </div>}
    {error && <p role="alert" className={noticeClass()}>{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" className={buttonClass} disabled={saving}>
        {saving ? 'Guardando…' : record ? 'Guardar cambios' : 'Guardar'}</button>
      <button type="button" className="min-h-11 px-3 underline text-sm" onClick={onCancel}>Cancelar</button>
    </div>
  </form>;
}
