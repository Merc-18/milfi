import { formatAmount, formatPeriod } from '../../presentation/format.js';

export const EXCEL_STATUS = { paused: ['aviso', 'En pausa'], achieved: ['ok', 'Lograda'], cancelled: ['neutral', 'Cancelada'] };
export const isFinished = goal => goal.status === 'achieved' || goal.status === 'cancelled';
export const arrivalText = plan => `Llegas en unos ${plan.months} ${plan.months === 1 ? 'mes' : 'meses'} (${formatPeriod(plan.arrival)})`;

// At most two badges per goal: its plan state and, for workbook goals, a status other than active.
export function goalBadges(goal, plan) {
  const badges = [];
  if (!isFinished(goal)) {
    if (plan.status === 'ok') badges.push({ tone: 'ok', text: 'Vas a tiempo' });
    else if (plan.status === 'aviso') badges.push({ tone: 'aviso', text: `Te faltan ${formatAmount(plan.shortfall)} al mes` });
    else if (plan.status === 'no-estimate') badges.push({ tone: 'neutral', text: 'Sin estimación' });
  }
  const status = goal.origin === 'real' && EXCEL_STATUS[goal.status];
  if (status) badges.push({ tone: status[0], text: status[1] });
  return badges.slice(0, 2);
}
