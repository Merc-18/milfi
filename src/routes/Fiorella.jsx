import { sessionCommand, sessionResultMessage, useFiorellaPeriod, usePersisted } from '../presentation/fiorellaSession.js';
import { useMemo, useState } from 'react';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { useLedgerStore } from '../store/ledgerStore.js';
import { formatAmount, formatShortPeriod } from '../presentation/format.js';
import { controlMoney } from '../presentation/control.js';
import { TONE_CLASS } from '../presentation/tones.js';
import { remainingToSpend, savingsStatus, usageStatus } from '../presentation/status.js';
import { addAmounts, compareAmounts, subtractAmounts } from '../domain/amounts.js';
import { inspectLedger } from '../domain/controlLedger.js';
import { fiorellaEvolution, registeredSavingsDeposits, summarizeExpenses } from '../domain/fiorellaDashboard.js';
import DistributionDetails from '../components/DistributionDetails.jsx';
import Badge from '../components/ui/Badge.jsx';
import Sheet from '../components/ui/Sheet.jsx';
import StatLink from '../components/ui/StatLink.jsx';
import StackedBar from '../components/charts/StackedBar.jsx';
import MiniBars from '../components/charts/MiniBars.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import { buttonClass, cardClass, MoneyInput, PageHeader, SessionNotice } from '../components/FiorellaSession.jsx';

const sectionClass = `${cardClass} space-y-3`;
const actionClass = 'inline-flex items-center gap-2 rounded-xl bg-texto text-white font-bold px-4 py-3 min-h-11';
const quietButtonClass = 'inline-flex items-center gap-2 rounded-xl bg-white shadow-soft font-bold px-3 py-2 min-h-11 text-sm hover:bg-principal/60';
const USAGE_TEXT = { ok: 'Vas bien', aviso: 'Cerca del límite', neutral: 'Sin gasto' };
// Missing data is stated as the action that completes it.
const MISSING = {
  'missing-income': 'Registra el ingreso del mes',
  'missing-fixed': 'Registra el GF aplicado',
  deficit: 'Revisa el ingreso: no cubre el GF',
};
const MISSING_READ = {
  'missing-income': 'Falta registrar el ingreso del mes.',
  'missing-fixed': 'Falta registrar el GF aplicado.',
  deficit: 'El ingreso no cubre el GF aplicado.',
};
const SEGMENTS = [['fixed', 'Gastos fijos', 'fill-principal', 'bg-principal'], ['variable', 'Gastos variables', 'fill-acento', 'bg-acento'], ['savings', 'Ahorro', 'fill-exito', 'bg-exito']];

// Badge for spent vs limit; an excess always carries its "−" amount.
function usageBadge(spent, limit) {
  const tone = usageStatus(spent, limit);
  if (!tone) return null;
  return { tone, text: tone === 'excedido' ? `Exceso: −${formatAmount(subtractAmounts(spent, limit))}` : USAGE_TEXT[tone] };
}

function MonthlyForm({ period, record }) {
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
    const result = await save(sessionCommand('monthly-plan', period, base, { income, appliedFixedExpense: fixed, planStatus: projected ? 'projected' : 'actual' }));
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
    {feedback && <p className={`text-sm rounded-xl px-3 py-2 ${feedback.ok ? 'bg-exito/60' : TONE_CLASS.aviso}`} role={feedback.ok ? 'status' : 'alert'}>{feedback.text}</p>}
  </form>;
}

// Empty state: what is missing, as a direct action (only for who can act).
function MissingAction({ status, manage, onEdit }) {
  if (!manage) return <p className="text-sm font-bold">{MISSING_READ[status]}</p>;
  return <button type="button" className={actionClass} onClick={onEdit}><Pencil size={18} aria-hidden="true" />{MISSING[status]}</button>;
}

function RemainingCard({ summary, remaining, manage, onEdit }) {
  const projected = summary.monthly?.planStatus === 'projected';
  const income = summary.monthly?.income;
  const over = remaining.status === 'over';
  return <section className="min-w-0 rounded-[24px] bg-principal/40 p-4 shadow-soft space-y-3" data-testid="remaining" aria-labelledby="remaining-title">
    <div className="flex flex-wrap items-center gap-2">
      <h2 id="remaining-title" className="font-bold">{over ? 'Te pasaste por' : 'Te queda por gastar'}</h2>
      {projected && <Badge tone="aviso">Proyectado</Badge>}
    </div>
    {MISSING[remaining.status] ? <MissingAction status={remaining.status} manage={manage} onEdit={onEdit} /> : <>
      <p className="text-4xl font-bold tabular-nums break-all">{over ? '−' : ''}{formatAmount(remaining.amount)}</p>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={remaining.tone}>{remaining.tone === 'excedido' ? 'Excedido' : USAGE_TEXT[remaining.tone]}</Badge>
        <span>Gastado {formatAmount(remaining.spent)} de {formatAmount(remaining.limit)} para gastos</span>
      </p>
    </>}
    {income != null && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/70 pt-3 text-sm">
      <span>Ingreso del mes: <strong className="break-all">{formatAmount(income)}</strong></span>
      {manage && <button type="button" className={quietButtonClass} onClick={onEdit} aria-label="Editar ingreso y GF aplicado">
        <Pencil size={16} aria-hidden="true" />Editar</button>}
    </div>}
    {summary.requiresRoundingDecision && <p className="text-xs">Hay fracciones de céntimo: se muestran exactas; su redondeo está pendiente.</p>}
  </section>;
}

function DistributionChart({ summary, remaining, deposited, manage, onEdit }) {
  const [detail, setDetail] = useState(false);
  const calculated = summary.calculation.status === 'calculated';
  const distribution = calculated ? summary.calculation.distribution : null;
  const real = { fixed: summary.actual.amount ?? '0', variable: summarizeExpenses(summary).variable.amount ?? '0', savings: deposited ?? '0' };
  const plan = distribution && { fixed: distribution.fixedExpense, variable: distribution.variable.total, savings: distribution.savings.total };
  const realTotal = Object.values(real).reduce(addAmounts, '0');
  const scale = distribution && compareAmounts(realTotal, distribution.income) > 0 ? realTotal : distribution?.income;
  const row = (key, label, values) => ({ key, label, segments: SEGMENTS.map(([id, name, fill]) => ({ key: id, label: name, amount: values[id], fill })) });
  return <section className={sectionClass} data-testid="distribution-chart" aria-labelledby="distribution-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="distribution-title" className="font-bold">Reparto del mes</h2>
      {calculated && <button type="button" className={quietButtonClass} onClick={() => setDetail(true)} aria-haspopup="dialog">Ver detalle</button>}
    </div>
    {!calculated ? <>
      <p className="text-sm text-texto-light">El reparto aparece cuando el ingreso cubre el GF aplicado.</p>
      {MISSING[remaining.status] && <MissingAction status={remaining.status} manage={manage} onEdit={onEdit} />}
    </> : <StackedBar scale={scale} rows={[row('plan', 'Plan', plan), row('real', 'Real', real)]} legend={
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        {SEGMENTS.map(([id, name, , swatch]) => <div key={id} className="min-w-0">
          <dt className="flex items-center gap-2 font-bold"><span className={`h-3 w-3 shrink-0 rounded-sm ${swatch}`} aria-hidden="true" />{name}</dt>
          <dd className="tabular-nums break-all">Plan {formatAmount(plan[id])}</dd>
          <dd className="tabular-nums break-all">Real {id === 'savings' && deposited == null ? 'sin depósitos' : formatAmount(real[id])}</dd>
        </div>)}
      </dl>} />}
    {calculated && <p className="text-xs text-texto-light">Real: gastado hasta hoy y ahorro depositado en Control (PEN). Lo no usado queda en blanco.</p>}
    <Sheet open={detail} onClose={() => setDetail(false)} title="Distribución del mes">
      {distribution && <DistributionDetails distribution={distribution} />}
    </Sheet>
  </section>;
}

function CoupleSavingsChart({ rows, selected }) {
  const items = rows.filter(row => row.key <= selected).slice(-6)
    .map(row => ({ key: row.key, label: formatShortPeriod(row.period), amount: row.couplePlanned }));
  const current = items.find(item => item.key === selected);
  return <section className={sectionClass} data-testid="couple-savings-chart" aria-labelledby="couple-title">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="couple-title" className="font-bold">Ahorro de pareja</h2>
      <span className="text-xs text-texto-light">Plan de los últimos meses</span>
    </div>
    {!items.some(item => item.amount != null) ? <p className="text-sm text-texto-light">Aún no hay meses con plan de ahorro de pareja.</p> : <>
      <MiniBars items={items} selected={selected} label="Ahorro de pareja planificado por mes" />
      <p className="text-sm">Este mes: <strong>{current?.amount == null ? 'sin plan' : formatAmount(current.amount)}</strong></p>
    </>}
  </section>;
}

function RecentExpenses({ records }) {
  const recent = [...records].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || a.id.localeCompare(b.id)).slice(0, 3);
  return <section className={`${cardClass} space-y-2`} aria-labelledby="recent-title">
    <div className="flex items-center justify-between gap-2">
      <h2 id="recent-title" className="font-bold">Últimos gastos</h2>
      <Link to="/fiorella/gastos" className="text-sm underline font-bold min-h-11 flex items-center">Ver todos</Link>
    </div>
    {!recent.length ? <p className="text-sm text-texto-light">Sin gastos este mes.</p> : <ul className="divide-y divide-secundario/60 text-sm">
      {recent.map(record => <li key={record.id} className="flex justify-between gap-3 py-2">
        <span className="min-w-0"><span className="block truncate">{record.description}</span>
          <span className="text-xs text-texto-light">{record.effectiveDate.slice(8)}/{record.effectiveDate.slice(5, 7)} · {record.categoryId === 'salud' ? 'Salud' : 'Ocio'}{record.subcategory ? ` / ${record.subcategory}` : ''}</span></span>
        <span className="font-bold shrink-0">{formatAmount(record.amount)}</span></li>)}
    </ul>}
  </section>;
}

// "¿Cómo voy este mes?": one figure, the month's split and three links to the detail.
export default function Fiorella() {
  const manage = canManage(useModuleAccess('fiorella'));
  const { input, period, summary, persisted } = useFiorellaPeriod();
  const records = useStore(state => state.fiorellaDemoRecords);
  const ledger = useLedgerStore(state => state.records);
  const [editing, setEditing] = useState(false);
  const evolution = useMemo(() => fiorellaEvolution(records, persisted ? 'real' : 'simulated'), [records, persisted]);
  const deposits = useMemo(() => registeredSavingsDeposits(inspectLedger(ledger), period, 'fiorella'), [ledger, period]);
  const remaining = remainingToSpend(summary);
  const expenses = summarizeExpenses(summary);
  const applied = summary.monthly?.appliedFixedExpense ?? null;
  const distribution = summary.calculation.status === 'calculated' ? summary.calculation.distribution : null;
  // Couple savings are compared in soles only; other currencies are listed apart.
  const deposited = persisted ? deposits.groups.find(group => group.currency === 'PEN')?.total ?? null : null;
  const otherDeposits = persisted ? deposits.groups.filter(group => group.currency !== 'PEN') : [];
  const fixedSpent = summary.actual.amount ?? '0';
  const variableSpent = expenses.variable.amount ?? '0';
  const budgetAboveApplied = applied !== null && summary.budget.amount !== null && compareAmounts(summary.budget.amount, applied) > 0;
  const savings = savingsStatus(deposited, distribution?.savings.couple ?? null);
  const savingsText = !distribution ? 'Sin plan del mes' : savings === 'ok' ? 'Plan alcanzado' : 'Aún no alcanza el plan';
  const edit = () => setEditing(true);
  return <div className="pb-10 space-y-4">
    <PageHeader title="Resumen"><PeriodPicker /></PageHeader>
    <SessionNotice />
    {!manage && <ReadOnlyNotice>Administra Fiorella.</ReadOnlyNotice>}
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2 min-w-0">
        <RemainingCard summary={summary} remaining={remaining} manage={manage} onEdit={edit} />
        <DistributionChart summary={summary} remaining={remaining} deposited={deposited} manage={manage} onEdit={edit} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 content-start min-w-0">
        <StatLink to="/fiorella/presupuestos" testId="fixed-stat" title="Gastos fijos" value={formatAmount(fixedSpent)}
          detail={applied === null ? 'Sin GF aplicado' : `de ${formatAmount(applied)} aplicado · ${summary.actual.registered}/${summary.actual.expected} con gasto`}
          badges={[usageBadge(fixedSpent, applied), budgetAboveApplied && { tone: 'aviso', text: 'Presupuesto mayor al GF aplicado' }].filter(Boolean)} />
        <StatLink to="/fiorella/gastos" testId="variable-stat" title="Gastos variables" value={formatAmount(variableSpent)}
          detail={distribution ? `de ${formatAmount(distribution.variable.total)} asignado · ${expenses.variable.count} gasto(s)` : 'Sin asignación del mes'}
          badges={[usageBadge(variableSpent, distribution?.variable.total ?? null)].filter(Boolean)} />
        <StatLink to="/fiorella/simulador" testId="savings-tracking" title="Ahorro de pareja"
          value={deposited == null ? 'Sin depósitos' : controlMoney(deposited, 'PEN')}
          detail={[distribution && `de ${formatAmount(distribution.savings.couple)} planificado`,
            ...otherDeposits.map(group => `también ${controlMoney(group.total, group.currency)}`),
            persisted && deposits.pending > 0 && `${deposits.pending} pendiente(s) de revisión en Control`].filter(Boolean).join(' · ')}
          badges={[{ tone: savings, text: savingsText }]} />
      </div>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <CoupleSavingsChart rows={evolution} selected={input} />
      <RecentExpenses records={summary.variable} />
    </div>
    {manage && <Sheet open={editing} onClose={() => setEditing(false)} title="Ingreso y GF aplicado del mes">
      <MonthlyForm key={input} period={period} record={summary.monthly} />
    </Sheet>}
  </div>;
}
