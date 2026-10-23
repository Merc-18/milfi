import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import { useStore } from '../store/useStore.js';
import { summarizeExpenses } from '../domain/fiorellaDashboard.js';
import { useFiorellaPeriod } from '../presentation/fiorellaSession.js';
import { formatAmount, todayInLima } from '../presentation/format.js';
import { PageHeader, SessionNotice } from '../components/FiorellaSession.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import MonthlyForm from '../components/MonthlyForm.jsx';
import Badge from '../components/ui/Badge.jsx';
import Sheet from '../components/ui/Sheet.jsx';
import ExpenseTypeTabs from '../components/gastos/ExpenseTypeTabs.jsx';
import FixedView from '../components/gastos/FixedView.jsx';
import VariableView from '../components/gastos/VariableView.jsx';
import ExpenseSheet from '../components/gastos/ExpenseSheet.jsx';

// Everything spent in the month: fixed (GF budgets and actuals) and variable (GV)
// in two views reflected in ?tipo=; ?nuevo opens the expense sheet.
export default function GastosGV() {
  const manage = canManage(useModuleAccess('fiorella'));
  const { input, period, summary, persisted } = useFiorellaPeriod();
  const records = useStore(state => state.fiorellaDemoRecords);
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState(null);
  const [monthly, setMonthly] = useState(false);
  const [feedback, setFeedback] = useState('');
  const today = todayInLima();
  const view = searchParams.get('tipo') === 'fijos' ? 'fijos' : 'variables';
  const record = summary.variable.find(item => item.id === editing) ?? null;
  const sheetOpen = manage && (searchParams.has('nuevo') || !!record);
  const suggestions = useMemo(() => [...new Set(records.filter(item => item.kind === 'variable-expense' && item.subcategory)
    .map(item => item.subcategory))].sort(), [records]);
  const update = change => setSearchParams(current => { const next = new URLSearchParams(current); change(next); return next; }, { replace: true });
  const openNew = () => { setEditing(null); setFeedback(''); update(params => params.set('nuevo', '')); };
  const closeSheet = () => { setEditing(null); update(params => params.delete('nuevo')); };
  const expenses = summarizeExpenses(summary);
  return <div className="pb-10 space-y-4">
    <PageHeader title="Gastos"><PeriodPicker /></PageHeader>
    <SessionNotice />
    <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="expense-summary">
      <span>Gastado este mes: <strong className="tabular-nums">{formatAmount(expenses.total.amount ?? '0')}</strong></span>
      {expenses.total.partial && <Badge tone="aviso">Parcial</Badge>}
      {summary.monthly?.planStatus === 'projected' && <Badge tone="aviso">Proyectado</Badge>}
    </p>
    {!manage && <ReadOnlyNotice>Administra Fiorella.</ReadOnlyNotice>}
    {feedback && <p role="status" className="text-sm font-bold rounded-xl bg-exito/60 px-3 py-2">{feedback}</p>}
    <ExpenseTypeTabs value={view} onChange={value => update(params => params.set('tipo', value))} />
    <div id="gastos-panel" role="tabpanel" aria-labelledby={`gastos-tab-${view}`}>
      {view === 'fijos'
        ? <FixedView key={`${input}:${manage}`} summary={summary} period={period} manage={manage} persisted={persisted} />
        : <VariableView summary={summary} period={period} today={today} manage={manage} onNew={openNew} onMonthly={() => setMonthly(true)}
          onEdit={item => { setFeedback(''); setEditing(item.id); }} />}
    </div>
    {manage && <ExpenseSheet open={sheetOpen} record={record} input={input} period={period} suggestions={suggestions} onClose={closeSheet}
      onDone={message => { setFeedback(message); closeSheet(); }} />}
    {manage && <Sheet open={monthly} onClose={() => setMonthly(false)} title="Ingreso del mes">
      <MonthlyForm key={input} period={period} record={summary.monthly} />
    </Sheet>}
  </div>;
}
