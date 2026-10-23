const TABS = [['fijos', 'Fijos'], ['variables', 'Variables']];

// Segmented control as tabs: arrows, Home and End move between views.
export default function ExpenseTypeTabs({ value, onChange }) {
  const move = event => {
    const index = TABS.findIndex(([id]) => id === value);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const [id] = TABS[(next + TABS.length) % TABS.length];
    onChange(id);
    document.getElementById(`gastos-tab-${id}`)?.focus();
  };
  return <div role="tablist" aria-label="Tipo de gasto" onKeyDown={move} className="flex w-fit gap-1 rounded-xl bg-white p-1 shadow-soft">
    {TABS.map(([id, label]) => <button key={id} id={`gastos-tab-${id}`} type="button" role="tab" aria-selected={value === id}
      aria-controls="gastos-panel" tabIndex={value === id ? 0 : -1} onClick={() => onChange(id)}
      className={`rounded-lg px-5 py-2 min-h-11 text-sm ${value === id ? 'bg-texto text-white font-bold' : 'hover:bg-principal/60'}`}>{label}</button>)}
  </div>;
}
