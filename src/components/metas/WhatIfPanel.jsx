import { useState } from 'react';
import { formatAmount, formatPeriod } from '../../presentation/format.js';
import { FINANCIAL_RULES } from '../../domain/financialRules.js';
import { addMonths, monthsToReach, whatIfCapacity } from '../../presentation/goalPlan.js';
import { noticeClass } from '../../presentation/tones.js';
import DistributionDetails from '../DistributionDetails.jsx';
import { MoneyInput } from '../FiorellaSession.jsx';
import Sheet from '../ui/Sheet.jsx';

const ISSUES = {
  INVALID_INCOME: 'Ingresa un ingreso no negativo y finito, usando punto para los decimales.',
};

// Controlled by the parent (values/onChange) so the goal chart can draw C'.
export default function WhatIfPanel({ id = 'whatif', values, onChange, capacity, goal, current }) {
  const [detail, setDetail] = useState(false);
  const { calculation, capacity: next } = whatIfCapacity(values);
  const months = goal && next ? monthsToReach(goal.target, next) : null;
  return <section className="space-y-3 rounded-xl bg-white p-3" aria-label="¿Y si…?" data-testid={`${id}-panel`}>
    <MoneyInput id={`${id}-income`} label="Ingreso mensual (S/)" value={values.income} onChange={income => onChange({ ...values, income })} />
    <p className="text-xs text-texto-light">Con {formatAmount(FINANCIAL_RULES.fixedExpenseCap)} reservados para gastos fijos.</p>
    <div aria-live="polite" className="space-y-1 text-sm" data-testid={`${id}-result`}>
      {calculation.status === 'invalid' && <ul className={noticeClass()}>{calculation.issues.map(issue => <li key={issue}>{ISSUES[issue]}</li>)}</ul>}
      {calculation.status === 'decision_required' && <p className={noticeClass()}>{calculation.reason === 'DEFICIT_POLICY_PENDING'
        ? 'El ingreso es menor que el gasto fijo: no hay reparto.' : 'El sobrante es cero: no hay reparto.'}</p>}
      {next && <p className="font-bold tabular-nums">Ahorro de pareja: {formatAmount(next)} al mes{capacity ? ` (antes ${formatAmount(capacity)})` : ''}</p>}
      {months && <p>Llegarías en unos {months} {months === 1 ? 'mes' : 'meses'} ({formatPeriod(addMonths(current, months - 1))})</p>}
      {calculation.status === 'calculated' && <button type="button" className="min-h-11 font-bold underline" onClick={() => setDetail(true)}
        aria-haspopup="dialog">Ver reparto completo</button>}
    </div>
    <Sheet open={detail} onClose={() => setDetail(false)} title="Reparto con el «¿y si…?»">
      {calculation.status === 'calculated' && <DistributionDetails distribution={calculation.distribution} />}
    </Sheet>
  </section>;
}
