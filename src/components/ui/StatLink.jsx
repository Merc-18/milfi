import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { LIGHT_CARD } from '../../presentation/tones.js';
import Badge from './Badge.jsx';

// Compact card that is a link to the detailed view: one figure, its context and
// its states. With `lit`, the first state colors the whole card (traffic light)
// and is written as a word; any other state stays a badge.
export default function StatLink({ to, title, value, detail, badges = [], testId, lit = false }) {
  const [state, ...others] = lit ? badges : [null, ...badges];
  const card = lit ? LIGHT_CARD[state?.tone ?? 'neutral'] : 'bg-white';
  const soft = lit ? '' : 'text-texto-light';
  return <Link to={to} data-testid={testId} data-light={lit ? state?.tone ?? 'neutral' : undefined}
    className={`group block min-w-0 rounded-[24px] p-4 shadow-soft hover:ring-2 hover:ring-texto/40 ${card}`}>
    <span className="flex items-center justify-between gap-2 text-sm font-bold">{title}
      <ChevronRight size={18} aria-hidden="true" className={`shrink-0 ${soft}`} /></span>
    <span className="mt-1 block text-xl font-bold break-all tabular-nums">{value}</span>
    {detail && <span className={`mt-1 block text-xs ${soft}`}>{detail}</span>}
    {state && <span className="mt-2 block text-sm font-bold" data-testid={testId && `${testId}-state`}>{state.text}</span>}
    {!!others.length && <span className="mt-2 flex flex-wrap gap-1">
      {others.map(badge => <Badge key={badge.text} tone={badge.tone}>{badge.text}</Badge>)}</span>}
  </Link>;
}
