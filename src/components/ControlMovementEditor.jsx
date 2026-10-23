import { useState } from 'react';
import PeriodInput from './PeriodInput.jsx';
import { parsePeriodInput } from '../presentation/format.js';
import { controlButtonClass as buttonClass, controlFieldClass as fieldClass, controlExplanation } from '../presentation/control.js';

// real: persisted movement of the signed-in Control manager (recorder fixed to that identity).
export default function ControlMovementEditor({ record, period, onSave, onCancel, real = false, identity = null }) {
  const [draft, setDraft] = useState(() => ({ kind: record?.kind ?? 'deposit', effectiveDate: record?.effectiveDate ?? '',
    period: record ? `${String(record.period.year).padStart(4, '0')}-${String(record.period.month).padStart(2, '0')}` : period,
    amount: record?.amount ?? '', currency: record?.currency ?? '', contributorId: record?.contributorId ?? '', purpose: record?.purpose ?? '',
    actorId: real ? identity ?? '' : record?.actorId ?? '', description: record?.description ?? '', provenanceNote: record?.provenance.statement ?? '', distinctOperationReason: '' }));
  const [periodValid, setPeriodValid] = useState(true);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const change = key => event => setDraft(value => ({ ...value, [key]: event.target.value }));
  const submit = async event => {
    event.preventDefault();
    if (!periodValid) return;
    setSaving(true);
    const result = await onSave({ ...draft, period: parsePeriodInput(draft.period), currency: draft.currency || null,
      contributorId: draft.contributorId || null, purpose: draft.purpose || null });
    setSaving(false);
    setErrors(result.errors ?? []);
  };
  return <form aria-label={real ? 'Movimiento de Control' : 'Movimiento demostrativo de Control'} onSubmit={submit} className="space-y-4">
    <h2 className="font-bold text-lg">{real ? (record ? 'Editar movimiento' : 'Registrar movimiento') : record ? 'Editar ejemplo' : 'Nuevo movimiento de demostración'}</h2>
    <p className="text-sm">{real ? 'Se guarda como movimiento real pendiente de revisión. No confirma ni concilia dinero y no calcula saldos.' : 'Introduce solo datos inventados. Declarar al usuario que lo registra no autentica su identidad.'}</p>
    <div><label htmlFor="control-kind" className="block text-sm font-bold mb-2">Operación</label><select id="control-kind" className={fieldClass} value={draft.kind} onChange={change('kind')}><option value="deposit">{real ? 'Depósito' : 'Depósito efectivo hipotético'}</option><option value="withdrawal">{real ? 'Retiro' : 'Retiro efectivo hipotético'}</option></select></div>
    <div><label htmlFor="control-date" className="block text-sm font-bold mb-2">Fecha de operación</label><input id="control-date" type="date" min="0001-01-01" max="9999-12-31" required className={fieldClass} value={draft.effectiveDate} onChange={change('effectiveDate')} /></div>
    <PeriodInput id="control-operation-period" label="Periodo de imputación" applied={draft.period} className={fieldClass} onValidChange={value => setDraft(previous => ({ ...previous, period: value }))} onDraftValidity={setPeriodValid} />
    <div><label htmlFor="control-amount" className="block text-sm font-bold mb-2">{real ? 'Importe' : 'Importe inventado'}</label><input id="control-amount" type="text" inputMode="decimal" required maxLength={100} className={fieldClass} value={draft.amount} onChange={change('amount')} placeholder="Sin símbolo de moneda" /></div>
    <div><label htmlFor="control-currency" className="block text-sm font-bold mb-2">Moneda explícita</label><input id="control-currency" type="text" maxLength={3} className={fieldClass} value={draft.currency} onChange={change('currency')} placeholder="PEN, USD o vacío si está pendiente" /><p className="text-xs mt-1">No se deduce del aportante, del destino ni del Excel.</p></div>
    <div><label htmlFor="control-contributor" className="block text-sm font-bold mb-2">Aportante {draft.kind === 'withdrawal' ? '(opcional; no es el receptor)' : ''}</label><select id="control-contributor" className={fieldClass} value={draft.contributorId} onChange={change('contributorId')}><option value="">Sin identificar</option><option value="milton">Milton</option><option value="fiorella">Fiorella</option></select></div>
    <div><label htmlFor="control-purpose" className="block text-sm font-bold mb-2">Destino del dinero</label><select id="control-purpose" className={fieldClass} value={draft.purpose} onChange={change('purpose')}><option value="">Pendiente de revisión</option><option value="expenses">Gastos</option><option value="savings">Ahorro</option></select><p className="text-xs mt-1">El aportante no determina el destino. El retiro es una operación independiente.</p></div>
    {real ? <p className="text-sm">Registrado por la sesión iniciada: <strong>{identity === 'milton' ? 'Milton' : identity === 'fiorella' ? 'Fiorella' : 'sin identificar'}</strong></p>
      : <div><label htmlFor="control-actor" className="block text-sm font-bold mb-2">Usuario que lo registra (declarado)</label><select id="control-actor" required className={fieldClass} value={draft.actorId} onChange={change('actorId')}><option value="">Seleccionar</option><option value="milton">Milton</option><option value="fiorella">Fiorella</option></select></div>}
    <div><label htmlFor="control-description" className="block text-sm font-bold mb-2">{real ? 'Descripción' : 'Descripción del ejemplo'}</label><input id="control-description" type="text" maxLength={1000} className={fieldClass} value={draft.description} onChange={change('description')} /></div>
    <div><label htmlFor="control-source" className="block text-sm font-bold mb-2">{real ? 'Procedencia (comprobante, extracto o referencia)' : 'Procedencia declarada del ejemplo'}</label><input id="control-source" type="text" required maxLength={500} className={fieldClass} value={draft.provenanceNote} onChange={change('provenanceNote')} placeholder={real ? 'Por ejemplo: voucher o extracto del mes' : 'Referencia ficticia de esta operación'} /></div>
    <div><label htmlFor="control-distinct" className="block text-sm font-bold mb-2">{real ? 'Si coincide con otro movimiento, explica por qué es distinto' : 'Si coincide con otro ejemplo, explica por qué es distinto'}</label><input id="control-distinct" type="text" maxLength={500} className={fieldClass} value={draft.distinctOperationReason} onChange={change('distinctOperationReason')} /></div>
    {!!errors.length && <div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">{errors.map(error => <p key={error}>{controlExplanation(error)}</p>)}</div>}
    <div className="flex flex-wrap gap-3"><button type="submit" className={buttonClass} disabled={!periodValid || saving}>{saving ? 'Guardando…' : real ? (record ? 'Guardar cambios' : 'Guardar movimiento') : record ? 'Aplicar edición temporal' : 'Registrar ejemplo temporal'}</button>{record && <button type="button" className={buttonClass} onClick={onCancel}>Cancelar edición</button>}</div>
  </form>;
}
