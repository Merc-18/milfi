import { sessionCommand, sessionResultMessage, useDemoLabel, useFiorellaPeriod, usePersisted } from '../presentation/fiorellaSession.js';
import { useState } from 'react';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import { useStore } from '../store/useStore.js';
import { FIXED_CATEGORIES } from '../domain/fiorellaCategories.js';
import { compareAmounts } from '../domain/amounts.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { formatAmount } from '../presentation/format.js';
import { AmountStatus, buttonClass, cardClass, Comparison, FixedTotalComparison, Help, MoneyInput, PeriodPicker, Progress, SessionNotice } from '../components/FiorellaSession.jsx';

function BudgetRow({ category, record, period }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const [base, setBase] = useState(record);
  const [budget, setBudget] = useState(record?.budgetAmount ?? '');
  const [actual, setActual] = useState(record?.actualAmount ?? '');
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const persisted = usePersisted();
  const demo = useDemoLabel();
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    const result = await save(sessionCommand('fixed-budget', period, base, { categoryId: category.id, budgetAmount: budget, actualAmount: actual }));
    if (result.ok) setBase(result.value);
    setSaving(false);
    setFeedback({ ok: result.ok, text: sessionResultMessage(result, persisted) });
  };
  return <form onSubmit={submit} className="border-t border-secundario py-4 space-y-3" aria-label={`Presupuesto ${category.id}`}>
    <h3 className="font-bold">{category.name}</h3>
    <MoneyInput id={`budget-${category.id}`} label="Presupuesto mensual (S/)" value={budget} onChange={setBudget} />
    <MoneyInput id={`actual-${category.id}`} label={`Gasto real del mes${demo} (S/)`} value={actual} onChange={setActual} />
    <Progress value={record?.actualAmount} limit={record?.budgetAmount} label={`${category.name}: gasto frente al presupuesto`} />
    <p className="text-sm"><Comparison budget={record?.budgetAmount ?? null} spent={record?.actualAmount ?? null} /></p>
    <button className={buttonClass} type="submit" disabled={saving}>{saving ? 'Guardando…' : `${record ? 'Actualizar' : persisted ? 'Guardar' : 'Registrar'} ${category.name}${persisted ? '' : ' · sesión'}`}</button>
    {feedback && <p role={feedback.ok ? 'status' : 'alert'} className="text-sm">{feedback.text}</p>}
  </form>;
}

export default function PresupuestosGF() {
  const manage = canManage(useModuleAccess('fiorella'));
  const { input, period, summary } = useFiorellaPeriod();
  const over = summary.budget.amount !== null && compareAmounts(summary.budget.amount, FINANCIAL_RULES.fixedExpenseCap) > 0;
  const demo = useDemoLabel();
  return <div className="pb-10 space-y-5">
    <header className="my-6"><h1 className="text-2xl font-bold">Presupuestos GF</h1><p className="text-sm mt-2">Presupuesto frente a gasto real por subcategoría{demo}</p></header>
    <SessionNotice /><PeriodPicker />
    <Help><p>Usa punto decimal. En blanco significa sin registrar; cero significa un importe registrado de cero. El gasto GF real se anota como total del mes por subcategoría, sin fecha. El detalle no sustituye el GF aplicado a la distribución.</p></Help>
    <div className="grid gap-3">
      <AmountStatus label="Presupuesto detallado GF" amount={summary.budget.amount} detail={`${summary.budget.registered}/19 subcategorías con presupuesto · ${summary.budget.status === 'complete' ? 'Completo' : 'Incompleto'}`} />
      <AmountStatus label={`Gasto GF real${demo}`} amount={summary.actual.amount} detail={`${summary.actual.registered}/19 subcategorías con gasto${demo ? '. No representa un total real confirmado.' : ''}`} />
      <AmountStatus label="GF aplicado a la distribución" amount={summary.monthly?.appliedFixedExpense} detail="Se define en el panel mensual." />
    </div>
    <FixedTotalComparison summary={summary} />
    {over && <p className="text-sm bg-acento/40 p-3 rounded-xl">El presupuesto detallado supera el tope GF. Se conserva tal cual, sin cambiar el GF aplicado ni redistribuir fondos.</p>}
    {summary.requiresRoundingDecision && <p className="text-sm">Hay fracciones de céntimo. Se muestran exactas, sin decidir su redondeo monetario.</p>}
    {!manage && <ReadOnlyNotice>Tu usuario puede consultar las finanzas personales de Fiorella, pero no crear, editar ni eliminar sus registros.</ReadOnlyNotice>}
    {FIXED_CATEGORIES.map(group => <details key={group.id} className={cardClass} open={group.id === 'servicios'}>
      <summary className="font-bold text-lg cursor-pointer">{group.name} · {group.children.length} subcategorías</summary>
      {group.children.map(category => { const record = summary.fixed.find(item => item.categoryId === category.id);
        return manage ? <BudgetRow key={`${input}:${category.id}`} category={category} period={period} record={record} />
          : <div key={category.id} className="border-t border-secundario py-4 text-sm space-y-1"><h3 className="font-bold">{category.name}</h3>
            <p>Presupuesto: {record?.budgetAmount == null ? 'sin registrar' : formatAmount(record.budgetAmount)} · Real: {record?.actualAmount == null ? 'sin registrar' : formatAmount(record.actualAmount)}</p>
            <Progress value={record?.actualAmount} limit={record?.budgetAmount} label={`${category.name}: gasto frente al presupuesto`} /><p><Comparison budget={record?.budgetAmount ?? null} spent={record?.actualAmount ?? null} /></p></div>; })}
    </details>)}
  </div>;
}
