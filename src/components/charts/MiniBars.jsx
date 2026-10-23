import { formatAmount } from '../../presentation/format.js';

// Small vertical bar chart in SVG for a few months. Heights use Number() only
// for the visual proportion; the selected month is outlined and named in text.
// items: [{ key, label, amount }] (amount may be null: no bar).
export default function MiniBars({ items, selected, label }) {
  const max = Math.max(0, ...items.map(item => item.amount == null ? 0 : Number(item.amount)));
  const description = `${label}: ${items.map(item => `${item.label} ${item.amount == null ? 'sin plan' : formatAmount(item.amount)}`).join(', ')}`;
  return <div>
    <svg viewBox={`0 0 ${items.length * 20} 50`} className="h-28 w-full" role="img" aria-label={description} preserveAspectRatio="none">
      <line x1="0" x2={items.length * 20} y1="49.5" y2="49.5" className="stroke-secundario" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {items.map((item, index) => {
        const height = item.amount == null || max === 0 ? 0 : Math.max(1.5, (Number(item.amount) / max) * 46);
        const current = item.key === selected;
        return <rect key={item.key} x={index * 20 + 4} y={49 - height} width="12" height={height} rx="1.5"
          className={current ? 'fill-exito stroke-texto' : 'fill-exito/60'} strokeWidth={current ? 1.5 : 0} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
    <ol className="grid text-center text-[11px] text-texto-light" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} aria-hidden="true">
      {items.map(item => <li key={item.key} className={item.key === selected ? 'font-bold text-texto' : ''}>{item.label}</li>)}
    </ol>
  </div>;
}
