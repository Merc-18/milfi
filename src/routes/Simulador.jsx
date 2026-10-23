import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import { sessionResultMessage } from '../presentation/fiorellaSession.js';

const persistenceCodes = new Set(['STALE_REVISION', 'DUPLICATE', 'FORBIDDEN', 'CONSTRAINT_VIOLATION', 'SESSION_EXPIRED', 'NOT_FOUND_OR_FORBIDDEN', 'NOT_CONNECTED', 'PERSISTENCE_ERROR']);
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import { useStore } from '../store/useStore.js';
import ScenarioEditor from '../components/ScenarioEditor.jsx';
import StatusNotice from '../components/StatusNotice.jsx';
import { AmountStatus, buttonClass, cardClass, fieldClass, Help, MoneyInput } from '../components/FiorellaSession.jsx';
import { formatAmount, formatPeriod } from '../presentation/format.js';
import { compareGoalCapacity, compareScenarios, estimateSavingsGoal, projectScenarios } from '../domain/savingsPlanning.js';

const messages = {
  SELECT_PERIODS: 'Selecciona periodos hipotéticos para proyectar su ahorro.',
  ALTERNATIVES_SHARE_PERIOD: 'Hay alternativas del mismo periodo. Elige solo una por mes para no sumar dos veces un mes.',
  DUPLICATE_SCENARIO: 'Un escenario está repetido en la selección.',
  UNRESOLVED_SCENARIO: 'Hay un escenario sin resolver. No se muestra una suma parcial.',
  HYPOTHETICAL_SCENARIO_REQUIRED: 'Solo se admiten escenarios hipotéticos de Fiorella.',
  INVALID_TARGET: 'La meta debe ser un importe positivo, con punto decimal y sin símbolos.',
  INVALID_MONTH_COUNT: 'Indica una cantidad entera y positiva de meses.',
  GOAL_TIMELINE_PENDING: 'Los periodos elegidos no son consecutivos. La relación con el plazo de la meta queda pendiente; no se inventan meses ni una fecha límite.',
};

function RoundingNotice() {
  return <p className="text-sm mt-3">Estimación matemática exacta con redondeo monetario pendiente. No representa dinero confirmado ni un aporte ejecutable.</p>;
}

function ExactRatio({ value }) {
  return value.decimal !== null ? <span className="break-all">{formatAmount(value.decimal)}</span>
    : <span><span className="break-all">S/ {value.numerator} / {value.denominator}</span> (fracción exacta)</span>;
}

function GoalEstimate({ estimate }) {
  if (estimate.status === 'incomplete') return <p className="text-sm">Completa monto y meses para estimar la meta.</p>;
  if (estimate.status !== 'estimated') return <p className="text-sm" role="alert">{messages[estimate.reason]}</p>;
  return <div className="text-sm space-y-3" data-testid="goal-estimate">
    <p>Ahorro de pareja necesario al mes: <strong><ExactRatio value={estimate.monthlyContribution} /></strong></p>
    <p>Ingreso mensual necesario según el Excel, suponiendo GF de S/ 1,500: <strong><ExactRatio value={estimate.requiredIncome} /></strong></p>
    <p>No incluye rendimientos, intereses, saldo inicial ni aportes de otra persona. No calcula una fecha límite.</p>
    {estimate.requiresRoundingDecision && <RoundingNotice />}
  </div>;
}

function GoalForm({ record, onDone, onCancel }) {
  const save = useStore(state => state.saveSavingsGoal);
  const [base] = useState(record);
  const [title, setTitle] = useState(record?.title ?? '');
  const [target, setTarget] = useState(record?.target ?? '');
  const [months, setMonths] = useState(record?.months ?? '');
  const [error, setError] = useState('');
  const estimate = estimateSavingsGoal({ target, months });
  const [saving, setSaving] = useState(false);
  const persisted = useStore(state => !!state.remote);
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    const result = await save({ id: base?.id ?? crypto.randomUUID(), expectedRevision: base?.revision ?? 0,
      title, target, months, occurredAt: new Date().toISOString() });
    setSaving(false);
    if (result.ok) onDone(result.unchanged ? 'La meta no cambió.' : persisted ? 'Meta hipotética guardada en MilFi. Sigue siendo una planificación, no dinero confirmado.' : 'Meta hipotética registrada solo en esta sesión. Se pierde al recargar.');
    else setError(messages[result.errors?.[0]] ?? (persistenceCodes.has(result.errors?.[0]) ? sessionResultMessage(result, persisted) : 'Revisa nombre, monto, meses y revisión de la meta. No se modificó el plan.'));
  };
  return <form aria-label="Meta de ahorro hipotética" onSubmit={submit} className={`${cardClass} space-y-4`}>
    <h2 className="font-bold text-xl">{record ? 'Editar meta hipotética' : 'Planificar una meta de pareja'}</h2>
    <div><label htmlFor="goal-title" className="block text-sm font-bold mb-2">Nombre de la meta · ejemplo propio</label><input id="goal-title" className={fieldClass} value={title} onChange={event => setTitle(event.target.value)} maxLength={120} required /></div>
    <MoneyInput id="goal-target" label="Monto objetivo hipotético (S/)" value={target} onChange={setTarget} />
    <div><label htmlFor="goal-months" className="block text-sm font-bold mb-2">Meses disponibles que tú defines</label><input id="goal-months" type="text" inputMode="numeric" maxLength={16} className={fieldClass} value={months} onChange={event => setMonths(event.target.value)} placeholder="Sin definir" /></div>
    <GoalEstimate estimate={estimate} />
    <button type="submit" className={buttonClass} disabled={saving || estimate.status !== 'estimated'}>{saving ? 'Guardando…' : `${record ? 'Actualizar meta' : persisted ? 'Guardar meta' : 'Registrar meta'}${persisted ? '' : ' · sesión'}`}</button>
    {record && <button type="button" className="block underline" onClick={onCancel}>Cancelar edición de meta</button>}
    {error && <p role="alert" className="text-sm">{error}</p>}
  </form>;
}

function GoalCard({ goal, selected, onEdit }) {
  const comparison = compareGoalCapacity(goal, selected);
  return <article className={`${cardClass} text-sm space-y-3`} data-goal-id={goal.id}>
    <h3 className="font-bold text-lg break-words">{goal.title} · Meta hipotética de pareja</h3>
    <p>Monto: {formatAmount(goal.target)} · Meses definidos: {goal.months} · Revisión {goal.revision}</p>
    <GoalEstimate estimate={estimateSavingsGoal(goal)} />
    {comparison.status === 'compared' ? <div data-testid="goal-capacity">
      <p>Capacidad proyectada de pareja en los periodos elegidos: <strong className="break-all">{formatAmount(comparison.capacity)}</strong></p>
      <p>{comparison.outcome === 'equal' ? 'La proyección coincide matemáticamente con la meta.' : comparison.outcome === 'shortfall' ? `Faltaría ${formatAmount(comparison.difference)}.` : `La proyección superaría la meta en ${formatAmount(comparison.difference)}.`}</p>
      <p>Ahorro personal excluido de esta meta: <span className="break-all">{formatAmount(comparison.personalExcluded)}</span>.</p>
      {comparison.requiresRoundingDecision && <RoundingNotice />}
    </div> : <p>{comparison.reason === 'HORIZON_MISMATCH' ? `Para comparar esta meta, elige ${comparison.required} periodos mensuales distintos. Elegidos: ${comparison.selected}.` : messages[comparison.reason] ?? 'Sin comparación disponible.'}</p>}
    <p>Esta planificación no acredita que se haya alcanzado una meta real.</p>
    {onEdit && <button type="button" onClick={onEdit} className="underline font-bold">Editar meta {goal.title}</button>}
  </article>;
}

const goalStatus = { active: '🟢 Activa', paused: 'En pausa', achieved: 'Lograda', cancelled: 'Cancelada' };

// Goals kept by Fiorella (loaded from her workbook): plans with their original attributes, never deposits.
function SavedGoal({ goal }) {
  const estimate = estimateSavingsGoal(goal);
  return <article className={`${cardClass} text-sm space-y-1`} data-goal-id={goal.id}>
    <p className="flex flex-wrap justify-between gap-2"><span className="font-bold text-base break-words">{goal.title}</span><span>{goalStatus[goal.status] ?? goal.status}</span></p>
    <p>Objetivo: <strong className="break-all">{formatAmount(goal.target)}</strong> · {goal.months} meses{goal.deadlineLabel ? ` · Fecha límite: ${goal.deadlineLabel}` : ''}</p>
    {estimate.status === 'estimated' && <p>Aporte mensual: <strong><ExactRatio value={estimate.monthlyContribution} /></strong></p>}
    {goal.notes && <p className="break-words">{goal.notes}</p>}
  </article>;
}

export default function Simulador() {
  const manage = canManage(useModuleAccess('fiorella'));
  const scenarios = useStore(state => state.simulations);
  const allGoals = useStore(state => state.savingsGoals);
  const persisted = useStore(state => !!state.remote);
  const savedGoals = allGoals.filter(goal => goal.origin === 'real');
  const goals = allGoals.filter(goal => goal.origin !== 'real');
  const [left, setLeft] = useState(''); const [right, setRight] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [editing, setEditing] = useState(null); const [generation, setGeneration] = useState(0);
  const [feedback, setFeedback] = useState('');
  const selected = scenarios.filter(record => selectedIds.includes(record.id));
  const comparison = left && right ? compareScenarios(scenarios.find(record => record.id === left), scenarios.find(record => record.id === right)) : null;
  const projection = projectScenarios(selected);
  const label = (record, index) => `Escenario ${scenarios.length - index} · ${formatPeriod(record.period)} · Ingreso ${formatAmount(record.distribution.income)} · GF ${formatAmount(record.distribution.fixedExpense)}`;
  const goalDone = message => { setFeedback(message); setEditing(null); setGeneration(value => value + 1); };
  return <div className="pb-10 space-y-5 break-words">
    <header className="my-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-bold text-2xl">Simulador y metas de ahorro</h1><p className="text-sm mt-2">Finanzas de Fiorella · Planificación hipotética</p></div>
      <Link to="/fiorella/calculadora" className="inline-flex items-center gap-2 rounded-xl bg-white shadow-soft font-bold px-4 py-2 min-h-11 text-sm"><Calculator size={16} aria-hidden="true" />Simular distribución</Link>
    </header>
    {persisted ? <Help title="Escenarios hipotéticos"><p>Los escenarios solo duran esta sesión. Escenarios y metas no son ingresos, saldos ni depósitos reales y no cambian tus registros GF/GV.</p></Help>
      : <StatusNotice title="Escenarios hipotéticos · Solo esta sesión"><p>Los escenarios y metas no son ingresos, saldos ni depósitos reales. No se trasladan a Control Finanzas M&F. Se pierden al recargar y no cambian tus registros de demostración GF/GV.</p></StatusNotice>}
    {!!savedGoals.length && <section className="space-y-3" data-testid="saved-goals"><h2 className="font-bold text-xl">Metas de Fiorella</h2>
      {savedGoals.map(goal => <SavedGoal key={goal.id} goal={goal} />)}</section>}
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    <details className={cardClass} open><summary className="font-bold cursor-pointer">Crear escenarios de ingreso y GF</summary>
      <ScenarioEditor embedded onSaved={() => setFeedback('Escenario hipotético disponible para comparar. Solo dura esta sesión.')} />
    </details>
    <section className={`${cardClass} space-y-4`}>
      <h2 className="font-bold text-xl">Comparar alternativas</h2>
      <p className="text-sm">Elige dos escenarios. El cambio mostrado corresponde a B respecto de A; las alternativas no se suman.</p>
      {!scenarios.length && <p>No hay escenarios de esta sesión. Crea uno con el formulario.</p>}
      {[['scenario-a', 'Escenario A', left, setLeft], ['scenario-b', 'Escenario B', right, setRight]].map(([id, title, value, setValue]) => <div key={id}><label htmlFor={id} className="block font-bold text-sm mb-2">{title}</label><select id={id} value={value} onChange={event => setValue(event.target.value)} className={fieldClass}><option value="">Selecciona un escenario</option>{scenarios.map((record, index) => <option key={record.id} value={record.id}>{label(record, index)}</option>)}</select></div>)}
      {comparison?.status === 'compared' && <div className="space-y-3" data-testid="scenario-comparison">
        <p className="font-bold text-sm">Comparación hipotética · B respecto de A</p>
        {comparison.rows.map(row => <div key={row.key} className="border-t border-secundario pt-3 text-sm"><h3 className="font-bold">{row.label}</h3>
          <dl className="grid grid-cols-2 gap-2"><div><dt>A</dt><dd className="break-all">{formatAmount(row.left)}</dd></div><div><dt>B</dt><dd className="break-all">{formatAmount(row.right)}</dd></div></dl>
          <p className="break-words mt-2">Cambio B respecto de A: {row.direction === 'higher' ? '+' : row.direction === 'lower' ? '−' : ''}{formatAmount(row.difference)}</p>
        </div>)}
        {comparison.requiresRoundingDecision && <RoundingNotice />}
      </div>}
      {comparison?.status === 'blocked' && <p role="alert" className="text-sm">{comparison.reason === 'SAME_SCENARIO' ? 'Selecciona dos escenarios distintos.' : messages[comparison.reason]}</p>}
    </section>
    <section className={`${cardClass} space-y-4`}>
      <h2 className="font-bold text-xl">Proyección por periodos elegidos</h2>
      <p className="text-sm">Marca una alternativa por mes. No se repiten importes, no se completan meses vacíos y no se agregan tasas ni rendimientos.</p>
      {scenarios.map((record, index) => <label key={record.id} htmlFor={`project-${record.id}`} className="flex gap-3 items-start text-sm py-2 break-words"><input id={`project-${record.id}`} type="checkbox" aria-label={`Proyectar ${label(record, index)}`} className="mt-1 shrink-0" checked={selectedIds.includes(record.id)} onChange={event => setSelectedIds(ids => event.target.checked ? [...ids, record.id] : ids.filter(id => id !== record.id))} />{label(record, index)}</label>)}
      {projection.status === 'projected' ? <div className="space-y-3" data-testid="projection">
        <AmountStatus label="Ahorro personal proyectado · separado de la meta de pareja" amount={projection.personal} />
        <AmountStatus label="Ahorro de pareja proyectado · no depositado" amount={projection.couple} />
        {projection.rows.map(row => <p className="text-sm break-words" key={row.id}>{formatPeriod(row.period)} · Pareja: {formatAmount(row.distribution.savings.couple)} · Acumulado hipotético: {formatAmount(row.cumulativeCouple)}</p>)}
        {projection.requiresRoundingDecision && <RoundingNotice />}
      </div> : <p role={projection.status === 'blocked' ? 'alert' : undefined} className="text-sm">{messages[projection.reason]}</p>}
    </section>
    {manage ? <GoalForm key={`${editing ?? 'new'}:${generation}`} record={goals.find(goal => goal.id === editing)} onDone={goalDone} onCancel={() => goalDone('Edición de meta cancelada.')} /> : <ReadOnlyNotice>Tu usuario puede consultar las finanzas personales de Fiorella, pero no crear, editar ni eliminar sus registros.</ReadOnlyNotice>}
    <section className="space-y-4"><h2 className="font-bold text-xl">Metas hipotéticas{persisted ? '' : ' de esta sesión'}</h2>
      <p className="text-sm">Cada meta se evalúa por separado. No se reserva ni reparte ahorro entre metas, ni se supone que la misma capacidad cubra todas a la vez.</p>
      {!goals.length && <p className={cardClass}>Todavía no registraste metas hipotéticas.</p>}
      {goals.map(goal => <GoalCard key={goal.id} goal={goal} selected={selected} onEdit={manage ? () => setEditing(goal.id) : null} />)}
    </section>
  </div>;
}
