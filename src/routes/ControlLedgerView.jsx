import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import StatusNotice from '../components/StatusNotice.jsx';
import PeriodInput from '../components/PeriodInput.jsx';
import ControlMovementEditor from '../components/ControlMovementEditor.jsx';
import ControlReviewEditor from '../components/ControlReviewEditor.jsx';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import { inspectLedger, summarizeLedger } from '../domain/controlLedger.js';
import { useLedgerStore } from '../store/ledgerStore.js';
import { useControlStore } from '../store/controlStore.js';
import { useSessionStore } from '../store/sessionStore.js';
import { formatPeriod, parsePeriodInput } from '../presentation/format.js';
import { controlButtonClass as buttonClass, controlCardClass as cardClass, controlFieldClass as fieldClass,
  controlMoney, controlExplanation, kindName, personName, purposeName } from '../presentation/control.js';

const statusLabels = { pending: 'Pendiente de revisión', reviewed: 'Revisado · no conciliado', rejected: 'Rechazado', invalid: 'Inválido',
  imported: 'Importado del Excel · pendiente de confirmar' };

export default function ControlLedgerView() {
  const manage = canManage(useModuleAccess('control-mf'));
  const userId = useSessionStore(state => state.user?.id ?? null);
  const { status, error, records, events, identity } = useLedgerStore(useShallow(state => ({ status: state.status, error: state.error, records: state.records, events: state.events, identity: state.identity })));
  const periodInput = useControlStore(state => state.selectedPeriod);
  const [editing, setEditing] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [formVersion, setFormVersion] = useState(0);
  const period = parsePeriodInput(periodInput);
  const entries = useMemo(() => inspectLedger(records), [records]);
  const summary = summarizeLedger(entries, period);
  const visible = summary.entries.filter(entry => filter === 'all' || entry.status === filter)
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
  return <div className="pb-10 space-y-5 [overflow-wrap:anywhere]" data-testid="control-ledger">
    <header className="my-6"><h1 className="text-2xl font-bold mb-2">Control Finanzas M&F</h1><p className="text-sm">Administra: Milton · Consultan ambos</p></header>
    {status === 'error' ? <StatusNotice title="No se pudieron cargar los movimientos"><p role="alert">MilFi no pudo leer los datos ({error}). No se muestran cifras incompletas.</p></StatusNotice>
      : <StatusNotice title="Movimientos guardados en MilFi"><p>Los movimientos y sus revisiones se guardan en la base de datos y se ven desde cualquier sesión.{status === 'loading' ? ' Cargando…' : ''} No se calcula un saldo bancario y ninguna revisión confirma dinero. El historial en Excel solo entra mediante la preimportación explícita.</p></StatusNotice>}
    {!manage && <ReadOnlyNotice>Tu usuario puede consultar Control Finanzas M&F, pero no registrar, editar, revisar ni importar movimientos.</ReadOnlyNotice>}
    {manage && <section className={cardClass}><h2 className="font-bold text-lg">Preimportación del Excel de Control</h2>
      <p className="text-sm">Lee un Excel localmente, revisa sus movimientos y guarda solo los preparados.</p>
      <Link to="/control/preimportacion" className="underline font-bold">Abrir preimportación</Link></section>}
    <section className={cardClass}>
      <PeriodInput id="control-selected-period" label="Periodo de consulta" applied={periodInput} className={fieldClass} onValidChange={value => {
        useControlStore.getState().selectPeriod(value); setEditing(null); setReviewing(null); setNotice('');
      }} />
      <div data-testid="control-counts" className="text-sm space-y-2"><p>Depósitos: {summary.deposits}</p><p>Retiros: {summary.withdrawals}</p>
        <p>Pendientes de revisión: {summary.pending}</p><p>Importados del Excel: {summary.imported}</p></div>
      <button type="button" className={buttonClass} onClick={async () => { const result = await useLedgerStore.getState().refresh(); setNotice(result.ok ? 'Datos actualizados.' : controlExplanation(result.errors[0])); }}>Actualizar</button>
    </section>
    <section className={cardClass} data-testid="control-summary">
      <h2 className="font-bold text-lg">Resumen por moneda</h2>
      <p className="text-sm">Solo movimientos revisados de {formatPeriod(period)}. Las monedas no se suman entre sí; depósitos y retiros se muestran por separado, sin saldo neto ni bancario.</p>
      {!summary.groups.length ? <p className="text-sm">Sin movimientos revisados en este periodo.</p>
        : <ul className="space-y-3">{summary.groups.map(group => <li key={[group.currency, group.kind, group.purpose, group.contributorId].join(':')} className="rounded-xl bg-secundario/20 p-3 text-sm">
          <p className="font-bold">{kindName(group.kind)} · {purposeName(group.purpose)} · {group.currency}</p>
          {group.kind === 'deposit' && <p>Aportante: {personName(group.contributorId)}</p>}
          <p className="font-bold">Revisado: {controlMoney(group.total, group.currency)}</p><p>{group.count} movimiento(s). No conciliado.</p>
        </li>)}</ul>}
    </section>
    {manage && <section className={cardClass}>
      <ControlMovementEditor key={`${editing?.id ?? 'new'}-${formVersion}-${periodInput}`} real identity={identity} record={editing} period={periodInput} onSave={save} onCancel={() => setEditing(null)} />
      {notice && <p role="status" className="text-sm bg-secundario/30 rounded-xl p-3">{notice}</p>}
    </section>}
    {!manage && notice && <p role="status" className="text-sm">{notice}</p>}
    {manage && reviewing && <ControlReviewEditor key={`${reviewing.record.id}-${reviewing.record.revision}`} real entry={reviewing} onReview={review} onCancel={() => setReviewing(null)} />}
    <section className="space-y-4" aria-label="Movimientos de Control">
      <h2 className="text-lg font-bold">Movimientos del periodo</h2>
      <div><label htmlFor="control-status" className="block text-sm font-bold mb-2">Estado</label><select id="control-status" className={fieldClass} value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="all">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></div>
      {!visible.length && <p className="text-sm rounded-2xl bg-white p-4">Sin movimientos para este periodo y estado.</p>}
      {visible.map(entry => {
        const { record } = entry;
        const manual = record.provenance?.type === 'control-manual';
        return <article key={record.id} data-ledger-id={record.id} data-ledger-state={entry.status} className={cardClass}>
          <p className={`text-sm font-bold rounded-xl p-3 ${entry.status === 'pending' || entry.status === 'invalid' ? 'bg-amber-50' : entry.status === 'rejected' ? 'bg-rose-50' : 'bg-violet-50'}`}>{statusLabels[entry.status]}</p>
          <h3 className="font-bold">{kindName(record.kind)} · {purposeName(record.purpose)}</h3>
          <p>{controlMoney(record.amount, record.currency)}</p>
          <p className="text-sm">Fecha: {record.effectiveDate ?? 'sin fecha'} · Periodo: {formatPeriod(record.period)}</p>
          <p className="text-sm">Aportante: {personName(record.contributorId)} · Destino: {purposeName(record.purpose)}{manual ? ` · Registrado por: ${personName(record.actorId)}` : ''}</p>
          {record.description && <p className="text-sm">{record.description}</p>}
          <p className="text-sm">{manual ? `Procedencia: ${record.provenance.statement}` : `Excel: ${record.provenance?.sheet}!${record.provenance?.operation?.amountRef}`} · Revisión {record.revision}</p>
          {!!entry.staleReviews && <p className="text-sm font-bold">Hay revisiones anteriores desactualizadas: los datos cambiaron después.</p>}
          {!!entry.pendingReasons.length && <ul className="text-sm space-y-1">{entry.pendingReasons.map(reason => <li key={reason}>{controlExplanation(reason)}</li>)}</ul>}
          {manage && manual && <div className="flex flex-wrap gap-3">
            <button type="button" className={buttonClass} onClick={() => { setEditing(structuredClone(record)); setReviewing(null); setNotice(''); }}>Editar movimiento</button>
            <button type="button" className={buttonClass} onClick={() => { setReviewing(entry); setEditing(null); setNotice(''); }}>Revisar movimiento</button></div>}
          <details className="text-sm"><summary className="cursor-pointer min-h-11 py-3 font-bold">Revisiones y decisiones</summary>
            {[...(record.manualReviews ?? []), ...(record.evidenceReviews ?? []), ...(record.preimportDecisions ?? [])].map(item => <p key={item.id} className="border-t border-secundario py-2">
              {item.decision} · {item.field ?? 'movimiento'} · {item.reviewedBy === userId ? 'Tú' : 'Otro miembro'} · {item.reviewedAt}<br />Motivo: {item.reason} · Referencia: {item.evidenceReference}</p>)}
          </details>
        </article>;
      })}
    </section>
    <section className={cardClass}>
      <h2 className="font-bold">Historial de cambios</h2>
      <p className="text-sm">Registrado por la base de datos; no se puede editar desde la aplicación.</p>
      {!events.length ? <p className="text-sm">Sin cambios registrados.</p> : <ol className="space-y-2 text-sm">{events.slice(-50).reverse().map(event => <li key={event.id}>
        {event.action === 'create' ? 'Alta' : event.action === 'edit' ? 'Edición' : 'Eliminación'} · {event.occurredAt} · {event.actorId === userId ? 'Tú' : 'Otro miembro'}
        {event.after && <> · {kindName(event.after.kind)} {controlMoney(event.after.amount, event.after.currency)}</>}
      </li>)}</ol>}
    </section>
  </div>;
}
