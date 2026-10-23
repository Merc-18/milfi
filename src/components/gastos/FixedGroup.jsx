import { ChevronDown } from 'lucide-react';
import { usageBadge } from '../../presentation/status.js';
import Badge from '../ui/Badge.jsx';
import BudgetRow from './BudgetRow.jsx';
import { isMissing, pairText } from './budgetText.js';

// One GF group as an accordion: name, actual of budget and a badge in the header.
export default function FixedGroup({ group, open, onToggle, onlyMissing, rowProps }) {
  const rows = onlyMissing ? group.rows.filter(({ record }) => isMissing(record)) : group.rows;
  const badge = group.budget == null ? { tone: 'neutral', text: 'Sin presupuesto' } : usageBadge(group.actual ?? '0', group.budget);
  const partial = group.budgetRegistered < group.expected || group.actualRegistered < group.expected;
  return <section id={`gf-group-${group.id}`} className="rounded-[24px] bg-white shadow-soft min-w-0">
    <h2 className="text-base">
      <button type="button" aria-expanded={open} aria-controls={`gf-rows-${group.id}`} onClick={() => onToggle(group.id)}
        className="flex w-full min-h-11 items-center gap-3 rounded-[24px] p-4 text-left">
        <span className="min-w-0 flex-1" data-testid={`budget-summary-${group.id}`}>
          <span className="block font-bold">{group.name}</span>
          <span className="block text-xs font-normal tabular-nums">{pairText(group.actual, group.budget)}</span>
          {partial && <span className="block text-[11px] font-normal text-texto-light">
            Cobertura parcial: presupuesto {group.budgetRegistered}/{group.expected}, gasto {group.actualRegistered}/{group.expected}</span>}
        </span>
        <Badge tone={badge.tone}>{badge.text}</Badge>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
    </h2>
    <ul id={`gf-rows-${group.id}`} hidden={!open} className="px-4 pb-2">
      {rows.map(({ category, record }) => <BudgetRow key={category.id} category={category} record={record} {...rowProps(category.id)} />)}
    </ul>
  </section>;
}
