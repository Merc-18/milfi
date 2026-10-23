import { useEffect, useRef, useState } from 'react';
import ControlLedgerView from './ControlLedgerView.jsx';
import { useLedgerStore } from '../store/ledgerStore.js';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { canManage } from '../domain/access.js';
import Badge from '../components/ui/Badge.jsx';
import StatusNotice from '../components/StatusNotice.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import { usePeriodStore } from '../store/periodStore.js';
import ControlMovementEditor from '../components/ControlMovementEditor.jsx';
import ControlReviewEditor from '../components/ControlReviewEditor.jsx';
import { controlReviewBinding, summarizeControlDemo } from '../domain/controlSession.js';
import { useControlStore } from '../store/controlStore.js';
import { formatPeriod, parsePeriodInput } from '../presentation/format.js';
import { controlButtonClass as buttonClass, controlCardClass as cardClass, controlFieldClass as fieldClass,
  controlMoney, controlExplanation, kindName, personName, purposeName, statusName, statusTone } from '../presentation/control.js';

// Persisted ledger while an authorized session is connected; session demo otherwise.
export default function ControlFinanzas() {
  const persisted = useLedgerStore(state => !!state.persistence);
  return persisted ? <ControlLedgerView /> : <ControlDemoView />;
}

function ControlDemoView() {
  const state = useControlStore();
  const periodInput = usePeriodStore(store => store.selectedPeriod);
  const manage = canManage(useModuleAccess('control-mf'));
  const [editing, setEditing] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [formVersion, setFormVersion] = useState(0);
  const [status, setStatus] = useState('all');
  const [notice, setNotice] = useState('');
  const editorRef = useRef(null);
  const reviewRef = useRef(null);
  useEffect(() => { if (editing) editorRef.current?.scrollIntoView({ block: 'start' }); }, [editing]);
  useEffect(() => { if (reviewing) reviewRef.current?.scrollIntoView({ block: 'start' }); }, [reviewing]);
  const period = parsePeriodInput(periodInput);
  const summary = summarizeControlDemo(state.demoMovements, period);
  const entries = summary.entries.filter(entry => status === 'all' || entry.status === status)
    .sort((a, b) => b.record.effectiveDate.localeCompare(a.record.effectiveDate) || a.record.id.localeCompare(b.record.id));
  const save = draft => {
    const result = state.saveDemo({ ...draft, id: editing?.id ?? crypto.randomUUID(), expectedRevision: editing?.revision ?? 0,
      sessionId: editing?.provenance.sourceId ?? 'control-demo-session', operationId: editing?.provenance.operationId ?? crypto.randomUUID(),
      occurredAt: new Date().toISOString(), eventId: crypto.randomUUID() });
    if (result.ok) {
      setNotice('Ejemplo registrado en memoria; pendiente de revisión. Se perderá al recargar.');
      setEditing(null); setFormVersion(value => value + 1);
    }
    return result;
  };
  const review = draft => {
    const result = state.reviewDemo({ ...draft, id: reviewing.record.id, expectedRevision: reviewing.record.revision,
      eventId: crypto.randomUUID(), reviewId: crypto.randomUUID(), occurredAt: new Date().toISOString() });
    if (result.ok) { setNotice('Revisión demostrativa registrada en memoria. No confirma dinero real.'); setReviewing(null); }
    return result;
  };
  return <div className="pb-10 space-y-5 [overflow-wrap:anywhere]">
    <header className="my-6"><h1 className="text-2xl font-bold mb-2">Control Finanzas M&F</h1><p className="text-sm">Administración prevista: Milton · Consulta de ambos</p></header>
    <StatusNotice title="Historial real pendiente de importación"><p>El Excel de Control contiene operaciones reales. Todavía no se ha importado ningún movimiento; no hay un saldo confirmado para mostrar.</p></StatusNotice>
    {!manage && <ReadOnlyNotice>Tu usuario puede consultar Control Finanzas M&F, pero no registrar, editar, revisar ni preimportar movimientos.</ReadOnlyNotice>}
    <section className={cardClass}>
      <h2 className="font-bold text-sm">Periodo de consulta</h2>
      <PeriodPicker id="control-selected-period" onChange={() => { setEditing(null); setReviewing(null); setNotice(''); }} />
      <div data-testid="control-counts" className="text-sm space-y-2"><p>Depósitos registrados de demo: {summary.deposits}</p><p>Retiros registrados de demo: {summary.withdrawals}</p><p>Movimientos demo pendientes: {summary.pending}</p><p>Movimientos reales confirmados: ninguno importado.</p></div>
    </section>
    <section className={cardClass} data-testid="control-summary">
      <h2 className="font-bold text-lg">Resumen demostrativo por moneda</h2>
      <p className="text-sm">Solo ejemplos revisados de {formatPeriod(period)}. Las monedas no se suman entre sí; depósitos y retiros se muestran por separado, sin calcular un saldo inicial, neto ni bancario.</p>
      {!summary.groups.length ? <p className="text-sm">Sin operaciones demostrativas revisadas para este periodo. No hay importes confirmados.</p>
        : <ul className="space-y-3">{summary.groups.map(group => <li key={[group.currency, group.kind, group.purpose, group.contributorId].join(':')} className="rounded-xl bg-secundario/20 p-3 text-sm">
          <p className="font-bold">{kindName(group.kind)} · {purposeName(group.purpose)} · {group.currency}</p>
          {group.kind === 'deposit' && <p>Aportante: {personName(group.contributorId)}</p>}
          <p className="font-bold">Demo revisada: {controlMoney(group.total, group.currency)}</p><p>{group.count} operación(es) hipotética(s). No es dinero real.</p>
        </li>)}</ul>}
    </section>
    <section className={cardClass}>
      <h2 className="font-bold text-lg">Depósitos por destino</h2><p className="text-sm">Los aportes para gastos y los depósitos para ahorro se mantienen separados. Cada depósito identifica su aportante, su destino y el usuario que lo registra. Ninguna persona se convierte automáticamente en destinataria por aportar.</p>
      <h2 className="font-bold text-lg">Retiros y consulta de saldos</h2><p className="text-sm">Los retiros son movimientos independientes; no se deducen de diferencias entre saldos ni se atribuyen automáticamente a una persona. Los casos cuyo tratamiento requiera aprobación quedan pendientes.</p>
    </section>
    {manage && <section className={cardClass} ref={editorRef}>
      <ControlMovementEditor key={`${editing?.id ?? 'new'}-${formVersion}-${periodInput}`} record={editing} period={periodInput} onSave={save} onCancel={() => setEditing(null)} />
      {notice && <p role="status" className="text-sm bg-secundario/30 rounded-xl p-3">{notice}</p>}
    </section>}
    {manage && reviewing && <section ref={reviewRef}><ControlReviewEditor key={`${reviewing.record.id}-${reviewing.record.revision}`} entry={reviewing} onReview={review} onCancel={() => setReviewing(null)} /></section>}
    <section className="space-y-4" aria-label="Historial de Control">
      <h2 className="text-lg font-bold">Historial y pendientes de validación</h2>
      <div><label htmlFor="control-status" className="block text-sm font-bold mb-2">Estado en el periodo seleccionado</label><select id="control-status" className={fieldClass} value={status} onChange={event => setStatus(event.target.value)}>
        <option value="all">Todas las demostraciones</option><option value="pending">Demo pendiente de revisión</option><option value="reviewed">Demo revisada</option><option value="rejected">Demo rechazada</option><option value="invalid">Demo inválida</option><option value="confirmed">Reales confirmados (aún no importados)</option>
      </select></div>
      {!entries.length && <p className="text-sm rounded-2xl bg-white p-4">{status === 'confirmed' ? 'No se ha importado historial real. Ninguna demostración es un movimiento confirmado.' : 'Sin movimientos demostrativos para este periodo y estado.'}</p>}
      {entries.map(entry => {
        const { record } = entry;
        return <article key={record.id} data-control-id={record.id} data-control-state={entry.status} className={cardClass}>
          <p><Badge tone={statusTone(entry.status)}>{statusName(entry.status)} · Nunca confirmado</Badge></p>
          <h3 className="font-bold">{kindName(record.kind)} · {purposeName(record.purpose)}</h3>
          <p>{controlMoney(record.amount, record.currency)}</p>
          <p className="text-sm">Fecha: {record.effectiveDate} · Periodo: {formatPeriod(record.period)}</p>
          <p className="text-sm">Aportante: {personName(record.contributorId)} · Destino: {purposeName(record.purpose)}</p>
          <p className="text-sm">Registrado por: {personName(record.actorId)} (declarado)</p>
          <p className="text-sm">{record.description || 'Sin descripción'}</p>
          <p className="text-sm">Procedencia manual del ejemplo: {record.provenance.statement}</p>
          <p className="text-xs">Identidad de operación: {record.provenance.operationId} · Revisión {record.revision}</p>
          {!!entry.staleReviews && <p className="text-sm font-bold">{entry.status === 'pending' ? 'Revisión anterior desactualizada: los datos o la evidencia cambiaron.' : 'Hay revisiones anteriores desactualizadas en el historial; no se reutilizan.'}</p>}
          {entry.needsReview && <p className="text-sm">Requiere revisión explícita de los datos y de su procedencia, incluso cuando están completos.</p>}
          {!!entry.pendingReasons.length && <ul className="text-sm space-y-1">{entry.pendingReasons.map(reason => <li key={reason}>{controlExplanation(reason)}</li>)}</ul>}
          {record.distinctOperationReason && <p className="text-sm">Operación coincidente declarada distinta: {record.distinctOperationReason}</p>}
          {manage && <div className="flex flex-wrap gap-3"><button type="button" className={buttonClass} onClick={() => { setEditing(structuredClone(record)); setReviewing(null); setNotice(''); }}>Editar ejemplo</button><button type="button" className={buttonClass} onClick={() => { setReviewing(entry); setEditing(null); setNotice(''); }}>Revisar ejemplo</button></div>}
          <details className="text-sm"><summary className="cursor-pointer min-h-11 py-3 font-bold">Procedencia original y revisiones</summary>
            <p>Declaración original: {record.provenance.original.effectiveDate} · {controlMoney(record.provenance.original.amount, record.provenance.original.currency)}</p>
            <p>Aportante original: {personName(record.provenance.original.contributorId)} · Destino original: {purposeName(record.provenance.original.purpose)} · Registrador original: {personName(record.provenance.enteredBy)}</p>
            <p>Descripción original: {record.provenance.original.description || 'Sin descripción'}</p>
            {!record.demoReviews.length && <p>Sin revisiones demostrativas.</p>}
            {record.demoReviews.map(item => <div key={item.id} className="border-t border-secundario py-3 space-y-1">
              <p>{item.decision === 'accepted' ? 'Aceptación de demo' : 'Rechazo de demo'} · {personName(item.reviewedBy)} · {item.reviewedAt}</p>
              <p>{item.binding === controlReviewBinding(record) ? 'Vinculada a los datos actuales' : 'Desactualizada; no válida para los datos actuales'}</p><p>Motivo: {item.reason}</p><p>Referencia: {item.evidenceReference}</p>
            </div>)}
          </details>
        </article>;
      })}
    </section>
    <section className={cardClass}>
      <h2 className="font-bold">Cambios dentro de la sesión</h2>
      <p className="text-sm">La trazabilidad es temporal y no constituye un registro de auditoría permanente o autenticado.</p>
      {!state.events.length ? <p className="text-sm">Sin cambios en esta sesión.</p> : <ol className="space-y-2 text-sm">{state.events.map(event => <li key={event.id}><details><summary className="cursor-pointer min-h-11 py-3">{event.action === 'create' ? 'Alta' : event.action === 'edit' ? 'Edición' : 'Revisión'} · versión {event.after.revision} · {personName(event.actorId)}</summary>
        <p>{event.occurredAt} · Operación {event.recordId}</p>
        {event.before && <p>Antes: {kindName(event.before.kind)} · {event.before.effectiveDate} · {formatPeriod(event.before.period)} · {controlMoney(event.before.amount, event.before.currency)} · {personName(event.before.contributorId)} · {purposeName(event.before.purpose)} · {event.before.description}</p>}
        <p>Después: {kindName(event.after.kind)} · {event.after.effectiveDate} · {formatPeriod(event.after.period)} · {controlMoney(event.after.amount, event.after.currency)} · {personName(event.after.contributorId)} · {purposeName(event.after.purpose)} · {event.after.description}</p>
        <p>Referencia declarada: {event.after.provenance.statement}</p>
      </details></li>)}</ol>}
    </section>
    <p className="text-sm">Las proyecciones de ahorro personal o de pareja de Fiorella no son depósitos efectivos. La importación real y la conciliación permanecen pendientes; no se han desarrollado en esta fase.</p>
  </div>;
}
