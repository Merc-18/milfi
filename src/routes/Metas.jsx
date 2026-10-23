import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { canManage } from '../domain/access.js';
import { summarizeFiorella } from '../domain/fiorellaSession.js';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { useFiorellaPeriod } from '../presentation/fiorellaSession.js';
import { currentPeriodInput, formatAmount, formatPeriod, parsePeriodInput } from '../presentation/format.js';
import { couplePlanCapacity, goalPlan } from '../presentation/goalPlan.js';
import { useStore } from '../store/useStore.js';
import { buttonClass, cardClass, PageHeader, SessionNotice } from '../components/FiorellaSession.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import MonthlyForm from '../components/MonthlyForm.jsx';
import Sheet from '../components/ui/Sheet.jsx';
import GoalCard from '../components/metas/GoalCard.jsx';
import GoalDetail from '../components/metas/GoalDetail.jsx';
import GoalForm from '../components/metas/GoalForm.jsx';
import WhatIfPanel from '../components/metas/WhatIfPanel.jsx';
import { isFinished } from '../components/metas/goalText.js';

const quietClass = 'inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-soft';

// "¿Cuándo llego a mi meta?": capacity from the plan, one list of goals, a detail
// with its path and an ephemeral "¿y si…?" (?simular opens it).
export default function Metas() {
  const manage = canManage(useModuleAccess('fiorella'));
  const { input, period, persisted } = useFiorellaPeriod();
  const records = useStore(state => state.fiorellaDemoRecords);
  const goals = useStore(state => state.savingsGoals);
  const [searchParams, setSearchParams] = useSearchParams();
  const [opened, setOpened] = useState(null);
  const [form, setForm] = useState(null);
  const [monthly, setMonthly] = useState(false);
  const [feedback, setFeedback] = useState('');
  const current = parsePeriodInput(currentPeriodInput());
  const origin = persisted ? 'real' : 'simulated';
  const capacity = useMemo(() => couplePlanCapacity(records, period, origin), [records, period, origin]);
  // The "¿y si…?" starts from the month the capacity comes from.
  const source = capacity.from ? summarizeFiorella(records, capacity.from, origin).monthly : null;
  const base = { income: source?.income ?? '', fixed: source?.appliedFixedExpense ?? '1500' };
  const [whatIf, setWhatIf] = useState(null);
  const simulate = searchParams.has('simular');
  const updateParams = change => setSearchParams(params => { const next = new URLSearchParams(params); change(next); return next; }, { replace: true });
  const openSimulate = () => updateParams(params => params.set('simular', ''));
  const closeSimulate = () => { setWhatIf(null); updateParams(params => params.delete('simular')); };
  const plans = new Map(goals.map(goal => [goal.id, goalPlan(goal, capacity.amount, current)]));
  const active = goals.filter(goal => !isFinished(goal));
  const finished = goals.filter(isFinished);
  const goal = goals.find(item => item.id === opened) ?? null;
  const editing = form === 'new' ? null : goals.find(item => item.id === form) ?? null;
  const card = item => <GoalCard key={item.id} goal={item} plan={plans.get(item.id)} onOpen={setOpened} />;
  return <div className="pb-10 space-y-4">
    <PageHeader title="Metas"><PeriodPicker /></PageHeader>
    <SessionNotice />
    <section className="space-y-3" aria-label="Capacidad de ahorro" data-testid="goal-capacity">
      {capacity.status === 'ready'
        ? <p className="text-sm">Tu plan deja <strong className="tabular-nums">{formatAmount(capacity.amount)}</strong> al mes para metas de pareja
          (según {formatPeriod(capacity.from)}).</p>
        : <div className={`${cardClass} space-y-3`}>
          <p className="text-sm font-bold">Registra el ingreso del mes para estimar tus metas.</p>
          {manage && <button type="button" className={buttonClass} onClick={() => setMonthly(true)}>Registra el ingreso del mes</button>}
        </div>}
      <div className="flex flex-wrap gap-2">
        {manage && <button type="button" className={`${buttonClass} inline-flex min-h-11 items-center gap-2`}
          onClick={() => { setFeedback(''); setForm('new'); }}>
          <Plus size={18} aria-hidden="true" />Nueva meta</button>}
        <button type="button" className={quietClass} onClick={openSimulate}><SlidersHorizontal size={16} aria-hidden="true" />¿Y si…?</button>
      </div>
    </section>
    {!manage && <ReadOnlyNotice>Administra Fiorella.</ReadOnlyNotice>}
    {feedback && <p role="status" className="text-sm font-bold rounded-xl bg-exito/60 px-3 py-2">{feedback}</p>}
    {!goals.length && <p className={cardClass}>Aún no tienes metas.</p>}
    {!!active.length && <ul className="grid gap-3 md:grid-cols-2 items-start" data-testid="goal-list">{active.map(card)}</ul>}
    {!!finished.length && <details className={cardClass} data-testid="finished-goals">
      <summary className="cursor-pointer min-h-11 flex items-center font-bold">Terminadas ({finished.length})</summary>
      <ul className="grid gap-3 md:grid-cols-2 items-start pt-2">{finished.map(card)}</ul>
    </details>}
    <Sheet wide open={!!goal} onClose={() => setOpened(null)} title={goal?.title ?? ''}>
      {goal && <GoalDetail key={`${goal.id}:${goal.revision}:${input}`} goal={goal} capacity={capacity} base={base} current={current}
        editable={manage && goal.origin !== 'real'} onEdit={() => { setOpened(null); setForm(goal.id); }} />}
    </Sheet>
    {manage && <Sheet open={form !== null} onClose={() => setForm(null)} title={editing ? 'Editar meta' : 'Nueva meta'}>
      <GoalForm key={form ?? 'closed'} record={editing} capacity={capacity.amount} onCancel={() => setForm(null)}
        onDone={message => { setFeedback(message); setForm(null); }} />
    </Sheet>}
    <Sheet open={simulate} onClose={closeSimulate} title="¿Y si…?">
      <WhatIfPanel id="page-whatif" values={whatIf ?? base} onChange={setWhatIf} capacity={capacity.amount} current={current} />
    </Sheet>
    {manage && <Sheet open={monthly} onClose={() => setMonthly(false)} title="Ingreso y GF aplicado del mes">
      <MonthlyForm key={input} period={period} record={summarizeFiorella(records, period, origin).monthly} />
    </Sheet>}
  </div>;
}
