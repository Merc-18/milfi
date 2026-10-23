import { useEffect, useRef } from 'react';
import { moneyDifference } from '../../domain/fiorellaSession.js';
import { displayName } from '../../presentation/categoryLabels.js';
import { formatAmount } from '../../presentation/format.js';
import { usageStatus } from '../../presentation/status.js';
import Badge from '../ui/Badge.jsx';
import { BulletTrack } from '../charts/BulletBars.jsx';
import BudgetEditor from './BudgetEditor.jsx';
import { pairText } from './budgetText.js';

// Signed difference budget − actual: "+" in favour, "−" exceeded.
function Difference({ budget, actual }) {
  const { status, amount } = moneyDifference(budget ?? null, actual ?? null);
  if (status === 'unavailable') return null;
  const tone = status === 'over' ? 'excedido' : status === 'remaining' ? 'ok' : 'neutral';
  return <Badge tone={tone}>{status === 'over' ? '−' : status === 'equal' ? '' : '+'}{formatAmount(amount)}</Badge>;
}

// One GF subcategory; tapping the row or "Editar" opens the inline editor and
// closing it returns focus to "Editar".
export default function BudgetRow({ category, record, period, manage, editing, busy, onEdit, onClose, onSaved, onBusy }) {
  const editButton = useRef(null);
  const restoreFocus = useRef(false);
  const close = () => { restoreFocus.current = true; onClose(); };
  useEffect(() => {
    if (restoreFocus.current && !editing && !busy) {
      restoreFocus.current = false;
      editButton.current?.focus();
    }
  }, [editing, busy]);
  const budget = record?.budgetAmount ?? null;
  const actual = record?.actualAmount ?? null;
  const name = displayName(category);
  const open = event => { if (manage && !busy && !event.target.closest('button')) onEdit(category.id); };
  return <li data-budget-id={category.id} data-fixed-id={category.id} className="border-t border-secundario/60">
    <div onClick={open} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 ${manage ? 'cursor-pointer' : ''}`}>
      <span className="min-w-0 text-sm font-bold [overflow-wrap:anywhere]">{name}</span>
      {manage ? <button ref={editButton} type="button" aria-label={`Editar ${name}`} aria-expanded={editing}
        aria-controls={editing ? `editor-${category.id}` : undefined} disabled={busy} onClick={() => onEdit(category.id)}
        className="min-h-11 min-w-11 underline font-bold text-sm disabled:opacity-40">Editar</button> : <span />}
      <span className="min-w-0 text-xs tabular-nums [overflow-wrap:anywhere]">{pairText(actual, budget)}</span>
      <span className="justify-self-end"><Difference budget={budget} actual={actual} /></span>
      <BulletTrack budget={budget} actual={actual} tone={usageStatus(actual ?? '0', budget) ?? 'neutral'} className="col-span-2 h-2.5 w-full" />
    </div>
    {manage && editing && <div id={`editor-${category.id}`}>
      <BudgetEditor category={category} record={record} period={period} onBusy={onBusy} onCancel={close} onSaved={message => { onSaved(message); close(); }} />
    </div>}
  </li>;
}
