import { controlMoney, kindName, purposeName } from '../../presentation/control.js';
import { formatShortDate } from '../../presentation/format.js';

// Everything waiting for a person, with its reasons in plain language.
export default function ReviewQueue({ items, manage, onResolve }) {
  return <section id="por-revisar" tabIndex={-1} className="space-y-3 scroll-mt-32" aria-labelledby="review-title" data-testid="control-review">
    <h2 id="review-title" className="font-bold text-lg">Por revisar ({items.length})</h2>
    {!items.length ? <p className="rounded-[24px] bg-white p-4 text-sm shadow-soft">Nada por revisar.</p>
      : <ul className="grid gap-3 lg:grid-cols-2 items-start">{items.map(({ entry, reasons }) => <li key={entry.record.id} data-review-id={entry.record.id}
        className="rounded-[24px] bg-white p-4 shadow-soft space-y-2">
        <p className="flex flex-wrap justify-between gap-2 text-sm font-bold">
          <span>{kindName(entry.record.kind)} de {purposeName(entry.record.purpose).toLowerCase()}
            {entry.record.effectiveDate ? `, ${formatShortDate(entry.record.effectiveDate)}` : ''}</span>
          <span className="tabular-nums">{controlMoney(entry.record.amount, entry.record.currency)}</span></p>
        {entry.record.description && <p className="text-sm [overflow-wrap:anywhere]">{entry.record.description}</p>}
        <ul className="list-disc pl-5 text-sm">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        {manage && <button type="button" className="min-h-11 font-bold underline" onClick={() => onResolve(entry.record.id)}>Resolver</button>}
      </li>)}
    </ul>}
  </section>;
}
