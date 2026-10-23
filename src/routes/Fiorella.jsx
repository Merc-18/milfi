import { sessionCommand, sessionResultMessage, useDemoLabel, useFiorellaPeriod, usePersisted } from '../presentation/fiorellaSession.js';
import { useMemo, useState } from 'react';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import { Link } from 'react-router-dom';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { useLedgerStore } from '../store/ledgerStore.js';
import { formatAmount, formatPeriod } from '../presentation/format.js';
import { controlMoney } from '../presentation/control.js';
import { inspectLedger } from '../domain/controlLedger.js';
import { fiorellaEvolution, registeredSavingsDeposits, summarizeExpenses } from '../domain/fiorellaDashboard.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { TONE_CLASS } from '../presentation/tones.js';
import DistributionDetails from '../components/DistributionDetails.jsx';
import { buttonClass, cardClass, Comparison, Help, Kpi, MoneyInput, PageHeader, Progress, SessionNotice } from '../components/FiorellaSession.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';

function MonthlyForm({ period, record }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const [base, setBase] = useState(record);
  const [income, setIncome] = useState(record?.income ?? '');
  const [fixed, setFixed] = useState(record?.appliedFixedExpense ?? '');
  const [projected, setProjected] = useState(record?.planStatus === 'projected');
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const persisted = usePersisted();
  const demo = useDemoLabel();
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    const result = await save(sessionCommand('monthly-plan', period, base, { income, appliedFixedExpense: fixed, planStatus: projected ? 'projected' : 'actual' }));
    setSaving(false);
    if (result.ok) setBase(result.value);
    setFeedback({ ok: result.ok, text: sessionResultMessage(result, persisted) });
  };
  return <form aria-label={`Datos mensuales${demo ? ' de demostración' : ''}`} onSubmit={submit} className="space-y-3 pt-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <MoneyInput id="monthly-income" label={`Ingreso del mes${demo} (S/)`} value={income} onChange={setIncome} />
      <MoneyInput id="monthly-fixed" label="GF aplicado (S/) · tope 1,500" value={fixed} onChange={setFixed} />
    </div>
    <label htmlFor="monthly-projected" className="flex gap-3 items-start text-sm"><input id="monthly-projected" type="checkbox" className="mt-1 shrink-0" checked={projected} onChange={event => setProjected(event.target.checked)} />Proyección: aún no recibido</label>
    <button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Guardando…' : persisted ? 'Guardar datos del mes' : 'Registrar datos del mes · sesión'}</button>
    {feedback && <p className={`text-sm rounded-xl px-3 py-2 ${feedback.ok ? 'bg-exito/60' : TONE_CLASS.aviso}`} role={feedback.ok ? 'status' : 'alert'}>{feedback.text}</p>}
    <Help><p>Usa punto decimal. Puedes registrar solo un campo y completar el otro después. El GF aplicado no se calcula a partir del presupuesto detallado ni del gasto registrado.</p></Help>
  </form>;
}

function SavingsCard({ summary, period, persisted }) {
  const records = useLedgerStore(state => state.records);
  const deposits = useMemo(() => registeredSavingsDeposits(inspectLedger(records), period, 'fiorella'), [records, period]);
  const planned = summary.calculation.status === 'calculated' ? summary.calculation.distribution.savings : null;
  return <section className={`${cardClass} space-y-3`} data-testid="savings-tracking">
    <h2 className="font-bold">Ahorro del mes</h2>
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div className="rounded-xl bg-secundario/30 p-3"><dt className="text-xs">💜 Pareja · plan</dt><dd className="font-bold break-all">{planned ? formatAmount(planned.couple) : '—'}</dd></div>
      <div className="rounded-xl bg-secundario/30 p-3"><dt className="text-xs">💜 Pareja · depositado</dt>
        <dd className="font-bold break-all">{!persisted ? '—' : deposits.groups.length ? deposits.groups.map(group => <span key={group.currency} className="block">{controlMoney(group.total, group.currency)}</span>) : 'Sin depósitos'}</dd></div>
      <div className="rounded-xl bg-exito/40 p-3"><dt className="text-xs">💚 Personal · plan</dt><dd className="font-bold break-all">{planned ? formatAmount(planned.personal) : '—'}</dd></div>
      <div className="rounded-xl bg-exito/40 p-3"><dt className="text-xs">💚 Personal · depositado</dt><dd className="text-xs">No se registra</dd></div>
    </dl>
    {persisted && deposits.pending > 0 && <p className="text-sm font-bold">{deposits.pending} depósito(s) de ahorro pendientes de revisión en Control.</p>}
    <Help><p>El plan sale de la distribución oficial del mes. Lo depositado son depósitos para ahorro de Fiorella revisados en Control Finanzas M&F, por moneda. Un ahorro planificado no es un depósito.</p></Help>
  </section>;
}

function RecentExpenses({ records }) {
  const recent = [...records].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || a.id.localeCompare(b.id)).slice(0, 5);
  return <section className={`${cardClass} space-y-2`}>
    <div className="flex items-center justify-between gap-2"><h2 className="font-bold">Últimos gastos GV</h2><Link to="/fiorella/gastos" className="text-sm underline font-bold">Ver todos</Link></div>
    {!recent.length ? <p className="text-sm text-texto-light">Sin gastos este mes.</p> : <ul className="divide-y divide-secundario/60 text-sm">
      {recent.map(record => <li key={record.id} className="flex justify-between gap-3 py-2">
        <span className="min-w-0"><span className="block truncate">{record.description}</span><span className="text-xs text-texto-light">{record.effectiveDate.slice(8)}/{record.effectiveDate.slice(5, 7)} · {record.categoryId === 'salud' ? 'Salud' : 'Ocio'}{record.subcategory ? ` / ${record.subcategory}` : ''}</span></span>
        <span className="font-bold shrink-0">{formatAmount(record.amount)}</span></li>)}
    </ul>}
  </section>;
}

function Evolution({ rows, selected }) {
  if (!rows.length) return null;
  return <section className={`${cardClass} space-y-3`} data-testid="monthly-evolution">
    <h2 className="font-bold">Evolución mensual</h2>
    <div className="overflow-x-auto -mx-1"><table className="w-full text-xs sm:text-sm min-w-[32rem]">
      <thead><tr className="text-left text-texto-light">{['Mes', 'Ingreso', 'GF real / presup.', 'GV real / asignado', 'Ahorro pareja'].map(head => <th key={head} className="p-1.5 font-bold">{head}</th>)}</tr></thead>
      <tbody>{[...rows].reverse().map(row => <tr key={row.key} className={`border-t border-secundario ${row.key === selected ? 'bg-principal/30' : ''}`}>
        <td className="p-1.5 first-letter:uppercase whitespace-nowrap">{formatPeriod(row.period)}{row.projected && <span className="block font-bold">Proyectado</span>}</td>
        <td className="p-1.5">{row.income == null ? '—' : formatAmount(row.income)}</td>
        <td className="p-1.5">{row.fixedActual == null ? '—' : formatAmount(row.fixedActual)} / {row.fixedBudget == null ? '—' : formatAmount(row.fixedBudget)}</td>
        <td className="p-1.5">{row.variableActual == null ? '—' : formatAmount(row.variableActual)} / {row.variablePlanned == null ? '—' : formatAmount(row.variablePlanned)}</td>
        <td className="p-1.5">{row.couplePlanned == null ? '—' : formatAmount(row.couplePlanned)}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}

export default function Fiorella() {
  const manage = canManage(useModuleAccess('fiorella'));
  const { input, period, summary, persisted } = useFiorellaPeriod();
  const records = useStore(state => state.fiorellaDemoRecords);
  const evolution = useMemo(() => fiorellaEvolution(records, persisted ? 'real' : 'simulated'), [records, persisted]);
  const demo = useDemoLabel();
  const projected = summary.monthly?.planStatus === 'projected';
  const expenses = summarizeExpenses(summary);
  const variableTotal = expenses.variable.amount;
  const variableAllocation = summary.calculation.status === 'calculated' ? summary.calculation.distribution.variable.total : null;
  return <div className="pb-10 space-y-4">
    <PageHeader title="Finanzas de Fiorella 🌸"><PeriodPicker /></PageHeader>
    <SessionNotice />
    {manage ? <div className="flex flex-wrap gap-2">
      <Link to="/fiorella/gastos?nuevo" className="inline-flex items-center gap-2 rounded-xl bg-texto text-white font-bold px-4 py-3 min-h-11"><Plus size={18} aria-hidden="true" />Registrar gasto</Link>
      <Link to="/fiorella/presupuestos" className="inline-flex items-center gap-2 rounded-xl bg-white shadow-soft font-bold px-4 py-3 min-h-11"><SlidersHorizontal size={18} aria-hidden="true" />Editar GF</Link>
    </div> : <ReadOnlyNotice>Administra Fiorella.</ReadOnlyNotice>}
    {projected && <p className="text-sm font-bold rounded-xl bg-acento/50 px-3 py-2" role="note">Mes proyectado: importes escritos por adelantado, no recibidos.</p>}
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="monthly-summary">
      <Kpi label={`Ingreso${projected ? ' · proyectado' : ''}${demo}`} amount={summary.monthly?.income} />
      <Kpi label="GF aplicado" amount={summary.monthly?.appliedFixedExpense}><Progress value={summary.monthly?.appliedFixedExpense} limit={FINANCIAL_RULES.fixedExpenseCap} label="GF aplicado frente al tope" /></Kpi>
      <Kpi label={`Gasto GF real${demo}`} amount={summary.actual.amount}>
        <p className="text-xs">de {summary.budget.amount == null ? '—' : formatAmount(summary.budget.amount)} · {summary.actual.registered}/{summary.actual.expected} con gasto</p>
        <Progress value={summary.actual.amount} limit={summary.budget.amount} label="Gasto GF frente al presupuesto" />
      </Kpi>
      <Kpi label={`Gasto GV real${demo}`} amount={variableTotal}>
        <p className="text-xs">de {variableAllocation == null ? '—' : formatAmount(variableAllocation)} · {summary.variable.length} gasto(s)</p>
        <Progress value={variableTotal ?? '0'} limit={variableAllocation} label="Gasto GV frente a lo asignado" />
      </Kpi>
      <div className="col-span-2 lg:col-span-1" data-testid="expense-total"><Kpi label={`Total gastado${expenses.total.partial && expenses.total.amount !== null ? ' · parcial' : ''}${demo}`} amount={expenses.total.amount} tone="bg-principal/40">
        <p className="text-xs">GF real + GV real{expenses.total.partial ? ` · GF ${expenses.fixed.registered}/${expenses.fixed.expected}` : ''}</p>
        <Link to="/fiorella/gastos" className="text-xs underline font-bold">Ver gastos</Link></Kpi></div>
    </div>
    {summary.requiresRoundingDecision && <p className="text-sm">Hay fracciones de céntimo: se muestran exactas; su redondeo está pendiente.</p>}
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2 min-w-0">
        <section className={`${cardClass} space-y-3`}>
          <h2 className="font-bold">GV · Salud y Ocio</h2>
          <div className="grid gap-4 sm:grid-cols-2">{summary.categories.map(category => <div key={category.id} className="text-sm space-y-1">
            <p className="flex flex-wrap justify-between gap-2"><span className="font-bold">{category.name}</span>
              <span>{category.executed.amount == null ? 'S/ 0' : formatAmount(category.executed.amount)} de {category.allocation == null ? '—' : formatAmount(category.allocation)}</span></p>
            <Progress value={category.executed.amount ?? '0'} limit={category.allocation} label={`${category.name}: gasto frente a lo asignado`} />
            <p className="text-xs"><Comparison budget={category.allocation} spent={category.executed.amount} /></p>
          </div>)}</div>
        </section>
        <Evolution rows={evolution} selected={input} />
      </div>
      <div className="space-y-4 min-w-0">
        <SavingsCard summary={summary} period={period} persisted={persisted} />
        <RecentExpenses records={summary.variable} />
      </div>
    </div>
    {manage && <details className={cardClass}>
      <summary className="font-bold cursor-pointer min-h-11 flex items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden"><span>Ingreso y GF aplicado del mes{demo}</span><span aria-hidden="true">▾</span></summary>
      <MonthlyForm key={input} period={period} record={summary.monthly} />
    </details>}
    <details className={cardClass}>
      <summary className="font-bold cursor-pointer min-h-11 flex items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden"><span>Distribución del mes{demo}</span><span aria-hidden="true">▾</span></summary>
      <div className="mt-3">{summary.calculation.status === 'calculated' ? <DistributionDetails distribution={summary.calculation.distribution} />
        : <p className="text-sm">{summary.calculation.status === 'decision_required'
          ? 'Tratamiento pendiente de aprobación: hay déficit o sobrante cero. No se genera distribución.'
          : 'Sin distribución: falta el ingreso o el GF aplicado del mes.'}</p>}</div>
    </details>
  </div>;
}
