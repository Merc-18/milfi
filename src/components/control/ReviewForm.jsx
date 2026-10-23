import { useState } from 'react';
import { controlExplanation, personName } from '../../presentation/control.js';
import { formatPeriod } from '../../presentation/format.js';
import { noticeClass } from '../../presentation/tones.js';
import { useLedgerStore } from '../../store/ledgerStore.js';
import { buttonClass, fieldClass } from '../FiorellaSession.jsx';
import { segmentClass, segmentGroupClass } from '../gastos/formStyles.js';
import PlanMonthField from './PlanMonthField.jsx';

const label = (id, text) => <label htmlFor={id} className="block font-bold text-sm mb-1">{text}</label>;
const toInput = period => period ? `${String(period.year).padStart(4, '0')}-${String(period.month).padStart(2, '0')}` : '';
const fromInput = value => { const match = /^(\d{4})-(\d{2})$/.exec(value); return match ? { year: Number(match[1]), month: Number(match[2]) } : null; };
const monthOf = date => /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) } : null;
const same = (a, b) => !!a && !!b && a.year === b.year && a.month === b.month;

// Plan month of a savings deposit: an allocation, saved on its own (no review needed).
function PlanPart({ record, onDone }) {
  const [plan, setPlan] = useState(record.planPeriod ?? null);
  const [error, setError] = useState('');
  const save = async () => {
    const result = await useLedgerStore.getState().assignPlan({ id: record.id, expectedRevision: record.revision, planPeriod: plan });
    if (result.ok) onDone(`Mes del plan: ${formatPeriod(plan)}.`); else setError(controlExplanation(result.errors?.[0]));
  };
  return <section className="space-y-3 rounded-xl bg-white p-3" aria-label="Mes del plan">
    <PlanMonthField id="review-plan" value={plan} onChange={setPlan} reference={record.period ?? monthOf(record.effectiveDate)} />
    {error && <p role="alert" className={noticeClass()}>{error}</p>}
    <button type="button" className={buttonClass} disabled={!plan} onClick={save}>Guardar mes del plan</button>
  </section>;
}

// Resolve a movement: correct what is missing (workbook rows) and accept, or reject with a reason.
function DecisionPart({ entry, suggestion, onDone }) {
  const { record } = entry;
  const excel = record.provenance?.type === 'control-excel';
  const [decision, setDecision] = useState('accepted');
  const [amount, setAmount] = useState(record.amount ?? suggestion.amount ?? '');
  const [currency, setCurrency] = useState(record.currency ?? suggestion.currency ?? '');
  const [period, setPeriod] = useState(record.period ?? suggestion.period ?? null);
  const [date, setDate] = useState(record.effectiveDate ?? '');
  const [contributor, setContributor] = useState(record.contributorId ?? '');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [assignment, setAssignment] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const needs = { amount: record.amount === null, currency: record.currency === null, period: !record.period,
    contributor: record.kind === 'deposit' && record.contributorId === null, date: record.kind === 'withdrawal' && !record.effectiveDate };
  const crossMonth = date && period && !same(monthOf(date), period);
  const submit = async event => {
    event.preventDefault();
    setSaving(true); setError('');
    const fields = [needs.amount && ['amount', amount], needs.currency && ['currency', currency], needs.period && ['period', period],
      needs.contributor && ['contributorId', contributor], needs.date && ['effectiveDate', date]];
    const corrections = !excel || decision === 'rejected' ? undefined : Object.fromEntries(fields.filter(Boolean));
    const draft = { id: record.id, expectedRevision: record.revision, decision, acceptPeriodAssignment: assignment,
      reason: decision === 'accepted' ? 'Datos comprobados en MilFi' : reason, evidenceReference: decision === 'accepted' ? reference : 'Rechazado en MilFi' };
    const store = useLedgerStore.getState();
    const result = excel ? await store.reviewImported({ ...draft, corrections }) : await store.review(draft);
    setSaving(false);
    if (result.ok) onDone(decision === 'accepted' ? 'Movimiento revisado.' : 'Movimiento rechazado.');
    else setError(result.errors?.map(controlExplanation).join(' ') ?? controlExplanation());
  };
  return <form aria-label="Revisar movimiento" onSubmit={submit} className="space-y-3">
    <fieldset>
      <legend className="sr-only">Decisión</legend>
      <div className={segmentGroupClass}>
        {[['accepted', 'Corregir y aceptar'], ['rejected', 'Rechazar']].map(([id, text]) => <label key={id} htmlFor={`review-${id}`}
          className={segmentClass}><input id={`review-${id}`} type="radio" name="review-decision" className="sr-only" checked={decision === id}
            onChange={() => setDecision(id)} />{text}</label>)}
      </div>
    </fieldset>
    {decision === 'accepted' && excel && <div className="space-y-3">
      {needs.amount && <div>{label('review-amount', 'Monto')}
        <input id="review-amount" inputMode="decimal" required className={fieldClass} value={amount}
          onChange={event => setAmount(event.target.value)} /></div>}
      {needs.currency && <div>{label('review-currency', 'Moneda')}
        <select id="review-currency" required className={fieldClass} value={currency} onChange={event => setCurrency(event.target.value)}>
          <option value="">Elige la moneda</option><option value="PEN">PEN</option><option value="USD">USD</option></select></div>}
      {needs.date && <div>{label('review-date', 'Fecha del retiro')}
        <input id="review-date" type="date" min="0001-01-01" max="9999-12-31" required className={fieldClass} value={date}
          onChange={event => setDate(event.target.value)} /></div>}
      {needs.period && <div>{label('review-period', 'Mes')}
        <input id="review-period" type="month" required className={fieldClass} value={toInput(period)}
          onChange={event => setPeriod(fromInput(event.target.value))} /></div>}
      {needs.contributor && <div>{label('review-contributor', 'Aportante')}
        <select id="review-contributor" required className={fieldClass} value={contributor} onChange={event => setContributor(event.target.value)}>
          <option value="">Elige quién aportó</option>{['milton', 'fiorella'].map(id => <option key={id} value={id}>{personName(id)}</option>)}</select></div>}
    </div>}
    {decision === 'accepted' && crossMonth && <label htmlFor="review-assignment" className="flex gap-3 items-start text-sm">
      <input id="review-assignment" type="checkbox" className="mt-1 shrink-0" checked={assignment} onChange={event => setAssignment(event.target.checked)} />
      Confirmo que corresponde a {formatPeriod(period)} aunque su fecha sea de otro mes.</label>}
    {decision === 'accepted' ? <div>{label('review-reference', '¿Dónde lo comprobaste?')}
      <input id="review-reference" required maxLength={500} className={fieldClass} value={reference} placeholder="Voucher, extracto, mensaje…"
        onChange={event => setReference(event.target.value)} /></div>
      : <div>{label('review-reason', 'Motivo del rechazo')}
        <input id="review-reason" required maxLength={1000} className={fieldClass} value={reason} onChange={event => setReason(event.target.value)} /></div>}
    {error && <p role="alert" className={noticeClass()}>{error}</p>}
    <button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Guardando…' : decision === 'accepted' ? 'Aceptar' : 'Rechazar'}</button>
  </form>;
}

export default function ReviewForm({ item, onDone }) {
  const { entry, reasons, suggestion } = item;
  const { record } = entry;
  const needsPlan = record.kind === 'deposit' && record.purpose === 'savings';
  return <div className="space-y-4" data-testid="review-form">
    <ul className="list-disc pl-5 text-sm">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    {entry.status === 'pending' && <DecisionPart entry={entry} suggestion={suggestion} onDone={onDone} />}
    {needsPlan && entry.status !== 'rejected' && <PlanPart record={record} onDone={onDone} />}
  </div>;
}
