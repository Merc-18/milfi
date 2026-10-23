import { useState } from 'react';
import { sessionCommand, sessionResultMessage, usePersisted } from '../presentation/fiorellaSession.js';
import { useStore } from '../store/useStore.js';
import { TONE_CLASS } from '../presentation/tones.js';
import { buttonClass, MoneyInput } from './FiorellaSession.jsx';

// Income, applied GF and projection of one month. Opened in a sheet from the
// summary and from Gastos.
export default function MonthlyForm({ period, record }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const [base, setBase] = useState(record);
  const [income, setIncome] = useState(record?.income ?? '');
  const [fixed, setFixed] = useState(record?.appliedFixedExpense ?? '');
  const [projected, setProjected] = useState(record?.planStatus === 'projected');
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const persisted = usePersisted();
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    const planStatus = projected ? 'projected' : 'actual';
    const result = await save(sessionCommand('monthly-plan', period, base, { income, appliedFixedExpense: fixed, planStatus }));
    setSaving(false);
    if (result.ok) setBase(result.value);
    setFeedback({ ok: result.ok, text: sessionResultMessage(result, persisted) });
  };
  return <form aria-label="Datos mensuales" onSubmit={submit} className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <MoneyInput id="monthly-income" label="Ingreso del mes (S/)" value={income} onChange={setIncome} />
      <MoneyInput id="monthly-fixed" label="GF aplicado (S/) · tope 1,500" value={fixed} onChange={setFixed} />
    </div>
    <label htmlFor="monthly-projected" className="flex gap-3 items-start text-sm">
      <input id="monthly-projected" type="checkbox" className="mt-1 shrink-0" checked={projected} onChange={event => setProjected(event.target.checked)} />
      Proyección: aún no recibido</label>
    <p className="text-xs text-texto-light">Usa punto decimal. Puedes completar un campo ahora y el otro después.</p>
    <button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
    {feedback && <p className={`text-sm rounded-xl px-3 py-2 ${feedback.ok ? 'bg-exito/60' : TONE_CLASS.aviso}`}
      role={feedback.ok ? 'status' : 'alert'}>{feedback.text}</p>}
  </form>;
}
