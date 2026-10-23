import { sessionCommand, sessionResultMessage, useDemoLabel, useFiorellaPeriod, usePersisted } from '../presentation/fiorellaSession.js';
import { useState } from 'react';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import { useStore } from '../store/useStore.js';
import { FIXED_CATEGORIES } from '../domain/fiorellaCategories.js';
import { addAmounts, compareAmounts } from '../domain/amounts.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { formatAmount } from '../presentation/format.js';
import { buttonClass, cardClass, Comparison, FixedTotalComparison, Help, Kpi, MoneyInput, PageHeader, PeriodPicker, Progress, SessionNotice } from '../components/FiorellaSession.jsx';

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
  // One compact row: name, budget, actual, save. Two columns on phones, one line on wide screens.
  return <form onSubmit={submit} className="border-t border-secundario py-3 grid gap-2 sm:grid-cols-[minmax(8rem,1fr)_8rem_8rem_auto] sm:items-end" aria-label={`Presupuesto ${category.id}`}>
    <div className="min-w-0 sm:self-center"><h3 className="font-bold text-sm">{category.name}</h3>
      <p className="text-xs"><Comparison budget={record?.budgetAmount ?? null} spent={record?.actualAmount ?? null} /></p>
      <div className="mt-1"><Progress value={record?.actualAmount} limit={record?.budgetAmount} label={`${category.name}: gasto frente al presupuesto`} /></div></div>
    <div className="grid grid-cols-2 gap-2 sm:contents">
      <MoneyInput id={`budget-${category.id}`} label="Presupuesto" value={budget} onChange={setBudget} />
      <MoneyInput id={`actual-${category.id}`} label={`Real${demo}`} value={actual} onChange={setActual} />
    </div>
    <button className={`${buttonClass} min-h-11`} type="submit" disabled={saving} aria-label={`${record ? 'Actualizar' : persisted ? 'Guardar' : 'Registrar'} ${category.name}${persisted ? '' : ' · sesión'}`}>{saving ? 'Guardando…' : record ? 'Actualizar' : 'Guardar'}</button>
    {feedback && <p role={feedback.ok ? 'status' : 'alert'} className={`text-xs sm:col-span-4 rounded-lg px-2 py-1 ${feedback.ok ? 'bg-exito/60' : 'bg-rose-50'}`}>{feedback.text}</p>}
  </form>;
}

const subtotal = (records, field) => { const values = records.map(record => record[field]).filter(value => typeof value === 'string'); return values.length ? values.reduce(addAmounts, '0') : null; };

export default function PresupuestosGF() {
  const manage = canManage(useModuleAccess('fiorella'));
  const { input, period, summary } = useFiorellaPeriod();
  const over = summary.budget.amount !== null && compareAmounts(summary.budget.amount, FINANCIAL_RULES.fixedExpenseCap) > 0;
  const demo = useDemoLabel();
  return <div className="pb-10 space-y-4">
    <PageHeader title="Presupuestos GF" subtitle={`Presupuesto frente a gasto real${demo}`}><PeriodPicker /></PageHeader>
    <SessionNotice />
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <Kpi label="Presupuesto GF" amount={summary.budget.amount}><p className="text-xs">{summary.budget.registered}/19 con presupuesto</p></Kpi>
      <Kpi label={`Gasto GF real${demo}`} amount={summary.actual.amount}><p className="text-xs">{summary.actual.registered}/19 con gasto</p><Progress value={summary.actual.amount} limit={summary.budget.amount} label="Gasto GF frente al presupuesto" /></Kpi>
      <Kpi label="GF aplicado" amount={summary.monthly?.appliedFixedExpense}><p className="text-xs">Se edita en el panel</p></Kpi>
    </div>
    <FixedTotalComparison summary={summary} />
    {over && <p className="text-sm bg-acento/40 p-3 rounded-xl">El presupuesto detallado supera el tope GF. Se conserva tal cual, sin cambiar el GF aplicado ni redistribuir fondos.</p>}
    {summary.requiresRoundingDecision && <p className="text-sm">Hay fracciones de céntimo. Se muestran exactas, sin decidir su redondeo monetario.</p>}
    {!manage && <ReadOnlyNotice>Administra Fiorella.</ReadOnlyNotice>}
    <div className="grid gap-3 xl:grid-cols-2 items-start">
    {FIXED_CATEGORIES.map(group => { const records = summary.fixed.filter(item => item.categoryId.startsWith(`${group.id}-`)); const budget = subtotal(records, 'budgetAmount'); const actual = subtotal(records, 'actualAmount');
      return <details key={group.id} className={cardClass} open={group.id === 'servicios'}>
      <summary className="cursor-pointer min-h-11 flex flex-wrap items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden"><span className="font-bold">▾ {group.name}</span><span className="text-sm">{actual == null ? '—' : formatAmount(actual)} de {budget == null ? '—' : formatAmount(budget)}</span></summary>
      {group.children.map(category => { const record = summary.fixed.find(item => item.categoryId === category.id);
        return manage ? <BudgetRow key={`${input}:${category.id}`} category={category} period={period} record={record} />
          : <div key={category.id} className="border-t border-secundario py-4 text-sm space-y-1"><h3 className="font-bold">{category.name}</h3>
            <p>Presupuesto: {record?.budgetAmount == null ? 'sin registrar' : formatAmount(record.budgetAmount)} · Real: {record?.actualAmount == null ? 'sin registrar' : formatAmount(record.actualAmount)}</p>
            <Progress value={record?.actualAmount} limit={record?.budgetAmount} label={`${category.name}: gasto frente al presupuesto`} /><p><Comparison budget={record?.budgetAmount ?? null} spent={record?.actualAmount ?? null} /></p></div>; })}
    </details>; })}
    </div>
    <Help><p>Usa punto decimal. En blanco significa sin registrar; cero significa un importe registrado de cero. El gasto GF real se anota como total del mes por subcategoría, sin fecha. El detalle no sustituye el GF aplicado a la distribución.</p></Help>
  </div>;
}
