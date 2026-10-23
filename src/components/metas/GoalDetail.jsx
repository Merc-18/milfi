import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { formatAmount } from '../../presentation/format.js';
import { goalPlan, monthsToReach, whatIfCapacity } from '../../presentation/goalPlan.js';
import GoalPath from '../charts/GoalPath.jsx';
import Badge from '../ui/Badge.jsx';
import WhatIfPanel from './WhatIfPanel.jsx';
import { arrivalText, goalBadges, isFinished } from './goalText.js';

const quietClass = 'inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-soft';

// One goal: its path, one interpreting sentence, the assumptions once and the "¿y si…?".
export default function GoalDetail({ goal, capacity, base, current, editable, onEdit }) {
  const [values, setValues] = useState(base);
  const plan = goalPlan(goal, capacity.amount, current);
  const next = whatIfCapacity(values).capacity;
  const changed = values.income !== base.income;
  const alternative = changed && next ? { capacity: next, months: monthsToReach(goal.target, next) } : null;
  const finished = isFinished(goal);
  return <div className="space-y-4" data-testid="goal-detail">
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm tabular-nums">Objetivo <strong>{formatAmount(goal.target)}</strong> en {goal.months} {goal.months === '1' ? 'mes' : 'meses'}</p>
      {goalBadges(goal, plan).map(badge => <Badge key={badge.text} tone={badge.tone}>{badge.text}</Badge>)}
    </div>
    {!finished && plan.status !== 'invalid' && <GoalPath target={goal.target} capacity={capacity.amount} months={plan.months ?? null}
      termMonths={plan.termMonths} alternative={alternative} start={current} label={`Camino a ${goal.title}`} />}
    {!finished && <div className="space-y-1 text-sm" data-testid="goal-reading">
      {plan.months && <p className="font-bold">{arrivalText(plan)}.</p>}
      {plan.status === 'no-capacity' && <p className="font-bold">Con tu plan actual no queda ahorro de pareja. Prueba otro ingreso en «¿y si…?».</p>}
      {plan.status === 'no-estimate' && <p className="font-bold">Registra el ingreso del mes para estimar cuándo llegas.</p>}
      {plan.needed && <p className="tabular-nums">Necesitas {formatAmount(plan.needed)} al mes para lograrla en {plan.termMonths}{' '}
        {plan.termMonths === 1 ? 'mes' : 'meses'}{plan.shortfall ? `; te faltan ${formatAmount(plan.shortfall)} al mes.` : '.'}</p>}
      {plan.requiredIncome && <p className="tabular-nums">Para lograrlo a tiempo necesitarías un ingreso de {formatAmount(plan.requiredIncome)}.</p>}
      <p className="text-xs text-texto-light">Estimación lineal: no incluye intereses, saldo inicial ni lo ya depositado.</p>
    </div>}
    {goal.deadlineLabel && <p className="text-sm">Fecha límite: {goal.deadlineLabel}</p>}
    {goal.notes && <p className="text-sm [overflow-wrap:anywhere]">{goal.notes}</p>}
    {!finished && <details className="rounded-xl bg-fondo">
      <summary className="cursor-pointer min-h-11 flex items-center px-3 font-bold text-sm">¿Y si cambia tu ingreso o tu GF?</summary>
      <div className="px-1 pb-2">
        <WhatIfPanel id="goal-whatif" values={values} onChange={setValues} capacity={capacity.amount} goal={goal} current={current} /></div>
    </details>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      {editable && <button type="button" className={quietClass} onClick={onEdit}><Pencil size={16} aria-hidden="true" />Editar</button>}
      <p className="text-xs text-texto-light">{goal.origin === 'real' ? 'Del Excel de Fiorella. ' : ''}Revisión {goal.revision}.</p>
    </div>
  </div>;
}
