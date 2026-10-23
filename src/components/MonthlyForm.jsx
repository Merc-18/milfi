import { useState } from 'react';
import { sessionCommand, sessionResultMessage, usePersisted } from '../presentation/fiorellaSession.js';
import { useStore } from '../store/useStore.js';
import { TONE_CLASS } from '../presentation/tones.js';
import { formatAmount } from '../presentation/format.js';
import { compareAmounts } from '../domain/amounts.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { buttonClass, MoneyInput } from './FiorellaSession.jsx';

// Income and projection of one month; the applied GF is always the official cap.
// A month saved earlier with another GF keeps it until it is saved again here.
export default function MonthlyForm({ period, record }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const [base, setBase] = useState(record);
  const [income, setIncome] = useState(record?.income ?? '');
  const [projected, setProjected] = useState(record?.planStatus === 'projected');
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const persisted = usePersisted();
  const stored = base?.appliedFixedExpense ?? null;
  const other = stored !== null && compareAmounts(stored, FINANCIAL_RULES.fixedExpenseCap) !== 0 ? stored : null;
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    const planStatus = projected ? 'projected' : 'actual';
    const result = await save(sessionCommand('monthly-plan', period, base, { income, appliedFixedExpense: FINANCIAL_RULES.fixedExpenseCap, planStatus }));
    setSaving(false);
    if (result.ok) setBase(result.value);
    setFeedback({ ok: result.ok, text: sessionResultMessage(result, persisted) });
  };
  return <form aria-label="Datos mensuales" onSubmit={submit} className="space-y-3">
    <MoneyInput id="monthly-income" label="Ingreso del mes (S/)" value={income} onChange={setIncome} />
    {other && <p className="text-xs" role="note" data-testid="monthly-fixed-note">
      Este mes tenía {formatAmount(other)} de GF aplicado; al guardar pasará a {formatAmount(FINANCIAL_RULES.fixedExpenseCap)}.</p>}
    <label htmlFor="monthly-projected" className="flex gap-3 items-start text-sm">
      <input id="monthly-projected" type="checkbox" className="mt-1 shrink-0" checked={projected} onChange={event => setProjected(event.target.checked)} />
      Proyección: aún no recibido</label>
    <p className="text-xs text-texto-light">Usa punto decimal. Se reservan {formatAmount(FINANCIAL_RULES.fixedExpenseCap)} para gastos fijos.</p>
    <button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
    {feedback && <p className={`text-sm rounded-xl px-3 py-2 ${feedback.ok ? 'bg-exito/60' : TONE_CLASS.aviso}`}
      role={feedback.ok ? 'status' : 'alert'}>{feedback.text}</p>}
  </form>;
}
