import { useState } from 'react';
import { controlButtonClass as buttonClass, controlFieldClass as fieldClass, controlExplanation, controlMoney, kindName } from '../presentation/control.js';

export default function ControlReviewEditor({ entry, onReview, onCancel, real = false }) {
  const { record } = entry;
  const [draft, setDraft] = useState({ reviewedBy: '', reason: '', evidenceReference: '', decision: 'accepted', acceptPeriodAssignment: false });
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const change = key => event => setDraft(value => ({ ...value, [key]: event.target.value }));
  return <form aria-label={real ? 'Revisión de Control' : 'Revisión demostrativa de Control'} className="space-y-4 rounded-2xl border border-secundario p-4" onSubmit={async event => {
    event.preventDefault();
    setSaving(true);
    const result = await onReview(draft);
    setSaving(false);
    setErrors(result.errors ?? []);
  }}>
    <h2 className="font-bold">{real ? 'Revisión explícita del movimiento' : 'Revisión explícita del ejemplo'}</h2>
    <p className="text-sm">{kindName(record.kind)} · {record.effectiveDate} · {controlMoney(record.amount, record.currency)}. Revisa la fecha, periodo, moneda, importe, aportante, destino y procedencia de esta operación.{real ? ' La revisión queda registrada a tu nombre.' : ' Esta revisión solo afecta a la demostración.'}</p>
    {!real && <div><label htmlFor="control-reviewer" className="block text-sm font-bold mb-2">Responsable declarado de revisión</label><select id="control-reviewer" required className={fieldClass} value={draft.reviewedBy} onChange={change('reviewedBy')}><option value="">Seleccionar</option><option value="milton">Milton</option><option value="fiorella">Fiorella</option></select></div>}
    <div><label htmlFor="control-review-reason" className="block text-sm font-bold mb-2">Motivo y evidencia revisada</label><input id="control-review-reason" required maxLength={1000} className={fieldClass} value={draft.reason} onChange={change('reason')} /></div>
    <div><label htmlFor="control-review-reference" className="block text-sm font-bold mb-2">Referencia verificable dentro del ejemplo</label><input id="control-review-reference" required maxLength={500} className={fieldClass} value={draft.evidenceReference} onChange={change('evidenceReference')} /></div>
    <div><label htmlFor="control-review-decision" className="block text-sm font-bold mb-2">Decisión sobre el ejemplo</label><select id="control-review-decision" className={fieldClass} value={draft.decision} onChange={change('decision')}><option value="accepted">{real ? 'Marcar como revisado' : 'Marcar como demo revisada'}</option><option value="rejected">{real ? 'Rechazar movimiento' : 'Rechazar ejemplo'}</option></select></div>
    {entry.pendingReasons.includes('PERIOD_ASSIGNMENT_REVIEW_REQUIRED') && <div><input id="control-review-period" type="checkbox" checked={draft.acceptPeriodAssignment} onChange={event => setDraft(value => ({ ...value, acceptPeriodAssignment: event.target.checked }))} /><label htmlFor="control-review-period" className="text-sm ml-2">He revisado explícitamente la imputación de esta operación a un periodo distinto de su fecha. El motivo y la referencia anteriores la justifican.</label></div>}
    {!!errors.length && <div role="alert" className="bg-amber-50 p-3 rounded-xl text-sm">{errors.map(error => <p key={error}>{controlExplanation(error)}</p>)}</div>}
    <p className="text-xs">{real ? 'No confirma ni concilia dinero.' : 'No confirma dinero real ni acredita permisos.'} Los tratamientos financieros pendientes no se resuelven con esta revisión.</p>
    <div className="flex flex-wrap gap-3"><button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Guardando…' : real ? 'Guardar revisión' : 'Aplicar revisión demostrativa'}</button><button type="button" className={buttonClass} onClick={onCancel}>Cerrar revisión</button></div>
  </form>;
}
