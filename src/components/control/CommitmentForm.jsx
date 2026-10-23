import { useState } from 'react';
import { useLedgerStore } from '../../store/ledgerStore.js';
import { buttonClass, fieldClass } from '../FiorellaSession.jsx';
import { formatPeriod } from '../../presentation/format.js';
import { controlExplanation } from '../../presentation/control.js';

export default function CommitmentForm({ period, onDone }) {
  const [who, setWho] = useState('milton'); const [currency, setCurrency] = useState('PEN'); const [purpose, setPurpose] = useState('expenses');
  const [amount, setAmount] = useState(''); const [note, setNote] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async event => {
    event.preventDefault(); setSaving(true); setError('');
    const result = await useLedgerStore.getState().saveCommitment({ id: crypto.randomUUID(), contributorId: who, currency, purpose, amount, note, confirmed, period });
    setSaving(false);
    if (result.ok) onDone('Compromiso registrado para este periodo.');
    else setError(result.errors?.[0] === 'DUPLICATE' ? 'Ya existe un compromiso para esta persona, moneda, destino y periodo. Se conserva el acuerdo guardado.' : controlExplanation(result.errors?.[0]));
  };
  return <form aria-label="Compromiso de aporte" className="space-y-3" onSubmit={submit}>
    <p className="text-sm">Acuerdo solo para el mes recibido {formatPeriod(period)}. No genera depósitos ni cambia otros periodos.</p>
    {[['commitment-person', 'Aportante', who, setWho, [['milton', 'Milton'], ['fiorella', 'Fiorella']]],
      ['commitment-currency', 'Moneda', currency, setCurrency, [['PEN', 'PEN'], ['USD', 'USD']]],
      ['commitment-purpose', 'Destino', purpose, setPurpose, [['expenses', 'Gastos'], ['savings', 'Ahorro']]]].map(([id, label, value, change, options]) => <div key={id}>
        <label htmlFor={id} className="block text-sm font-bold">{label}</label><select id={id} className={fieldClass} value={value} onChange={event => change(event.target.value)}>{options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></div>)}
    <label className="block text-sm font-bold" htmlFor="commitment-amount">Importe acordado</label><input id="commitment-amount" className={fieldClass} inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} />
    <label className="block text-sm font-bold" htmlFor="commitment-note">Nota del acuerdo (opcional)</label><input id="commitment-note" className={fieldClass} maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
    <label className="flex items-start gap-2 text-sm"><input id="commitment-confirm" type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirmo expresamente este compromiso para el periodo indicado.</label>
    {error && <p role="alert" className="text-sm">{error}</p>}
    <button type="submit" className={buttonClass} disabled={saving}>Guardar compromiso</button>
  </form>;
}
