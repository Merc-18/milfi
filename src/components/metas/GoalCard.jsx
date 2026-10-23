import { ChevronRight } from 'lucide-react';
import { formatAmount } from '../../presentation/format.js';
import Badge from '../ui/Badge.jsx';
import { arrivalText, goalBadges, isFinished } from './goalText.js';

// Compact goal: name and target, estimated arrival and what it needs per month.
export default function GoalCard({ goal, plan, onOpen }) {
  const finished = isFinished(goal);
  return <li data-goal-id={goal.id}>
    <button type="button" onClick={() => onOpen(goal.id)} aria-haspopup="dialog"
      className="group w-full min-w-0 space-y-1.5 rounded-[24px] bg-white p-4 text-left shadow-soft hover:ring-2 hover:ring-principal">
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-bold [overflow-wrap:anywhere]">{goal.title}</span>
        <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-texto-light group-hover:text-texto" />
      </span>
      <span className="block text-sm tabular-nums">Objetivo {formatAmount(goal.target)}</span>
      {!finished && plan.months && <span className="block text-sm">{arrivalText(plan)}</span>}
      {!finished && plan.status === 'no-capacity' && <span className="block text-sm">Con tu plan actual no queda ahorro de pareja</span>}
      {!finished && plan.needed && <span className="block text-xs text-texto-light tabular-nums">Necesitas {formatAmount(plan.needed)} al mes</span>}
      <span className="flex flex-wrap gap-1 pt-1">{goalBadges(goal, plan).map(badge => <Badge key={badge.text} tone={badge.tone}>{badge.text}</Badge>)}</span>
    </button>
  </li>;
}
