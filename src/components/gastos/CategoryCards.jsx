import { moneyDifference } from '../../domain/fiorellaSession.js';
import { formatAmount } from '../../presentation/format.js';
import { usageBadge } from '../../presentation/status.js';
import { topSubcategories } from '../../presentation/variablePace.js';
import Badge from '../ui/Badge.jsx';
import { cardClass } from '../FiorellaSession.jsx';

const width = (amount, max) => `${Math.max(4, (Number(amount) / Number(max)) * 100)}%`;

// What is left in Salud and Ocio, plus their top three subcategories.
export default function CategoryCards({ summary }) {
  return <div className="grid gap-3 sm:grid-cols-2" data-testid="category-cards">
    {summary.categories.map(category => {
      const spent = category.executed.amount ?? '0';
      const left = category.allocation === null ? null : moneyDifference(category.allocation, spent);
      const badge = category.allocation === null ? { tone: 'neutral', text: 'Sin asignación' } : usageBadge(spent, category.allocation);
      const top = topSubcategories(summary.variable, category.id);
      return <section key={category.id} className={`${cardClass} space-y-2`} aria-labelledby={`gv-card-${category.id}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 id={`gv-card-${category.id}`} className="font-bold">{category.name}</h3>
          <Badge tone={badge.tone}>{badge.text}</Badge>
        </div>
        <p className="text-sm tabular-nums">{left === null ? `Gastado ${formatAmount(spent)}`
          : left.status === 'over' ? `Te pasaste por ${formatAmount(left.amount)}`
            : `Te quedan ${formatAmount(left.amount)} de ${formatAmount(category.allocation)}`}</p>
        {!!top.length && <ul className="space-y-1.5" aria-label={`Subcategorías con más gasto en ${category.name}`}>
          {top.map(item => <li key={item.name} className="text-xs">
            <span className="flex justify-between gap-2">
              <span className="truncate">{item.name}</span><span className="tabular-nums">{formatAmount(item.amount)}</span></span>
            <span className="mt-0.5 block h-1.5 rounded-full bg-acento" style={{ width: width(item.amount, top[0].amount) }} aria-hidden="true" />
          </li>)}
        </ul>}
      </section>;
    })}
  </div>;
}
