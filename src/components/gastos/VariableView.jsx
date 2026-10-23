import { Plus } from 'lucide-react';
import { buttonClass } from '../FiorellaSession.jsx';
import CategoryCards from './CategoryCards.jsx';
import ExpenseList from './ExpenseList.jsx';
import PaceChart from './PaceChart.jsx';

// Variable expenses: the month's pace, what is left per category and the list.
export default function VariableView({ summary, period, today, manage, onNew, onEdit, onMonthly }) {
  return <div className="space-y-4">
    {manage && !!summary.variable.length && <button type="button" onClick={onNew} className={`${buttonClass} inline-flex min-h-11 items-center gap-2`}>
      <Plus size={18} aria-hidden="true" />Registrar gasto</button>}
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <PaceChart key={`${period.year}-${period.month}`} summary={summary} period={period} today={today} manage={manage} onMonthly={onMonthly} />
      <CategoryCards summary={summary} />
    </div>
    {summary.requiresRoundingDecision && <p className="text-sm">Importes con fracciones de céntimo; redondeo pendiente.</p>}
    <ExpenseList key={`${period.year}-${period.month}`} records={summary.variable} period={period} today={today} manage={manage}
      onEdit={onEdit} onNew={onNew} />
  </div>;
}
