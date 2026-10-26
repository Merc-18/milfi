import { compareAmounts, normalizeAmount, subtractAmounts } from '../../domain/amounts.js';
import { controlMoney } from '../../presentation/control.js';
import { fieldClass } from '../FiorellaSession.jsx';

const label = (id, text) => <label htmlFor={id} className="block font-bold text-sm mb-1">{text}</label>;

// Type of a deposit (habitual, extraordinary or both in one transfer); a combined
// transfer asks for its extraordinary part and previews the habitual one.
export default function ContributionFields({ record, type, onType, extra, onExtra, amount, currency }) {
  const total = normalizeAmount(amount); const extraValue = normalizeAmount(extra);
  const regular = total !== null && extraValue !== null && compareAmounts(extraValue, total) <= 0 ? subtractAmounts(total, extraValue) : null;
  return <>
    <div>{label('control-contribution-type', 'Tipo de aporte')}
      <select id="control-contribution-type" className={fieldClass} required value={type} onChange={event => onType(event.target.value)}>
        <option value="">Elige el tipo de aporte</option>
        {record && !record.provenance?.contribution && <option value="unclassified">Sin clasificación histórica</option>}
        <option value="habitual">Habitual</option><option value="extraordinary">Extraordinario</option>
        <option value="combined">Habitual + extraordinario (una transferencia)</option>
      </select></div>
    {type === 'combined' && <div>{label('control-extra', 'Parte extraordinaria del importe total')}
      <input id="control-extra" inputMode="decimal" className={fieldClass} required value={extra} onChange={event => onExtra(event.target.value)} />
      <p className="text-sm" aria-live="polite">
        Parte habitual: {regular === null ? 'completa el importe total y el extra' : controlMoney(regular, currency)}. Se guarda una sola transferencia.</p>
    </div>}
  </>;
}
