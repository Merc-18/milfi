import { compareAmounts } from '../../domain/amounts.js';
import { formatAmount } from '../../presentation/format.js';

// Horizontal stacked bars in SVG, one per row, over a common scale. Widths use
// Number() only for the visual proportion; every amount shown stays exact.
// rows: [{ key, label, segments: [{ key, label, amount, fill }] }]
const width = (amount, scale) => amount == null || compareAmounts(scale, '0') === 0 ? 0 : Math.max(0, Number(amount) / Number(scale)) * 100;

export default function StackedBar({ rows, scale, legend }) {
  return <div className="space-y-3">
    {rows.map(row => {
      const description = `${row.label}: ${row.segments.map(segment => `${segment.label} ${segment.amount == null ? 'sin registrar' : formatAmount(segment.amount)}`).join(', ')}`;
      // Segments are laid side by side and clipped to the scale.
      let offset = 0;
      const placed = row.segments.map(segment => {
        const x = offset;
        const size = Math.min(width(segment.amount, scale), 100 - offset);
        offset += size;
        return { ...segment, x, size };
      }).filter(segment => segment.size > 0);
      return <div key={row.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
        <span className="text-xs font-bold">{row.label}</span>
        <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-7 w-full rounded-lg" role="img" aria-label={description}>
          <rect x="0" y="0" width="100" height="10" className="fill-fondo stroke-secundario" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {placed.map(segment => <rect key={segment.key} x={segment.x} y="0" width={segment.size} height="10"
            className={`${segment.fill} stroke-white`} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
        </svg>
      </div>;
    })}
    {legend}
  </div>;
}
