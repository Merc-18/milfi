import { useState } from 'react';
import { applyBudgetCopy } from '../../presentation/budgetCopy.js';
import { displayName } from '../../presentation/categoryLabels.js';
import { sessionResultMessage, usePersisted } from '../../presentation/fiorellaSession.js';
import { formatAmount, formatPeriod } from '../../presentation/format.js';
import { noticeClass } from '../../presentation/tones.js';
import { FIXED_CATEGORIES } from '../../domain/fiorellaCategories.js';
import { useStore } from '../../store/useStore.js';
import { buttonClass } from '../FiorellaSession.jsx';
import Sheet from '../ui/Sheet.jsx';

const groupName = category => FIXED_CATEGORIES.find(group => group.id === category.parentId).name;
const rowClass = 'flex justify-between gap-3 py-2 text-sm';

// Preview first; the plan is frozen when the sheet opens so saving cannot change it.
function CopyPreview({ plan: live, period, onClose }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const persisted = usePersisted();
  const [plan] = useState(live);
  const items = plan.items;
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const copy = async () => {
    setSaving(true);
    setResult(await applyBudgetCopy(items, period, save));
    setSaving(false);
  };
  if (result) return <div className="space-y-3" data-testid="copy-result">
    <p role="status" className="text-sm font-bold">Se guardaron {result.saved.length} de {items.length} presupuestos.</p>
    {!!result.failed.length && <div role="alert" className={noticeClass()}>
      <p className="font-bold">No se guardaron:</p>
      <ul>{result.failed.map(item => <li key={item.category.id}>{displayName(item.category)}: {sessionResultMessage(item.result, persisted)}</li>)}</ul>
    </div>}
    <button type="button" className={buttonClass} onClick={onClose}>Cerrar</button>
  </div>;
  return <div className="space-y-3" data-testid="copy-preview">
    <p className="text-sm">Se rellenan solo las subcategorías sin presupuesto, con el de {formatPeriod(plan.from)}. Lo gastado no se copia.</p>
    <ul className="divide-y divide-secundario/60 rounded-xl bg-white px-3">
      {items.map(item => <li key={item.category.id} className={rowClass}>
        <span className="min-w-0">{displayName(item.category)} <span className="text-xs text-texto-light">{groupName(item.category)}</span></span>
        <span className="shrink-0 font-bold tabular-nums">{formatAmount(item.amount)}</span>
      </li>)}
    </ul>
    <p className={`${rowClass} font-bold`}><span>Total</span><span className="tabular-nums">{formatAmount(plan.total)}</span></p>
    <div className="flex flex-wrap gap-3">
      <button type="button" className={buttonClass} onClick={copy} disabled={saving} data-autofocus>
        {saving ? 'Guardando…' : `Copiar ${items.length} presupuesto${items.length === 1 ? '' : 's'}`}</button>
      <button type="button" className="min-h-11 px-3 underline text-sm" onClick={onClose} disabled={saving}>Cancelar</button>
    </div>
  </div>;
}

export default function CopyBudgetsSheet({ open, plan, period, onClose }) {
  return <Sheet open={open} onClose={onClose} title="Copiar presupuestos del mes anterior">
    <CopyPreview plan={plan} period={period} onClose={onClose} />
  </Sheet>;
}
