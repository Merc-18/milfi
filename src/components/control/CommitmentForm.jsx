import { useState } from 'react';
import { useLedgerStore } from '../../store/ledgerStore.js';
import { buttonClass, fieldClass } from '../FiorellaSession.jsx';
import { formatPeriod } from '../../presentation/format.js';
import { controlExplanation } from '../../presentation/control.js';

const labelClass = 'block text-sm font-bold';
const DUPLICATE_TEXT = 'Ya existe un compromiso para esta persona, moneda, destino y periodo. Se conserva el acuerdo guardado.';
const CHOICES = [
  ['commitment-person', 'Aportante', 'who', [['milton', 'Milton'], ['fiorella', 'Fiorella']]],
  ['commitment-currency', 'Moneda', 'currency', [['PEN', 'Soles'], ['USD', 'Dólares']]],
  ['commitment-purpose', 'Destino', 'purpose', [['expenses', 'Gastos'], ['savings', 'Ahorro']]],
];

// An explicit agreement for one receipt month; it never creates deposits.
export default function CommitmentForm({ period, onDone }) {
  const [choice, setChoice] = useState({ who: 'milton', currency: 'PEN', purpose: 'expenses' });
  const [amount, setAmount] = useState(''); const [note, setNote] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async event => {
    event.preventDefault(); setSaving(true); setError('');
    const result = await useLedgerStore.getState().saveCommitment({ id: crypto.randomUUID(), contributorId: choice.who, currency: choice.currency,
      purpose: choice.purpose, amount, note, confirmed, period });
    setSaving(false);
    if (result.ok) onDone('Compromiso registrado para este periodo.');
    else setError(result.errors?.[0] === 'DUPLICATE' ? DUPLICATE_TEXT : controlExplanation(result.errors?.[0]));
  };
  return <form aria-label="Compromiso de aporte" className="space-y-3" onSubmit={submit}>
    <p className="text-sm">Acuerdo solo para {formatPeriod(period)}.</p>
    {CHOICES.map(([id, label, key, options]) => <div key={id}>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select id={id} className={fieldClass} value={choice[key]} onChange={event => setChoice({ ...choice, [key]: event.target.value })}>
        {options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
    </div>)}
    <label className={labelClass} htmlFor="commitment-amount">Importe acordado</label>
    <input id="commitment-amount" className={fieldClass} inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} />
    <label className={labelClass} htmlFor="commitment-note">Nota del acuerdo (opcional)</label>
    <input id="commitment-note" className={fieldClass} maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
    <label className="flex items-start gap-2 text-sm"><input id="commitment-confirm" type="checkbox" required checked={confirmed}
      onChange={event => setConfirmed(event.target.checked)} />Confirmo expresamente este compromiso para el periodo indicado.</label>
    {error && <p role="alert" className="text-sm">{error}</p>}
    <button type="submit" className={buttonClass} disabled={saving}>Guardar compromiso</button>
  </form>;
}
