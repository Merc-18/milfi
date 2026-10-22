import { useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Calculator as CalcIcon, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore.js';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { calculateDistribution } from '../domain/distribution.js';
import { currentPeriodInput, parsePeriodInput } from '../presentation/format.js';
import DistributionDetails from '../components/DistributionDetails.jsx';
import StatusNotice from '../components/StatusNotice.jsx';

const issueMessages = {
  INVALID_INCOME: 'Ingresa un ingreso no negativo y finito, usando punto para los decimales.',
  INVALID_FIXED_EXPENSE: 'Ingresa un gasto fijo no negativo y finito, usando punto para los decimales.',
  FIXED_EXPENSE_ABOVE_CAP: 'El gasto fijo no puede superar el tope oficial de S/ 1,500.',
};

export default function Calculadora() {
  const navigate = useNavigate();
  const saveSimulation = useStore(state => state.saveSimulation);
  const [income, setIncome] = useState('');
  const [fixedExpense, setFixedExpense] = useState(FINANCIAL_RULES.fixedExpenseCap);
  const [periodInput, setPeriodInput] = useState(currentPeriodInput);
  const [saveError, setSaveError] = useState('');
  const period = parsePeriodInput(periodInput);
  // Derived directly; no effect synchronizes a duplicate result state.
  const calculation = calculateDistribution({ income, fixedExpense });

  const save = () => {
    const result = saveSimulation({ id: crypto.randomUUID(), period, income, fixedExpense, createdAt: new Date().toISOString() });
    if (result.ok) navigate('/fiorella/historial');
    else setSaveError('No se pudo guardar la simulación. Revisa el periodo y las entradas.');
  };

  return (
    <div className="pb-10">
      <header className="my-6 flex items-center gap-3">
        <div className="bg-principal p-3 rounded-[18px]"><CalcIcon size={26} aria-hidden="true" /></div>
        <div><h1 className="text-2xl font-bold">Simular distribución</h1><p className="text-sm">Finanzas de Fiorella</p></div>
      </header>
      <StatusNotice title="Solo simulación"><p>Los importes de esta pantalla no se incorporan al historial real ni generan depósitos. Las simulaciones guardadas duran solo esta sesión y se pierden al recargar.</p></StatusNotice>
      <div className="space-y-4 mb-6">
        <div className="bg-white p-5 rounded-[24px] shadow-soft">
          <label htmlFor="simulation-period" className="block text-sm font-bold mb-2">Periodo de la simulación</label>
          <input id="simulation-period" type="month" value={periodInput} onChange={event => setPeriodInput(event.target.value)} className="w-full bg-fondo p-3 rounded-xl" />
          {!period && <p className="text-sm mt-2" role="alert">Selecciona un periodo válido.</p>}
        </div>
        <div className="bg-white p-5 rounded-[24px] shadow-soft">
          <label htmlFor="simulation-income" className="block text-sm font-bold mb-2">Ingreso simulado (S/)</label>
          <input id="simulation-income" type="text" inputMode="decimal" autoComplete="off" maxLength={100} value={income} onChange={event => setIncome(event.target.value)} placeholder="0.00" className="w-full text-3xl bg-transparent rounded-lg p-1" aria-describedby="decimal-help" />
        </div>
        <div className="bg-white p-5 rounded-[24px] shadow-soft">
          <label htmlFor="simulation-fixed" className="block text-sm font-bold mb-2">Gasto fijo simulado (S/) · Tope 1,500</label>
          <input id="simulation-fixed" type="text" inputMode="decimal" autoComplete="off" maxLength={100} value={fixedExpense} onChange={event => setFixedExpense(event.target.value)} className="w-full text-2xl bg-transparent rounded-lg p-1" aria-describedby="decimal-help" />
        </div>
        <p id="decimal-help" className="text-sm">Usa punto para los decimales, sin símbolos ni separadores de miles.</p>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {calculation.status === 'invalid' && <ul className="text-sm bg-acento/30 p-4 rounded-xl mb-4">{calculation.issues.map(issue => <li key={issue}>{issueMessages[issue]}</li>)}</ul>}
        {calculation.status === 'decision_required' && (
          <StatusNotice title="Tratamiento pendiente de aprobación"><p>{calculation.reason === 'DEFICIT_POLICY_PENDING' ? 'El ingreso es menor que el gasto fijo.' : 'El sobrante es cero.'} No se genera una distribución para este caso hasta aprobar su tratamiento.</p></StatusNotice>
        )}
      </div>
      <AnimatePresence>
        {calculation.status === 'calculated' && (
          <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <DistributionDetails distribution={calculation.distribution} />
            <p className="text-sm mt-4">Vista matemática exacta, sin redondear.{calculation.requiresRoundingDecision && ' Hay fracciones de céntimo; su tratamiento monetario está pendiente de aprobación.'}</p>
            <button type="button" onClick={save} disabled={!period} className="w-full bg-texto text-white font-bold p-5 rounded-[20px] flex items-center justify-center gap-2 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"><Save size={22} aria-hidden="true" /> Guardar simulación de esta sesión</button>
          </Motion.div>
        )}
      </AnimatePresence>
      {saveError && <p role="alert" className="text-sm mt-4">{saveError}</p>}
    </div>
  );
}
