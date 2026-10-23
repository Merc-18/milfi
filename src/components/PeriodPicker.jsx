import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePeriodStore } from '../store/periodStore.js';
import { parsePeriodInput } from '../presentation/format.js';
import PeriodInput from './PeriodInput.jsx';

const arrowClass = 'shrink-0 min-h-11 min-w-11 rounded-xl bg-white shadow-soft flex items-center justify-center hover:bg-principal/60 disabled:opacity-40';
const fieldClass = 'w-full min-w-0 border border-secundario p-3 rounded-xl bg-white text-center font-bold first-letter:uppercase';

// Month switcher for every module: previous/next buttons plus the native month
// field, over the one shared selected month. onChange runs after each change.
export default function PeriodPicker({ id = 'fiorella-period', onChange }) {
  const input = usePeriodStore(state => state.selectedPeriod);
  const select = usePeriodStore(state => state.selectPeriod);
  // The native field is uncontrolled; remount it only when the month changes from
  // outside (arrows, a saved expense of another month), never while typing in it.
  const [emitted, setEmitted] = useState(input);
  const [seen, setSeen] = useState(input);
  const [version, setVersion] = useState(0);
  if (input !== seen) { setSeen(input); if (input !== emitted) setVersion(value => value + 1); }
  const period = parsePeriodInput(input);
  const apply = value => { const ok = select(value); if (ok) onChange?.(value); return ok; };
  const typed = value => { setEmitted(value); return apply(value); };
  const shift = step => {
    if (!period) return;
    const index = period.year * 12 + period.month - 1 + step;
    apply(`${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`);
  };
  return <div className="flex items-end gap-2">
    <button type="button" className={arrowClass} onClick={() => shift(-1)} disabled={!period} aria-label="Mes anterior"><ChevronLeft size={20} aria-hidden="true" /></button>
    <div className="min-w-0 w-44">
      <PeriodInput key={version} id={id} label="Mes" labelClassName="sr-only" applied={input} onValidChange={typed} className={fieldClass} />
    </div>
    <button type="button" className={arrowClass} onClick={() => shift(1)} disabled={!period} aria-label="Mes siguiente"><ChevronRight size={20} aria-hidden="true" /></button>
  </div>;
}
