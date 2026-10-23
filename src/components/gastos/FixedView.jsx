import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { compareAmounts } from '../../domain/amounts.js';
import { budgetGroups } from '../../presentation/fixedBudgets.js';
import { copyPreviousBudgets } from '../../presentation/budgetCopy.js';
import { formatPeriod } from '../../presentation/format.js';
import { usageStatus } from '../../presentation/status.js';
import { useStore } from '../../store/useStore.js';
import BulletBars from '../charts/BulletBars.jsx';
import { cardClass } from '../FiorellaSession.jsx';
import CopyBudgetsSheet from './CopyBudgetsSheet.jsx';
import FixedGroup from './FixedGroup.jsx';
import FixedOverview from './FixedOverview.jsx';
import { isMissing } from './budgetText.js';

const toolClass = 'inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-soft disabled:opacity-50';
const exceeded = record => record?.budgetAmount != null && record?.actualAmount != null && compareAmounts(record.actualAmount, record.budgetAmount) > 0;
const needsAttention = group => group.rows.some(({ record }) => isMissing(record) || exceeded(record));
const COPY_REASON = {
  'previous-empty': from => `${formatPeriod(from)} no tiene presupuestos.`.replace(/^./, letter => letter.toUpperCase()),
  'current-complete': () => 'Este mes ya tiene presupuesto en todas las subcategorías.',
  'nothing-to-copy': () => 'Ya tienes presupuesto en todas las subcategorías del mes anterior.',
};

// Fixed expenses: the three GF figures, a bullet chart by group and an accordion
// with inline editing per subcategory.
export default function FixedView({ summary, period, manage, persisted }) {
  const records = useStore(state => state.fiorellaDemoRecords);
  const groups = budgetGroups(summary);
  // Groups open by default while they need attention, also once saved data arrive;
  // a group the user toggled or is editing keeps the user's choice.
  const [chosen, setChosen] = useState(() => new Map());
  const isOpen = group => chosen.get(group.id) ?? needsAttention(group);
  const choose = (id, value) => setChosen(current => new Map(current).set(id, value));
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [copying, setCopying] = useState(false);
  const plan = useMemo(() => copyPreviousBudgets(records, period, persisted ? 'real' : 'simulated'), [records, period, persisted]);
  const toggle = id => choose(id, !isOpen(groups.find(group => group.id === id)));
  const reveal = id => {
    choose(id, true);
    requestAnimationFrame(() => {
      const section = document.getElementById(`gf-group-${id}`);
      section?.scrollIntoView({ block: 'start' });
      section?.querySelector('button')?.focus({ preventScroll: true });
    });
  };
  const shown = onlyMissing ? groups.filter(group => group.rows.some(({ record }) => isMissing(record))) : groups;
  const rowProps = id => ({ period, manage, busy, editing: editing === id, onBusy: setBusy, onClose: () => setEditing(null), onSaved: setFeedback,
    onEdit: target => { setFeedback(null); setEditing(target); choose(groups.find(group => group.rows.some(row => row.category.id === target)).id, true); } });
  const items = groups.map(group => ({ key: group.id, label: group.name, budget: group.budget, actual: group.actual,
    tone: usageStatus(group.actual ?? '0', group.budget) ?? 'neutral' }));
  return <div className="space-y-4" data-testid="fixed-expenses">
    <FixedOverview summary={summary} />
    <section className={`${cardClass} space-y-2`} aria-labelledby="gf-chart-title">
      <h2 id="gf-chart-title" className="font-bold">Por grupo</h2>
      <BulletBars items={items} label="Gasto fijo por grupo frente a su presupuesto" onSelect={reveal} />
    </section>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(value => !value)}
        className={`${toolClass} ${onlyMissing ? 'bg-texto text-white' : ''}`}>Solo sin registrar</button>
      {manage && <button type="button" className={toolClass} disabled={plan.status !== 'ready' || busy} onClick={() => setCopying(true)}
        aria-describedby={plan.status === 'ready' ? undefined : 'copy-reason'}>
        <Copy size={16} aria-hidden="true" />Copiar presupuestos del mes anterior</button>}
    </div>
    {manage && plan.status !== 'ready' && <p id="copy-reason" className="text-xs text-texto-light">{COPY_REASON[plan.status](plan.from)}</p>}
    {feedback && <p role="status" className="text-sm rounded-xl bg-exito/60 px-3 py-2">{feedback}</p>}
    {summary.requiresRoundingDecision && <p className="text-xs">Fracciones de céntimo: se muestran exactas, sin redondear.</p>}
    {onlyMissing && !shown.length && <p className={cardClass}>Todo está registrado este mes.</p>}
    <div className="grid gap-3 items-start" data-testid="budget-groups">
      {shown.map(group => <FixedGroup key={group.id} group={group} open={onlyMissing || isOpen(group)} onToggle={toggle}
        onlyMissing={onlyMissing} rowProps={rowProps} />)}
    </div>
    {/* Stays mounted while open so the result survives the plan becoming empty. */}
    {manage && (copying || plan.status === 'ready') && <CopyBudgetsSheet open={copying} plan={plan} period={period} onClose={() => setCopying(false)} />}
  </div>;
}
