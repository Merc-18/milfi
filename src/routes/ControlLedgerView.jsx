import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import Badge from '../components/ui/Badge.jsx';
import { noticeClass, TONE_CLASS } from '../presentation/tones.js';
import StatusNotice from '../components/StatusNotice.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import ControlMovementEditor from '../components/ControlMovementEditor.jsx';
import ControlReviewEditor from '../components/ControlReviewEditor.jsx';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { Help } from '../components/FiorellaSession.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import { inspectLedger, summarizeLedger } from '../domain/controlLedger.js';
import { controlEvolution } from '../domain/fiorellaDashboard.js';
import { useLedgerStore } from '../store/ledgerStore.js';
import { usePeriodStore } from '../store/periodStore.js';
import { useSessionStore } from '../store/sessionStore.js';
import { formatPeriod, parsePeriodInput } from '../presentation/format.js';
import { controlButtonClass as buttonClass, controlCardClass as cardClass, controlFieldClass as fieldClass,
  controlMoney, controlExplanation, kindName, personName, purposeName, statusTone } from '../presentation/control.js';

const statusLabels = { pending: 'Pendiente de revisión', reviewed: 'Revisado · no conciliado', rejected: 'Rechazado', invalid: 'Inválido',
  imported: 'Revisado · no conciliado' };
// Three distinct operations, never netted against each other.
const OPERATIONS = [['depositsExpenses', 'Depósitos para gastos', 'bg-principal/20'], ['depositsSavings', 'Depósitos para ahorro', 'bg-exito/30'], ['withdrawals', 'Retiros', 'bg-acento/30']];
const operationOf = group => group.kind === 'withdrawal' ? 'withdrawals' : group.purpose === 'savings' ? 'depositsSavings' : 'depositsExpenses';

function PeriodDashboard({ summary }) {
  const currencies = [...new Set(summary.groups.map(group => group.currency))];
  return <section className={cardClass} data-testid="control-summary">
    <h2 className="font-bold text-lg">Resumen del periodo</h2>
    {!currencies.length ? <p className="text-sm">Sin movimientos revisados en este periodo.</p> : currencies.map(currency => <div key={currency} className="grid gap-3">
      {currencies.length > 1 && <h3 className="font-bold text-sm">{currency}</h3>}
      {OPERATIONS.map(([key, label, tone]) => {
        const groups = summary.groups.filter(group => group.currency === currency && operationOf(group) === key);
        return <div key={key} className={`rounded-xl p-3 text-sm ${tone}`}>
          <p className="font-bold">{label}</p>
          {!groups.length ? <p>Sin movimientos revisados</p> : groups.map(group => <p key={`${group.contributorId}:${group.purpose}`} className="break-all">
            {group.kind === 'deposit' ? `${personName(group.contributorId)}: ` : `${purposeName(group.purpose)}: `}<strong>{controlMoney(group.total, group.currency)}</strong> · {group.count} mov.</p>)}
        </div>;
      })}
    </div>)}
    {summary.pending > 0 && <p className={`${noticeClass()} font-bold`} role="note">{summary.pending} movimiento(s) pendientes de revisión: no se incluyen en estos totales.</p>}
    <Help><p>Totales de movimientos revisados (manuales o cargados del Excel con todos sus campos resueltos), por moneda. Las monedas no se suman entre sí y depósitos y retiros se muestran por separado: no es un saldo bancario ni neto, y ninguna revisión confirma ni concilia dinero.</p></Help>
  </section>;
}

function Evolution({ rows, selected }) {
  if (!rows.length) return null;
  return <section className={cardClass} data-testid="control-evolution">
    <h2 className="font-bold text-lg">Evolución mensual</h2>
    <div className="overflow-x-auto -mx-1"><table className="w-full text-xs min-w-[32rem]">
      <thead><tr className="text-left">{['Mes', 'Dep. gastos', 'Dep. ahorro', 'Retiros', 'Pendientes'].map(head => <th key={head} className="p-1 font-bold">{head}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.key} className={`border-t border-secundario align-top ${row.key === selected ? 'bg-principal/20' : ''}`}>
        <td className="p-1 first-letter:uppercase whitespace-nowrap">{formatPeriod(row.period)}</td>
        {['depositsExpenses', 'depositsSavings', 'withdrawals'].map(field => <td key={field} className="p-1">{row.currencies.filter(item => item[field]).map(item => <span key={item.currency} className="block">{controlMoney(item[field], item.currency)}</span>)}{!row.currencies.some(item => item[field]) && '—'}</td>)}
        <td className="p-1">{row.pending || '—'}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}

export default function ControlLedgerView() {
  const manage = canManage(useModuleAccess('control-mf'));
  const userId = useSessionStore(state => state.user?.id ?? null);
  const { status, error, records, events, identity } = useLedgerStore(useShallow(state => ({ status: state.status, error: state.error, records: state.records, events: state.events, identity: state.identity })));
  const periodInput = usePeriodStore(state => state.selectedPeriod);
  const [editing, setEditing] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [kind, setKind] = useState('all');
  const [purpose, setPurpose] = useState('all');
  const [contributor, setContributor] = useState('all');
  const [notice, setNotice] = useState('');
  const [formVersion, setFormVersion] = useState(0);
  const [shown, setShown] = useState(15);
  const period = parsePeriodInput(periodInput);
  const entries = useMemo(() => inspectLedger(records), [records]);
  const evolution = useMemo(() => controlEvolution(entries), [entries]);
  const summary = summarizeLedger(entries, period);
  const visible = summary.entries.filter(entry => (filter === 'all' || entry.status === filter) && (kind === 'all' || entry.record.kind === kind)
    && (purpose === 'all' || entry.record.purpose === purpose) && (contributor === 'all' || entry.record.contributorId === contributor))
    .sort((a, b) => (b.record.effectiveDate ?? '').localeCompare(a.record.effectiveDate ?? '') || a.record.id.localeCompare(b.record.id));
  const save = async draft => {
    const result = await useLedgerStore.getState().saveEntry({ ...draft, id: editing?.id ?? crypto.randomUUID(), expectedRevision: editing?.revision ?? 0,
      operationId: editing ? undefined : crypto.randomUUID() });
    if (result.ok) { setNotice('Movimiento guardado en MilFi, pendiente de revisión.'); setEditing(null); setFormVersion(value => value + 1); }
    return result;
  };
  const review = async draft => {
    const result = await useLedgerStore.getState().review({ ...draft, id: reviewing.record.id, expectedRevision: reviewing.record.revision });
    if (result.ok) { setNotice('Revisión guardada. No confirma ni concilia dinero.'); setReviewing(null); }
    return result;
  };
  const select = (id, label, value, onChange, options) => <div><label htmlFor={id} className="block text-xs font-bold mb-1">{label}</label>
    <select id={id} className={fieldClass} value={value} onChange={event => { onChange(event.target.value); setShown(15); }}><option value="all">Todos</option>{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select></div>;
  return <div className="pb-10 space-y-5 [overflow-wrap:anywhere]" data-testid="control-ledger">
    <header className="flex flex-wrap items-end justify-between gap-3 mt-2 mb-2">
      <h1 className="text-2xl md:text-3xl font-bold">Control Finanzas M&F</h1>
      <div className="flex flex-wrap items-end gap-2">
        <PeriodPicker id="control-selected-period" onChange={() => { setEditing(null); setReviewing(null); setNotice(''); setShown(15); }} />
        <button type="button" className={buttonClass} onClick={async () => { const result = await useLedgerStore.getState().refresh(); setNotice(result.ok ? 'Datos actualizados.' : controlExplanation(result.errors[0])); }}>Actualizar</button>
      </div>
    </header>
    {status === 'error' && <StatusNotice title="No se pudieron cargar los movimientos"><p role="alert">MilFi no pudo leer los datos ({error}). No se muestran cifras incompletas.</p></StatusNotice>}
    {status === 'loading' && <p role="status" className="text-sm">Cargando movimientos…</p>}
    {!manage && <ReadOnlyNotice>Administra Milton.</ReadOnlyNotice>}
    <div data-testid="control-counts" className="flex flex-wrap gap-2 text-sm">{[['Depósitos', summary.deposits], ['Retiros', summary.withdrawals], ['Pendientes', summary.pending]].map(([name, count]) =>
      <span key={name} className={`rounded-xl px-3 py-1 ${name === 'Pendientes' && count ? `${TONE_CLASS.aviso} font-bold` : 'bg-white shadow-soft'}`}>{name}: {count}</span>)}</div>
    {notice && <p role="status" className="text-sm font-bold bg-exito/60 rounded-xl px-3 py-2">{notice}</p>}
    {manage && reviewing && <ControlReviewEditor key={`${reviewing.record.id}-${reviewing.record.revision}`} real entry={reviewing} onReview={review} onCancel={() => setReviewing(null)} />}
    {manage && <details className={cardClass} open={!!editing}>
      <summary className="font-bold cursor-pointer min-h-11 flex items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden"><span>{editing ? 'Editar movimiento' : '+ Registrar movimiento'}</span><span aria-hidden="true">▾</span></summary>
      <ControlMovementEditor key={`${editing?.id ?? 'new'}-${formVersion}-${periodInput}`} real identity={identity} record={editing} period={periodInput} onSave={save} onCancel={() => setEditing(null)} />
    </details>}
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <PeriodDashboard summary={summary} />
      <Evolution rows={evolution} selected={periodInput} />
    </div>
    <section className="space-y-4" aria-label="Movimientos de Control">
      <h2 className="text-lg font-bold">Movimientos del periodo</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div><label htmlFor="control-status" className="block text-xs font-bold mb-1">Estado</label><select id="control-status" className={fieldClass} value={filter} onChange={event => { setFilter(event.target.value); setShown(15); }}>
          <option value="all">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></div>
        {select('control-filter-kind', 'Tipo', kind, setKind, [['deposit', 'Depósito'], ['withdrawal', 'Retiro']])}
        {select('control-filter-purpose', 'Destino', purpose, setPurpose, [['expenses', 'Gastos'], ['savings', 'Ahorro']])}
        {select('control-filter-contributor', 'Aportante', contributor, setContributor, [['milton', 'Milton'], ['fiorella', 'Fiorella']])}
      </div>
      {!visible.length && <p className="text-sm rounded-2xl bg-white p-4">Sin movimientos para este periodo y filtro.</p>}
      <div className="grid gap-3 lg:grid-cols-2 items-start">
      {visible.slice(0, shown).map(entry => {
        const { record } = entry;
        const manual = record.provenance?.type === 'control-manual';
        return <article key={record.id} data-ledger-id={record.id} data-ledger-state={entry.status} className={cardClass}>
          <p className="flex flex-wrap justify-between gap-2"><span className="font-bold">{kindName(record.kind)} · {purposeName(record.purpose)}</span><span className="font-bold">{controlMoney(record.amount, record.currency)}</span></p>
          <p><Badge tone={statusTone(entry.status)}>{statusLabels[entry.status]}</Badge></p>
          <p className="text-sm">{record.effectiveDate ?? 'Sin fecha'} · {formatPeriod(record.period)}{record.kind === 'deposit' ? ` · Aportante: ${personName(record.contributorId)}` : ''}{manual ? ` · Registrado por: ${personName(record.actorId)}` : ''}</p>
          {record.description && <p className="text-sm">{record.description}</p>}
          {!!entry.pendingReasons.length && <ul className="text-sm space-y-1">{entry.pendingReasons.map(reason => <li key={reason}>{controlExplanation(reason)}</li>)}</ul>}
          {!!entry.staleReviews && <p className="text-sm font-bold">Hay revisiones anteriores desactualizadas: los datos cambiaron después.</p>}
          {manage && manual && <div className="flex flex-wrap gap-3">
            <button type="button" className={buttonClass} onClick={() => { setEditing(structuredClone(record)); setReviewing(null); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar movimiento</button>
            <button type="button" className={buttonClass} onClick={() => { setReviewing(entry); setEditing(null); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Revisar movimiento</button></div>}
          <details className="text-sm"><summary className="cursor-pointer min-h-11 py-3 font-bold">Procedencia y revisiones</summary>
            <p className="py-2">{manual ? `Procedencia: ${record.provenance.statement}` : `Excel: ${record.provenance?.sheet}!${record.provenance?.operation?.amountRef}`} · Revisión {record.revision}</p>
            {[...(record.manualReviews ?? []), ...(record.evidenceReviews ?? []), ...(record.preimportDecisions ?? [])].map(item => <p key={item.id} className="border-t border-secundario py-2">
              {item.decision} · {item.field ?? 'movimiento'} · {item.reviewedBy === userId ? 'Tú' : 'Otro miembro'} · {item.reviewedAt}<br />Motivo: {item.reason} · Referencia: {item.evidenceReference}</p>)}
          </details>
        </article>;
      })}
      </div>
      {visible.length > shown && <button type="button" className={buttonClass} onClick={() => setShown(value => value + 15)}>Ver más ({visible.length - shown} restantes)</button>}
    </section>
    <details className={cardClass}>
      <summary className="font-bold cursor-pointer">Historial de cambios ({events.length})</summary>
      <p className="text-sm">Registrado por la base de datos; no se puede editar desde la aplicación.</p>
      {!events.length ? <p className="text-sm">Sin cambios registrados.</p> : <ol className="space-y-2 text-sm">{events.slice(-50).reverse().map(event => <li key={event.id}>
        {event.action === 'create' ? 'Alta' : event.action === 'edit' ? 'Edición' : 'Eliminación'} · {event.occurredAt} · {event.actorId === userId ? 'Tú' : 'Otro miembro'}
        {event.after && <> · {kindName(event.after.kind)} {controlMoney(event.after.amount, event.after.currency)}</>}
      </li>)}</ol>}
    </details>
  </div>;
}
