import { sessionCommand, sessionResultMessage, useDemoLabel, useFiorellaPeriod, usePersisted } from '../presentation/fiorellaSession.js';
import { useMemo, useState } from 'react';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore.js';
import { useLedgerStore } from '../store/ledgerStore.js';
import { formatAmount, formatPeriod } from '../presentation/format.js';
import { controlMoney } from '../presentation/control.js';
import { inspectLedger } from '../domain/controlLedger.js';
import { fiorellaEvolution, registeredSavingsDeposits } from '../domain/fiorellaDashboard.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { addAmounts } from '../domain/amounts.js';
import DistributionDetails from '../components/DistributionDetails.jsx';
import { buttonClass, cardClass, Comparison, FixedTotalComparison, Help, Kpi, MoneyInput, PeriodPicker, Progress, SessionNotice } from '../components/FiorellaSession.jsx';

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
  return <form aria-label={`Datos mensuales${demo ? ' de demostración' : ''}`} onSubmit={submit} className={`${cardClass} space-y-4`}>
    <h2 className="font-bold text-lg">Datos del mes{demo}</h2>
    <MoneyInput id="monthly-income" label={`Ingreso del mes${demo} (S/)`} value={income} onChange={setIncome} />
    <MoneyInput id="monthly-fixed" label="GF aplicado a la distribución (S/) · Tope 1,500" value={fixed} onChange={setFixed} />
    <label htmlFor="monthly-projected" className="flex gap-3 items-start text-sm"><input id="monthly-projected" type="checkbox" className="mt-1 shrink-0" checked={projected} onChange={event => setProjected(event.target.checked)} />Proyección: aún no recibido</label>
    <button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Guardando…' : persisted ? 'Guardar datos del mes' : 'Registrar datos del mes · sesión'}</button>
    {feedback && <p className="text-sm" role={feedback.ok ? 'status' : 'alert'}>{feedback.text}</p>}
    <Help><p>Usa punto decimal. Puedes registrar solo un campo y completar el otro después. El GF aplicado no se calcula a partir del presupuesto detallado ni del gasto registrado.</p></Help>
  </form>;
}

function SavingsCard({ summary, period, persisted }) {
  const records = useLedgerStore(state => state.records);
  const deposits = useMemo(() => registeredSavingsDeposits(inspectLedger(records), period, 'fiorella'), [records, period]);
  const planned = summary.calculation.status === 'calculated' ? summary.calculation.distribution.savings : null;
  return <section className={`${cardClass} space-y-3`} data-testid="savings-tracking">
    <h2 className="font-bold text-lg">Ahorro: planificado y depositado</h2>
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div><p className="font-bold">💜 Pareja · plan</p><p className="break-all">{planned ? formatAmount(planned.couple) : 'Sin distribución'}</p></div>
      <div><p className="font-bold">💜 Pareja · depositado</p>
        {!persisted ? <p>Sin datos de Control</p> : deposits.groups.length ? deposits.groups.map(group => <p key={group.currency} className="break-all">{controlMoney(group.total, group.currency)}</p>) : <p>Sin depósitos revisados</p>}</div>
      <div><p className="font-bold">💚 Personal · plan</p><p className="break-all">{planned ? formatAmount(planned.personal) : 'Sin distribución'}</p></div>
      <div><p className="font-bold">💚 Personal · depositado</p><p>No se registra en MilFi</p></div>
    </div>
    {persisted && deposits.pending > 0 && <p className="text-sm font-bold">{deposits.pending} depósito(s) de ahorro del mes pendientes de revisión en Control.</p>}
    <Help><p>El plan sale de la distribución oficial del mes. Lo depositado son depósitos para ahorro de Fiorella registrados y revisados en Control Finanzas M&F, por moneda. Un ahorro planificado no es un depósito.</p></Help>
  </section>;
}

function Evolution({ rows, selected }) {
  if (!rows.length) return null;
  return <section className={`${cardClass} space-y-3`} data-testid="monthly-evolution">
    <h2 className="font-bold text-lg">Evolución mensual</h2>
    <div className="overflow-x-auto -mx-1"><table className="w-full text-xs min-w-[34rem]">
      <thead><tr className="text-left">{['Mes', 'Ingreso', 'GF real / presup.', 'GV real / asignado', 'Ahorro pareja plan'].map(head => <th key={head} className="p-1 font-bold">{head}</th>)}</tr></thead>
      <tbody>{[...rows].reverse().map(row => <tr key={row.key} className={`border-t border-secundario ${row.key === selected ? 'bg-principal/20' : ''}`}>
        <td className="p-1 capitalize whitespace-nowrap">{formatPeriod(row.period)}{row.projected && <span className="block font-bold">Proyectado</span>}</td>
        <td className="p-1">{row.income == null ? '—' : formatAmount(row.income)}</td>
        <td className="p-1">{row.fixedActual == null ? '—' : formatAmount(row.fixedActual)} / {row.fixedBudget == null ? '—' : formatAmount(row.fixedBudget)}</td>
        <td className="p-1">{row.variableActual == null ? '—' : formatAmount(row.variableActual)} / {row.variablePlanned == null ? '—' : formatAmount(row.variablePlanned)}</td>
        <td className="p-1">{row.couplePlanned == null ? '—' : formatAmount(row.couplePlanned)}</td>
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
  const variableTotal = summary.variable.length ? summary.variable.map(record => record.amount).reduce(addAmounts, '0') : null;
  const variableAllocation = summary.calculation.status === 'calculated' ? summary.calculation.distribution.variable.total : null;
  return <div className="pb-10 space-y-5">
    <header className="my-6"><h1 className="text-2xl font-bold mb-1">Finanzas de Fiorella 🌸</h1><p className="text-sm">Panel mensual · Administra Fiorella · Consultan ambos</p></header>
    <SessionNotice /><PeriodPicker />
    {projected && <p className="text-sm font-bold rounded-xl bg-acento/40 p-3" role="note">Mes proyectado: los importes se escribieron por adelantado y no son ingresos recibidos.</p>}
    <div className="grid grid-cols-2 gap-3" data-testid="monthly-summary">
      <Kpi label={`Ingreso${projected ? ' · proyectado' : ''}${demo}`} amount={summary.monthly?.income} />
      <Kpi label="GF aplicado" amount={summary.monthly?.appliedFixedExpense}><Progress value={summary.monthly?.appliedFixedExpense} limit={FINANCIAL_RULES.fixedExpenseCap} label="GF aplicado frente al tope" /></Kpi>
      <Kpi label={`Gasto GF real${demo}`} amount={summary.actual.amount}>
        <p className="text-xs">Presupuesto: {summary.budget.amount == null ? 'sin registrar' : formatAmount(summary.budget.amount)} · {summary.actual.registered}/{summary.actual.expected} con gasto</p>
        <Progress value={summary.actual.amount} limit={summary.budget.amount} label="Gasto GF frente al presupuesto" />
      </Kpi>
      <Kpi label={`Gasto GV real${demo}`} amount={variableTotal}>
        <p className="text-xs">Asignado: {variableAllocation == null ? 'sin distribución' : formatAmount(variableAllocation)} · {summary.variable.length} gasto(s)</p>
      </Kpi>
    </div>
    <FixedTotalComparison summary={summary} />
    <section className={`${cardClass} space-y-3`}>
      <h2 className="font-bold text-lg">GV · Salud y Ocio</h2>
      {summary.categories.map(category => <div key={category.id} className="text-sm space-y-1">
        <p className="flex flex-wrap justify-between gap-2"><span className="font-bold">{category.name} · {category.percentage}%</span>
          <span>{category.executed.amount == null ? 'S/ 0 anotado' : formatAmount(category.executed.amount)} de {category.allocation == null ? '—' : formatAmount(category.allocation)}</span></p>
        <Progress value={category.executed.amount ?? '0'} limit={category.allocation} label={`${category.name}: gasto frente a lo asignado`} />
        <p><Comparison budget={category.allocation} spent={category.executed.amount} /></p>
      </div>)}
    </section>
    <SavingsCard summary={summary} period={period} persisted={persisted} />
    <Evolution rows={evolution} selected={input} />
    {manage ? <MonthlyForm key={input} period={period} record={summary.monthly} /> : <ReadOnlyNotice>Tu usuario puede consultar las finanzas personales de Fiorella, pero no crear, editar ni eliminar sus registros.</ReadOnlyNotice>}
    <details className={cardClass}>
      <summary className="font-bold text-lg cursor-pointer">Distribución del mes{demo}</summary>
      <div className="mt-3">{summary.calculation.status === 'calculated' ? <DistributionDetails distribution={summary.calculation.distribution} />
        : <p className="text-sm">{summary.calculation.status === 'decision_required'
          ? 'Tratamiento pendiente de aprobación: hay déficit o sobrante cero. No se genera distribución.'
          : 'Sin distribución: completa el ingreso y el GF aplicado del mes.'}</p>}</div>
    </details>
    {summary.requiresRoundingDecision && <p className="text-sm">Hay fracciones de céntimo. Se muestran exactas; su redondeo monetario sigue pendiente.</p>}
    <div className="grid grid-cols-2 gap-3 text-sm font-bold">
      {[
        ['/fiorella/gastos', 'Registrar gasto GV'], ['/fiorella/presupuestos', 'Presupuestos GF'],
        ['/fiorella/historial', 'Historial'], ['/fiorella/simulador', 'Metas y escenarios'],
        ['/fiorella/calculadora', 'Simular distribución'], ['/fiorella/configuracion', 'Reglas oficiales'],
      ].map(([to, label]) => <Link key={to} to={to} className={`${cardClass} underline`}>{label}</Link>)}
    </div>
  </div>;
}
