import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusNotice from '../components/StatusNotice.jsx';
import { PreimportDecisionForm, PreimportResolutionForm } from '../components/PreimportForms.jsx';
import { usePreimportStore } from '../store/preimportStore.js';
import { inspectPreimport, summarizePreimport } from '../domain/controlPreimport.js';
import { evidenceBinding } from '../domain/excelEvidence.js';
import { formatPeriod } from '../presentation/format.js';
import { controlButtonClass as buttonClass, controlCardClass as cardClass, controlFieldClass as fieldClass, controlMoney, kindName, personName, purposeName } from '../presentation/control.js';
import { categoryLabels, correctableFields, fieldLabels, fileErrorMessage, noteMessages, reasonMessage, resolvableFields } from '../presentation/preimport.js';

const MAX_BYTES = 10 * 1024 * 1024;
const statusLabels = { prepared: 'Preparado para importación futura · no confirmado', pending: 'Pendiente de revisión', rejected: 'Rechazado', invalid: 'Inválido · no se puede preparar' };
const statusTone = { prepared: 'bg-violet-50', pending: 'bg-amber-50', rejected: 'bg-rose-50', invalid: 'bg-rose-50' };
const grouped = amount => { const [whole, fraction = ''] = amount.split('.'); return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`; };
const money = record => record.amount === null ? 'Importe sin interpretar' : record.currency ? controlMoney(record.amount, record.currency) : `${grouped(record.amount)} · moneda pendiente`;

// Records sharing the same evidence for a field, for an explicit bulk decision.
function siblingsFor(entry, entries) {
  const { record } = entry;
  const same = other => other.record.id !== record.id && other.status === 'pending'
    && other.record.provenance.sourceFingerprint === record.provenance.sourceFingerprint;
  return {
    currency: entries.filter(other => same(other) && other.record.currency === null),
    contributorId: record.kind !== 'deposit' ? [] : entries.filter(other => same(other) && other.record.kind === 'deposit'
      && other.record.contributorId === null && other.record.provenance.cells.contributorId === record.provenance.cells.contributorId),
    purpose: entries.filter(other => same(other) && other.pendingReasons.some(reason => /PURPOSE/.test(reason))
      && other.record.provenance.cells.purpose === record.provenance.cells.purpose),
  };
}

function MovementCard({ entry, entries, context, active, setActive, resolveField, decide, setNotice }) {
  const { record } = entry;
  const pendingFields = resolvableFields(entry);
  const fields = correctableFields(entry);
  const source = record.provenance;
  const meta = () => ({ reviewId: crypto.randomUUID(), occurredAt: new Date().toISOString() });
  const close = message => { setActive(null); setNotice(message); };
  const reviews = [...record.evidenceReviews.map(review => ({ ...review, current: review.binding === evidenceBinding(record, review.field, context) })),
    ...record.preimportResolutions.map(review => ({ ...review, current: null }))];
  return <article className={cardClass} data-preimport-id={record.id} data-preimport-status={entry.status}>
    <p className={`text-sm font-bold rounded-xl p-3 ${statusTone[entry.status]}`}>{statusLabels[entry.status]}</p>
    <h3 className="font-bold">{kindName(record.kind)} · {purposeName(record.purpose)}</h3>
    <p className="font-bold">{money(record)}</p>
    <dl className="text-sm grid gap-1">
      <div><dt className="inline font-bold">Origen: </dt><dd className="inline">{source.sheet}!{source.operation.amountRef} · fila {source.row}</dd></div>
      <div><dt className="inline font-bold">Periodo: </dt><dd className="inline">{record.period ? formatPeriod(record.period) : 'Pendiente de revisión'}</dd></div>
      {record.kind === 'withdrawal' && <div><dt className="inline font-bold">Fecha: </dt><dd className="inline">{record.effectiveDate ?? 'Pendiente de revisión'}</dd></div>}
      <div><dt className="inline font-bold">Aportante: </dt><dd className="inline">{record.kind === 'withdrawal' && !record.contributorId ? 'No aplica sin evidencia' : personName(record.contributorId)}</dd></div>
      {record.description && <div><dt className="inline font-bold">Descripción: </dt><dd className="inline">{record.description}</dd></div>}
    </dl>
    <details className="text-sm"><summary className="cursor-pointer min-h-11 py-3 font-bold">Valores originales del Excel y revisiones</summary>
      <ul className="space-y-1">{Object.entries(source.original).map(([field, value]) => <li key={field}>{source.cells[field]}: {value === null ? '(vacía)' : value}</li>)}</ul>
      {!reviews.length && <p className="mt-2">Sin revisiones.</p>}
      {reviews.map(review => <p key={review.id} className="border-t border-secundario py-2 mt-2">{fieldLabels[review.field] ?? review.field} · {personName(review.reviewedBy)} · {review.reviewedAt}
        {review.current === false ? ' · desactualizada' : ''}<br />Motivo: {review.reason} · Referencia: {review.evidenceReference}</p>)}
    </details>
    {!!entry.errors.length && <ul className="text-sm space-y-1">{entry.errors.map(code => <li key={code}>{reasonMessage(code)}</li>)}</ul>}
    {!!entry.pendingReasons.length && <ul className="text-sm space-y-1" aria-label="Advertencias">{entry.pendingReasons.map(code => <li key={code}>⚠ {reasonMessage(code)}</li>)}</ul>}
    {!entry.pendingReasons.length && !entry.errors.length && entry.status === 'pending' && <p className="text-sm">Datos respaldados por evidencia o revisión explícita. Falta la decisión de preparación.</p>}
    {!!entry.staleDecisions && <p className="text-sm font-bold">Hay decisiones anteriores desactualizadas: la operación o su evidencia cambiaron.</p>}
    {entry.status !== 'invalid' && <div className="flex flex-wrap gap-3">
      <button type="button" className={buttonClass} onClick={() => setActive({ id: record.id, mode: 'resolve' })}>{pendingFields.length ? 'Resolver campos' : 'Corregir campos'}</button>
      {entry.status === 'pending' && !entry.pendingReasons.length && <button type="button" className={buttonClass} onClick={() => setActive({ id: record.id, mode: 'prepared' })}>Preparar</button>}
      {entry.status !== 'rejected' && <button type="button" className={buttonClass} onClick={() => setActive({ id: record.id, mode: 'rejected' })}>Rechazar</button>}
    </div>}
    {active?.id === record.id && active.mode === 'resolve' && <PreimportResolutionForm entry={entry} fields={fields} siblings={siblingsFor(entry, entries)}
      onCancel={() => setActive(null)} onSubmit={input => {
        const result = resolveField({ ...input, ...meta(), expectedRevisions: Object.fromEntries(input.recordIds.map(id => [id, entries.find(item => item.record.id === id).record.revision])) });
        if (result.ok) close(`Resolución registrada en ${result.value.length} movimiento(s). Solo dura esta sesión.`);
        return result;
      }} />}
    {active?.id === record.id && active.mode !== 'resolve' && <PreimportDecisionForm decision={active.mode} onCancel={() => setActive(null)} onSubmit={input => {
      const result = decide({ ...input, ...meta(), recordId: record.id, expectedRevision: record.revision });
      if (result.ok) close(input.decision === 'prepared' ? 'Movimiento preparado para una importación futura. No se escribió en el historial real.' : 'Movimiento rechazado en esta sesión.');
      return result;
    }} />}
  </article>;
}

export default function ControlPreimportacion() {
  const { batches, records, context, loadWorkbook, discardWorkbook, resolveField, decide } = usePreimportStore();
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [active, setActive] = useState(null);
  const entries = useMemo(() => inspectPreimport(records, context), [records, context]);
  const visible = entries.filter(entry => filter === 'all' || entry.status === filter || (entry.status === 'pending' && entry.categories.includes(filter))
    || (filter === 'evidence' && entry.categories.includes('evidence') && entry.status !== 'invalid'));
  const onFile = async event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setFileError(''); setNotice(''); setActive(null);
    if (file.size > MAX_BYTES) { setFileError(fileErrorMessage('FILE_TOO_LARGE')); return; }
    setLoading(true);
    try {
      const result = await loadWorkbook(new Uint8Array(await file.arrayBuffer()), file.name);
      if (result.ok) setNotice(`Archivo leído localmente: ${result.batch.recordIds.length} movimiento(s) identificados, todos pendientes de revisión.`);
      else setFileError(fileErrorMessage(result.code));
    } catch {
      setFileError(fileErrorMessage());
    } finally { setLoading(false); }
  };
  return <div className="pb-10 space-y-5 [overflow-wrap:anywhere]">
    <header className="my-6"><h1 className="text-2xl font-bold mb-2">Preimportación de Control</h1><p className="text-sm">Control Finanzas M&F · Revisión previa de un Excel</p></header>
    <StatusNotice title="Procesamiento local y temporal"><p>El archivo se lee en este navegador. No se sube a ningún servidor ni se guarda: al recargar desaparecen el archivo, los movimientos y las revisiones. Nada se escribe en el historial real ni se confirma dinero. No hay autenticación: los responsables se declaran.</p></StatusNotice>
    <Link to="/control" className="underline text-sm font-bold">Volver a Control Finanzas M&F</Link>
    <section className={cardClass}>
      <label htmlFor="preimport-file" className="block font-bold">1. Selecciona el Excel de Control (.xlsx)</label>
      <input id="preimport-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className={fieldClass} onChange={onFile} disabled={loading} />
      <p className="text-xs">No se ejecutan fórmulas, macros ni vínculos. Los archivos .xls, protegidos o con macros se rechazan.</p>
      {loading && <p role="status" className="text-sm">Leyendo el archivo localmente…</p>}
      {fileError && <p role="alert" className="text-sm rounded-xl bg-amber-50 p-3">{fileError}</p>}
      {notice && <p role="status" className="text-sm rounded-xl bg-secundario/30 p-3">{notice}</p>}
    </section>
    {batches.length > 1 && <StatusNotice title="Varias versiones cargadas"><p>Hay {batches.length} archivos en la sesión. Sus movimientos no se concilian, fusionan ni suman entre sí; las coincidencias se señalan para revisión.</p></StatusNotice>}
    {batches.map(batch => {
      const summary = summarizePreimport(entries, batch.fingerprint);
      return <section key={batch.fingerprint} className={cardClass} data-testid="preimport-batch">
        <h2 className="font-bold text-lg">2. Resultado de la lectura · {batch.fileName}</h2>
        <p className="text-xs">Huella SHA-256: <span className="font-mono">{batch.fingerprint}</span></p>
        <p className="text-sm">Hojas: {batch.sheets.map(sheet => `${sheet.name} (${sheet.recognized ? `${sheet.deposits} depósitos, ${sheet.withdrawals} retiros` : 'no reconocida'})`).join(' · ')}</p>
        <div className="grid grid-cols-2 gap-2 text-sm" data-testid="preimport-counts">
          <p>Identificados: <strong>{summary.identified}</strong></p><p>Depósitos: <strong>{summary.deposits}</strong> · Retiros: <strong>{summary.withdrawals}</strong></p>
          <p>Preparados: <strong>{summary.prepared}</strong></p><p>Pendientes: <strong>{summary.pending}</strong></p>
          <p>Rechazados: <strong>{summary.rejected}</strong></p><p>Inválidos: <strong>{summary.invalid}</strong></p>
        </div>
        {!!batch.notes.length && <details className="text-sm"><summary className="cursor-pointer min-h-11 py-3 font-bold">Estructuras detectadas que no se importan ({batch.notes.length})</summary>
          <ul className="space-y-2">{batch.notes.map((note, index) => <li key={index}>{noteMessages[note.code] ?? note.code}{note.refs.length ? ` ${note.sheet}: ${note.refs.join(', ')}` : ''}</li>)}</ul></details>}
        <div data-testid="preimport-prepared-summary"><h3 className="font-bold">Preparados por moneda</h3>
          {!summary.groups.length ? <p className="text-sm">Ningún movimiento preparado todavía.</p> : <ul className="space-y-2 text-sm">{summary.groups.map(group =>
            <li key={[group.currency, group.kind, group.purpose, group.contributorId].join(':')} className="rounded-xl bg-secundario/20 p-3">
              {kindName(group.kind)} · {purposeName(group.purpose)}{group.kind === 'deposit' ? ` · ${personName(group.contributorId)}` : ''}: <strong>{controlMoney(group.total, group.currency)}</strong> ({group.count}) · no confirmado
            </li>)}</ul>}
          <p className="text-xs mt-2">Las monedas no se suman entre sí. No se calcula saldo.</p></div>
        <button type="button" className={buttonClass} onClick={() => { discardWorkbook(batch.fingerprint); setActive(null); setNotice('Archivo descartado de la sesión.'); }}>Descartar este archivo de la sesión</button>
      </section>;
    })}
    {!!entries.length && <section className="space-y-4" aria-label="Movimientos identificados">
      <h2 className="text-lg font-bold">3. Revisa los movimientos</h2>
      <div><label htmlFor="preimport-filter" className="block text-sm font-bold mb-2">Mostrar</label>
        <select id="preimport-filter" className={fieldClass} value={filter} onChange={event => setFilter(event.target.value)}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {!visible.length && <p className="text-sm rounded-2xl bg-white p-4">Ningún movimiento en esta categoría.</p>}
      {visible.map(entry => <MovementCard key={entry.record.id} entry={entry} entries={entries} context={context} active={active} setActive={setActive}
        resolveField={resolveField} decide={decide} setNotice={setNotice} />)}
    </section>}
  </div>;
}
