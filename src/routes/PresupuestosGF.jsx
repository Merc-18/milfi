import { sessionCommand, sessionResultMessage, useFiorellaPeriod, usePersisted } from '../presentation/fiorellaSession.js';
import { useEffect, useRef, useState } from 'react';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import { useStore } from '../store/useStore.js';
import { compareAmounts } from '../domain/amounts.js';
import { moneyDifference } from '../domain/fiorellaSession.js';
import { budgetGroups } from '../presentation/fixedBudgets.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { formatAmount } from '../presentation/format.js';
import Badge from '../components/ui/Badge.jsx';
import { noticeClass } from '../presentation/tones.js';
import { buttonClass, cardClass, Help, Kpi, MoneyInput, PageHeader, SessionNotice } from '../components/FiorellaSession.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';

function Difference({ comparison }) {
  const { status, amount } = comparison;
  if (status === 'unavailable') return <span title="Faltan importes registrados" aria-label="Sin diferencia: faltan importes registrados">—</span>;
  const tone = status === 'over' ? 'excedido' : status === 'remaining' ? 'ok' : 'neutral';
  return <Badge tone={tone}>{status === 'over' ? '−' : status === 'equal' ? '' : '+'}{formatAmount(amount)}</Badge>;
}

function BudgetEditor({ category, record, period, onCancel, onSaved, onBusy }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const [base] = useState(record);
  const [budget, setBudget] = useState(record?.budgetAmount ?? '');
  const [actual, setActual] = useState(record?.actualAmount ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const form = useRef(null);
  useEffect(() => { form.current?.querySelector('input')?.focus(); }, []);
  const persisted = usePersisted();
  const submit = async event => {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setSaving(true); onBusy(true); setError(null);
    try {
      const result = await save(sessionCommand('fixed-budget', period, base, { categoryId: category.id, budgetAmount: budget, actualAmount: actual }));
      if (result.ok) onSaved(`Guardado · ${category.name}.${persisted ? ` ${sessionResultMessage(result, persisted)}` : ''}`);
      else setError(sessionResultMessage(result, persisted));
    } catch {
      setError(sessionResultMessage({ errors: ['PERSISTENCE_ERROR'] }, persisted));
    } finally {
      locked.current = false;
      setSaving(false); onBusy(false);
    }
  };
  return <form ref={form} onSubmit={submit} aria-label={`Presupuesto ${category.id}`} aria-busy={saving} className="rounded-xl bg-fondo p-3 space-y-3 my-2"
    onKeyDown={event => { if (event.key === 'Escape' && !locked.current) { event.preventDefault(); onCancel(); } }}>
    <fieldset disabled={saving} className="space-y-3">
      <legend className="text-sm font-bold">Editar {category.name}</legend>
      <div className="grid grid-cols-2 gap-3">
        <MoneyInput id={`budget-${category.id}`} label="Presupuesto (S/)" value={budget} onChange={setBudget} />
        <MoneyInput id={`actual-${category.id}`} label="Real (S/)" value={actual} onChange={setActual} />
      </div>
      <p className="text-xs">En blanco: sin registrar. Cero: importe registrado.</p>
      <div className="flex gap-3 items-center">
        <button type="submit" className={`${buttonClass} min-h-11`}>{saving ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="min-h-11 px-3 underline text-sm" onClick={onCancel}>Cancelar</button>
      </div>
    </fieldset>
    {saving && <p role="status" className="text-xs">Guardando…</p>}
    {error && <p role="alert" className={noticeClass()}>{error}</p>}
  </form>;
}

const rowGrid = 'grid grid-cols-3 gap-x-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_3.25rem]';
const amountClass = 'min-w-0 text-right tabular-nums [overflow-wrap:anywhere]';
const amount = value => value == null ? <span className="text-texto-light" title="Sin registrar" aria-label="Sin registrar">—</span> : formatAmount(value);

function BudgetRow({ category, record, period, manage, editing, busy, onEdit, onClose, onSaved, onBusy }) {
  const editButton = useRef(null);
  const restoreFocus = useRef(false);
  const close = () => { restoreFocus.current = true; onClose(); };
  useEffect(() => {
    if (restoreFocus.current && !editing && !busy) {
      restoreFocus.current = false;
      editButton.current?.focus();
    }
  }, [editing, busy]);
  return <div data-budget-id={category.id}>
    <div role="row" className={`${rowGrid} items-center border-t border-secundario/60 py-1 text-xs`}>
      <div role="rowheader" className="col-span-2 sm:col-span-1 font-bold min-w-0 [overflow-wrap:anywhere]">{category.name}</div>
      {[['Presupuesto', amount(record?.budgetAmount)], ['Real', amount(record?.actualAmount)], ['Diferencia', <Difference key="difference" comparison={moneyDifference(record?.budgetAmount ?? null, record?.actualAmount ?? null)} />]].map(([label, value]) =>
        <div role="cell" key={label} className={`${amountClass} row-start-2 sm:row-start-auto`}><span className="block sm:hidden text-[10px] text-texto-light mb-1">{label}</span>{value}</div>)}
      <div role="cell" className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto text-right">
        {manage && <button ref={editButton} type="button" aria-label={`Editar ${category.name}`} aria-expanded={editing} aria-controls={editing ? `editor-${category.id}` : undefined}
          disabled={busy} className="min-h-11 min-w-11 underline font-bold disabled:opacity-40" onClick={() => onEdit(category.id)}>Editar</button>}
      </div>
    </div>
    {manage && editing && <div id={`editor-${category.id}`} role="row"><div role="cell" aria-colspan={5}>
      <BudgetEditor category={category} record={record} period={period} onBusy={onBusy} onCancel={close} onSaved={message => { onSaved(message); close(); }} />
    </div></div>}
  </div>;
}

function BudgetWorkspace({ period, summary, manage }) {
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  return <>
    {feedback && <p role="status" className="text-sm rounded-xl bg-exito/60 px-3 py-2">{feedback}</p>}
    <div className="grid gap-4 xl:grid-cols-2 items-start" data-testid="budget-groups">
      {budgetGroups(summary).map(group => <section key={group.id} className={cardClass} aria-labelledby={`group-${group.id}`}>
        <h2 id={`group-${group.id}`} className="font-bold mb-3">{group.name}</h2>
        <dl className="grid grid-cols-3 gap-2 mb-3 text-xs" data-testid={`budget-summary-${group.id}`}>
          <div className={amountClass}><dt>Presupuesto{group.budgetRegistered < group.expected ? ' · parcial' : ''}</dt><dd className="font-bold mt-1">{amount(group.budget)}</dd></div>
          <div className={amountClass}><dt>Real{group.actualRegistered < group.expected ? ' · parcial' : ''}</dt><dd className="font-bold mt-1">{amount(group.actual)}</dd></div>
          <div className={amountClass}><dt>Diferencia</dt><dd className="font-bold mt-1"><Difference comparison={group.comparison} /></dd></div>
        </dl>
        {!group.complete && <p className="text-[11px] text-texto-light mb-2">Cobertura: presupuesto {group.budgetRegistered}/{group.expected} · real {group.actualRegistered}/{group.expected}. Diferencia pendiente.</p>}
        <div role="table" aria-label={`${group.name}: presupuesto, real y diferencia en soles`}>
          <div role="rowgroup" className="hidden sm:block"><div role="row" className={`${rowGrid} text-[11px] text-texto-light pb-2`}>
            {['Subcategoría', 'Presup.', 'Real', 'Diferencia', manage ? 'Acción' : ''].map((label, index) => <div role="columnheader" key={index} className={index ? 'text-right' : ''}>{label}</div>)}
          </div></div>
          <div role="rowgroup">{group.rows.map(({ category, record }) => <BudgetRow key={category.id} category={category} record={record} period={period}
            manage={manage} busy={busy} editing={editing === category.id} onBusy={setBusy} onClose={() => setEditing(null)} onSaved={setFeedback}
            onEdit={id => { setFeedback(null); setEditing(id); }} />)}</div>
        </div>
      </section>)}
    </div>
  </>;
}

export default function PresupuestosGF() {
  const manage = canManage(useModuleAccess('fiorella'));
  const { input, period, summary } = useFiorellaPeriod();
  const over = summary.budget.amount !== null && compareAmounts(summary.budget.amount, FINANCIAL_RULES.fixedExpenseCap) > 0;
  return <div className="pb-10 space-y-4">
    <PageHeader title="Presupuestos GF"><PeriodPicker /></PageHeader>
    <SessionNotice />
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3" data-testid="budget-totals">
      <Kpi label={`Presupuesto GF${summary.budget.status === 'complete' ? '' : ' · parcial'}`} amount={summary.budget.amount}><p className="text-xs">{summary.budget.registered}/{summary.budget.expected} con presupuesto</p></Kpi>
      <Kpi label={`Gasto GF real${summary.actual.status === 'complete' ? '' : ' · parcial'}`} amount={summary.actual.amount}><p className="text-xs">{summary.actual.registered}/{summary.actual.expected} con gasto</p></Kpi>
      <div className={`${cardClass} col-span-2 lg:col-span-1`}><h3 className="text-xs font-bold">Diferencia general GF</h3><p className="text-lg font-bold tabular-nums break-all mt-1"><Difference comparison={summary.fixedComparison} /></p>
        <p className="text-xs mt-1">{summary.fixedComparison.status === 'unavailable' ? `Cobertura ${summary.fixedCoverage.matched}/${summary.budget.expected} con ambos importes · diferencia pendiente` : 'Detalle completo'}</p></div>
    </div>
    {over && <p className="text-sm bg-acento/40 p-3 rounded-xl">El presupuesto detallado supera el tope GF. Se conserva tal cual, sin cambiar el GF aplicado ni redistribuir fondos.</p>}
    {summary.requiresRoundingDecision && <p className="text-xs">Fracciones de céntimo: se muestran exactas, sin redondear.</p>}
    {!manage && <ReadOnlyNotice>Administra Fiorella.</ReadOnlyNotice>}
    <BudgetWorkspace key={`${input}:${manage}`} period={period} summary={summary} manage={manage} />
    <Help><p>Importes en soles. — significa sin registrar; cero es un importe registrado. Los subtotales parciales suman solo datos conocidos. La diferencia requiere presupuesto y real en todas las subcategorías del grupo. El gasto GF es el total mensual por subcategoría, sin fecha individual. Este detalle no sustituye el GF aplicado a la distribución, que se edita en el panel.</p></Help>
  </div>;
}
