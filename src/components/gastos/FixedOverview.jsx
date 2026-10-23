import { compareAmounts } from '../../domain/amounts.js';
import { FINANCIAL_RULES } from '../../domain/financialRules.js';
import { formatAmount } from '../../presentation/format.js';
import { usageBadge } from '../../presentation/status.js';
import Badge from '../ui/Badge.jsx';

const money = value => value == null ? 'Sin registrar' : formatAmount(value);

// The three GF figures, explained once: reserved by the distribution, detailed
// budget by subcategory and actually spent.
export default function FixedOverview({ summary }) {
  const applied = summary.monthly?.appliedFixedExpense ?? null;
  const budget = summary.budget;
  const spent = summary.actual;
  const badge = applied == null ? null : usageBadge(spent.amount ?? '0', applied);
  const aboveReserved = applied != null && budget.amount != null && compareAmounts(budget.amount, applied) > 0;
  const aboveCap = budget.amount != null && compareAmounts(budget.amount, FINANCIAL_RULES.fixedExpenseCap) > 0;
  const figures = [
    ['Reservado (GF aplicado)', money(applied), 'Lo que usa la distribución del mes'],
    ['Presupuesto detallado', money(budget.amount), `${budget.registered}/${budget.expected} subcategorías con presupuesto`],
    ['Gastado', money(spent.amount), `${spent.registered}/${spent.expected} subcategorías con gasto`],
  ];
  return <section className="rounded-[24px] bg-white p-4 shadow-soft space-y-3" data-testid="budget-totals" aria-label="Resumen del gasto fijo">
    <dl className="grid gap-3 sm:grid-cols-3">
      {figures.map(([label, value, detail]) => <div key={label} className="min-w-0">
        <dt className="text-xs font-bold">{label}</dt>
        <dd className="text-lg font-bold tabular-nums break-all">{value}</dd>
        <dd className="text-xs text-texto-light">{detail}</dd>
      </div>)}
    </dl>
    {(badge || aboveReserved) && <div className="flex flex-wrap gap-2">
      {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
      {aboveReserved && <Badge tone="aviso">Presupuesto mayor al reservado</Badge>}
    </div>}
    {aboveReserved && <p className="text-xs">El detalle suma más de lo que reserva la distribución.</p>}
    {aboveCap && <p className="text-xs">El presupuesto detallado supera el tope de {formatAmount(FINANCIAL_RULES.fixedExpenseCap)}.</p>}
  </section>;
}
