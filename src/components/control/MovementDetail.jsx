import { controlMoney, kindName, personName, purposeName, statusName, currencyOriginWarning } from '../../presentation/control.js';
import { contributionParts, contributionLabel } from '../../domain/controlContributions.js';
import { formatPeriod } from '../../presentation/format.js';
import { reviewReasons } from '../../presentation/controlLedgerView.js';
import { buttonClass } from '../FiorellaSession.jsx';

const quietClass = 'inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-soft';
const when = value => value ? new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }) : '';
const ACTIONS = { create: 'Alta', edit: 'Edición', delete: 'Eliminación' };

// Everything about one movement; operation ids and revisions only here, small.
export default function MovementDetail({ entry, events, userId, manage, entries, onEdit, onReview }) {
  const { record } = entry;
  const excel = record.provenance?.type === 'control-excel';
  const parts = contributionParts(record);
  const savings = record.kind === 'deposit' && record.purpose === 'savings';
  const who = id => id && id === userId ? 'Tú' : IDS.has(id) ? personName(id) : 'Otro miembro';
  const reviews = [...(record.manualReviews ?? []), ...(record.preimportDecisions ?? [])]
    .sort((a, b) => String(a.reviewedAt).localeCompare(String(b.reviewedAt)));
  const rows = [
    ['Tipo', kindName(record.kind)], ['Destino', purposeName(record.purpose)],
    ...(record.kind === 'deposit' ? [['Aportante', personName(record.contributorId)]] : []),
    ['Monto', controlMoney(record.amount, record.currency)], [record.kind === 'deposit' ? 'Fecha de recepción' : 'Fecha del retiro', record.effectiveDate ?? 'Sin fecha'],
    ['Mes recibido', record.period ? formatPeriod(record.period) : 'Sin mes'],
    ...(savings ? [['Mes del plan asignado', record.planPeriod ? formatPeriod(record.planPeriod) : 'Sin asignación confirmada']] : []),
    ...(record.kind === 'deposit' ? [['Tipo de aporte', contributionLabel(record)], ...(parts.kind !== 'unclassified' && parts.kind !== 'invalid' ? [['Parte habitual', controlMoney(parts.regular, record.currency)], ['Parte extraordinaria', controlMoney(parts.extra, record.currency)]] : [])] : []),
    ['Estado', statusName(entry.status)],
    ['Registrado por', excel ? 'Cargado del Excel' : personName(record.actorId)],
    ['Procedencia', excel ? `Excel: ${record.provenance.sheet}!${record.provenance.operation?.amountRef ?? ''}`
      : record.provenance?.statement ?? 'Registrado en MilFi'],
    ...(record.description ? [['Descripción', record.description]] : []),
  ];
  return <div className="space-y-4" data-testid="movement-detail">
    {reviewReasons(entry, entries).reasons.filter(reason => reason.includes('invertidos')).map(reason => <p key={reason} role="note" className="text-sm">{reason}. Confirma la fecha en el documento original.</p>)}
    {currencyOriginWarning(record) && <p role="note" className="text-sm">{currencyOriginWarning(record)}</p>}
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      {rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-texto-light">{label}</dt>
        <dd className="font-bold [overflow-wrap:anywhere]">{value}</dd></div>)}
    </dl>
    {excel && record.provenance.original?.amount != null && <p className="text-xs">Valor original en el Excel: «{record.provenance.original.amount}»</p>}
    {manage && <div className="flex flex-wrap gap-2">
      {!excel && <button type="button" className={quietClass} onClick={onEdit}>Editar</button>}
      {(entry.status === 'pending' || (savings && entry.status !== 'rejected')) && <button type="button" className={buttonClass} onClick={onReview}>{entry.status !== 'pending' && record.planPeriod ? 'Cambiar mes del plan' : 'Resolver'}</button>}
    </div>}
    <section className="space-y-1 text-sm" aria-label="Revisiones">
      <h3 className="font-bold">Revisiones</h3>
      {!reviews.length ? <p className="text-texto-light">Sin revisiones.</p> : <ul className="space-y-1">{reviews.map(review => <li key={review.id}>
        {review.decision === 'rejected' ? 'Rechazado' : review.decision === 'prepared' ? 'Preparado en la carga' : 'Revisado'}: {review.reason}
        <span className="block text-xs text-texto-light">{review.evidenceReference}, {who(review.reviewedBy)}, {when(review.reviewedAt)}</span></li>)}</ul>}
    </section>
    <section className="space-y-1 text-sm" aria-label="Historial">
      <h3 className="font-bold">Historial</h3>
      {!events.length ? <p className="text-texto-light">Sin cambios registrados.</p> : <ul className="space-y-1">{events.map(event => <li key={event.id}>
        {ACTIONS[event.action] ?? event.action}, {when(event.occurredAt)}, {who(event.actorId)}</li>)}</ul>}
    </section>
    <p className="text-[11px] text-texto-light">Operación {record.provenance?.operationId ?? record.id}. Revisión {record.revision}.</p>
  </div>;
}

const IDS = new Set(['milton', 'fiorella']);
