import { sessionCommand, sessionResultMessage, useFiorellaPeriod } from '../presentation/fiorellaSession.js';
import { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { FIXED_CATEGORIES } from '../domain/fiorellaCategories.js';
import { compareAmounts } from '../domain/amounts.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { AmountStatus, buttonClass, cardClass, Comparison, FixedTotalComparison, MoneyInput, PeriodPicker, SessionNotice } from '../components/FiorellaSession.jsx';

function BudgetRow({ category, record, period }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const [base, setBase] = useState(record);
  const [budget, setBudget] = useState(record?.budgetAmount ?? '');
  const [actual, setActual] = useState(record?.actualAmount ?? '');
  const [feedback, setFeedback] = useState(null);
  const submit = event => {
    event.preventDefault();
    const result = save(sessionCommand('fixed-budget', period, base, { categoryId: category.id, budgetAmount: budget, actualAmount: actual }));
    if (result.ok) setBase(result.value);
    setFeedback({ ok: result.ok, text: sessionResultMessage(result) });
  };
  return <form onSubmit={submit} className="border-t border-secundario py-4 space-y-3" aria-label={`Presupuesto ${category.id}`}>
    <h3 className="font-bold">{category.name}</h3>
    <MoneyInput id={`budget-${category.id}`} label="Presupuesto mensual (S/)" value={budget} onChange={setBudget} />
    <MoneyInput id={`actual-${category.id}`} label="Gasto registrado · demo (S/)" value={actual} onChange={setActual} />
    <p className="text-sm"><Comparison budget={record?.budgetAmount ?? null} spent={record?.actualAmount ?? null} /></p>
    <button className={buttonClass} type="submit">{record ? 'Actualizar' : 'Registrar'} {category.name} · sesión</button>
    {feedback && <p role={feedback.ok ? 'status' : 'alert'} className="text-sm">{feedback.text}</p>}
  </form>;
}

export default function PresupuestosGF() {
  const { input, period, summary } = useFiorellaPeriod();
  const over = summary.budget.amount !== null && compareAmounts(summary.budget.amount, FINANCIAL_RULES.fixedExpenseCap) > 0;
  return <div className="pb-10 space-y-5">
    <header className="my-6"><h1 className="text-2xl font-bold">Presupuestos GF</h1><p className="text-sm mt-2">Categorías oficiales · presupuesto y ejecución de demostración</p></header>
    <SessionNotice /><PeriodPicker />
    <p className="text-sm">Usa punto decimal. En blanco significa sin registrar; cero significa un importe registrado de cero. El detalle no sustituye el GF aplicado al cálculo.</p>
    <div className="grid gap-3">
      <AmountStatus label="Presupuesto detallado GF" amount={summary.budget.amount} detail={`${summary.budget.registered}/19 subcategorías con presupuesto · ${summary.budget.status === 'complete' ? 'Completo' : 'Incompleto'}`} />
      <AmountStatus label="Ejecución GF registrada · demo" amount={summary.actual.amount} detail={`${summary.actual.registered}/19 subcategorías con gasto. No representa un total real confirmado.`} />
      <AmountStatus label="GF aplicado al cálculo" amount={summary.monthly?.appliedFixedExpense} detail="Se define por separado en el resumen mensual." />
    </div>
    <FixedTotalComparison summary={summary} />
    {over && <p className="text-sm bg-acento/40 p-3 rounded-xl">El presupuesto detallado supera el tope GF. Se conserva como ejemplo, sin cambiar el GF aplicado ni redistribuir fondos.</p>}
    {summary.requiresRoundingDecision && <p className="text-sm">Hay fracciones de céntimo. Se muestran exactas, sin decidir su redondeo monetario.</p>}
    {FIXED_CATEGORIES.map(group => <details key={group.id} className={cardClass} open={group.id === 'servicios'}>
      <summary className="font-bold text-lg cursor-pointer">{group.name} · {group.children.length} subcategorías</summary>
      {group.children.map(category => <BudgetRow key={`${input}:${category.id}`} category={category} period={period} record={summary.fixed.find(record => record.categoryId === category.id)} />)}
    </details>)}
  </div>;
}
