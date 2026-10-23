import { formatPeriod } from '../../presentation/format.js';
import { fieldClass } from '../FiorellaSession.jsx';

const toInput = period => period ? `${String(period.year).padStart(4, '0')}-${String(period.month).padStart(2, '0')}` : '';
const fromInput = value => { const match = /^(\d{4})-(\d{2})$/.exec(value); return match ? { year: Number(match[1]), month: Number(match[2]) } : null; };
const previous = ({ year, month }) => month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

// "Corresponde al plan de": required, with no default; a shortcut offers the
// previous month without selecting it.
export default function PlanMonthField({ id = 'control-plan', value, onChange, reference }) {
  const shortcut = reference ? previous(reference) : null;
  return <div>
    <label htmlFor={id} className="block font-bold text-sm mb-1">Corresponde al plan de</label>
    <input id={id} type="month" min="0001-01" max="9999-12" required className={fieldClass} value={toInput(value)}
      onChange={event => onChange(fromInput(event.target.value))} />
    {shortcut && <button type="button" className="mt-1 min-h-11 text-sm font-bold underline" onClick={() => onChange(shortcut)}>
      Mes anterior ({formatPeriod(shortcut)})</button>}
  </div>;
}
