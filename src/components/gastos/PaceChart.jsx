import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { compareAmounts } from '../../domain/amounts.js';
import { formatAmount } from '../../presentation/format.js';
import { MISSING, MISSING_READ, remainingToSpend } from '../../presentation/status.js';
import { cumulativeVariableSeries, pacePhrase, variablePace } from '../../presentation/variablePace.js';
import CumulativeLine from '../charts/CumulativeLine.jsx';
import { cardClass } from '../FiorellaSession.jsx';

const CHOICES = [['all', 'Ambas'], ['salud', 'Salud'], ['ocio', 'Ocio']];
const choiceClass = active => `rounded-lg px-3 py-2 min-h-11 text-sm ${active ? 'bg-texto text-white font-bold' : 'hover:bg-principal/60'}`;

// The month's spending pace: cumulative line, ideal pace and one sentence.
export default function PaceChart({ summary, period, today, manage, onMonthly }) {
  const [category, setCategory] = useState('all');
  const series = cumulativeVariableSeries(summary, period, category, today);
  const phrase = pacePhrase(variablePace(series), formatAmount);
  const missing = remainingToSpend(summary).status;
  const name = CHOICES.find(([id]) => id === category)[1];
  return <section className={`${cardClass} space-y-3`} aria-labelledby="pace-title" data-testid="pace-chart">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="pace-title" className="font-bold">Ritmo del mes</h2>
      <div role="group" aria-label="Categoría del gráfico" className="flex gap-1 rounded-xl bg-fondo p-1">
        {CHOICES.map(([id, label]) => <button key={id} type="button" aria-pressed={category === id} onClick={() => setCategory(id)}
          className={choiceClass(category === id)}>{label}</button>)}
      </div>
    </div>
    <CumulativeLine series={series} label={`Gasto variable acumulado, ${name === 'Ambas' ? 'Salud y Ocio' : name}`} />
    {phrase && <p className="text-sm font-bold" data-testid="pace-phrase">{phrase}</p>}
    {compareAmounts(series.scheduled, '0') > 0 && <p className="text-xs" data-testid="pace-scheduled">
      Incluye {formatAmount(series.scheduled)} con fecha posterior a hoy.</p>}
    {series.allocation === null && MISSING[missing] && (manage
      ? <button type="button" onClick={onMonthly} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-texto px-4 py-3 font-bold text-white">
        <Pencil size={18} aria-hidden="true" />{MISSING[missing]}</button>
      : <p className="text-sm font-bold">{MISSING_READ[missing]}</p>)}
  </section>;
}
