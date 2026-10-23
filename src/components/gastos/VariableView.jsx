import CategoryCards from './CategoryCards.jsx';
import ExpenseList from './ExpenseList.jsx';
import PaceChart from './PaceChart.jsx';

// Variable expenses: the month's pace, what is left per category and the list.
export default function VariableView({ summary, period, today, manage, onEdit, onMonthly }) {
  return <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <PaceChart key={`${period.year}-${period.month}`} summary={summary} period={period} today={today} manage={manage} onMonthly={onMonthly} />
      <CategoryCards summary={summary} />
    </div>
    {summary.requiresRoundingDecision && <p className="text-sm">Importes con fracciones de céntimo; redondeo pendiente.</p>}
    <ExpenseList key={`${period.year}-${period.month}`} records={summary.variable} period={period} today={today} manage={manage}
      onEdit={onEdit} />
  </div>;
}
