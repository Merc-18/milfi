import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Badge from './Badge.jsx';

// Compact card that is a link to the detailed view: one figure, its context
// and its states as badges (each with its own text).
export default function StatLink({ to, title, value, detail, badges = [], testId }) {
  return <Link to={to} data-testid={testId}
    className="group block min-w-0 rounded-[24px] bg-white p-4 shadow-soft hover:ring-2 hover:ring-principal">
    <span className="flex items-center justify-between gap-2 text-sm font-bold">{title}
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-texto-light group-hover:text-texto" /></span>
    <span className="mt-1 block text-xl font-bold break-all tabular-nums">{value}</span>
    {detail && <span className="mt-1 block text-xs text-texto-light">{detail}</span>}
    {!!badges.length && <span className="mt-2 flex flex-wrap gap-1">
      {badges.map(badge => <Badge key={badge.text} tone={badge.tone}>{badge.text}</Badge>)}</span>}
  </Link>;
}
