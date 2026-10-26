import { fieldClass } from '../FiorellaSession.jsx';

const FILTER_OPTIONS = [
  ['who', 'movement-person', 'Aportante', [['all', 'Todos'], ['milton', 'Milton'], ['fiorella', 'Fiorella']]],
  ['currency', 'movement-currency', 'Moneda', [['all', 'Todas'], ['PEN', 'Soles'], ['USD', 'Dólares'], ['unknown', 'Por confirmar']]],
  ['purpose', 'movement-purpose', 'Destino', [['all', 'Todos'], ['expenses', 'Gastos'], ['savings', 'Ahorro']]],
];

// Contributor, currency and destination, inside the "Filtros" sheet.
export default function MovementFilters({ filters, onChange }) {
  return <div className="space-y-3">
    {FILTER_OPTIONS.map(([key, id, name, options]) => <div key={key}>
      <label htmlFor={id} className="block text-sm font-bold mb-1">{name}</label>
      <select id={id} className={fieldClass} value={filters[key]} onChange={event => onChange({ ...filters, [key]: event.target.value })}>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
    </div>)}
  </div>;
}
