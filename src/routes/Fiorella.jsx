import { sessionCommand, sessionResultMessage, useFiorellaPeriod } from '../presentation/fiorellaSession.js';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore.js';
import { formatAmount } from '../presentation/format.js';
import DistributionDetails from '../components/DistributionDetails.jsx';
import { AmountStatus, buttonClass, cardClass, Comparison, FixedTotalComparison, MoneyInput, PeriodPicker, SessionNotice } from '../components/FiorellaSession.jsx';

function MonthlyForm({ period, record }) {
  const save = useStore(state => state.saveFiorellaDemo);
  const [base, setBase] = useState(record);
  const [income, setIncome] = useState(record?.income ?? '');
  const [fixed, setFixed] = useState(record?.appliedFixedExpense ?? '');
  const [feedback, setFeedback] = useState(null);
  const submit = event => {
    event.preventDefault();
    const result = save(sessionCommand('monthly-plan', period, base, { income, appliedFixedExpense: fixed }));
    if (result.ok) setBase(result.value);
    setFeedback({ ok: result.ok, text: sessionResultMessage(result) });
  };
  return <form aria-label="Datos mensuales de demostración" onSubmit={submit} className={`${cardClass} space-y-4`}>
    <h2 className="font-bold text-lg">Datos del mes · demostración</h2>
    <MoneyInput id="monthly-income" label="Ingreso del mes · demo (S/)" value={income} onChange={setIncome} />
    <MoneyInput id="monthly-fixed" label="GF aplicado al cálculo (S/) · Tope 1,500" value={fixed} onChange={setFixed} />
    <p className="text-sm">Usa punto decimal. Puedes registrar solo un campo y completar el otro después. El GF aplicado no se calcula a partir del presupuesto detallado ni del gasto registrado.</p>
    <button type="submit" className={buttonClass}>Registrar datos del mes · sesión</button>
    {feedback && <p className="text-sm" role={feedback.ok ? 'status' : 'alert'}>{feedback.text}</p>}
  </form>;
}

export default function Fiorella() {
  const { input, period, summary } = useFiorellaPeriod();
  return <div className="pb-10 space-y-5">
    <header className="my-6"><h1 className="text-2xl font-bold mb-2">Finanzas de Fiorella 🌸</h1><p className="text-sm">Resumen mensual · Administración prevista: Fiorella · Consulta de ambos</p></header>
    <SessionNotice /><PeriodPicker />
    <div className="grid gap-3" data-testid="monthly-summary">
      <AmountStatus label="Ingreso registrado · demo" amount={summary.monthly?.income} />
      <AmountStatus label="GF aplicado al cálculo" amount={summary.monthly?.appliedFixedExpense} />
      <AmountStatus label="Presupuesto detallado GF" amount={summary.budget.amount} detail={`${summary.budget.registered}/${summary.budget.expected} subcategorías con presupuesto. Es independiente del GF aplicado.`} />
      <AmountStatus label="Gasto GF registrado · demo" amount={summary.actual.amount} detail={`${summary.actual.registered}/${summary.actual.expected} subcategorías con ejecución. Total parcial hasta completar el detalle.`} />
    </div>
    <FixedTotalComparison summary={summary} />
    <MonthlyForm key={input} period={period} record={summary.monthly} />
    <section className={cardClass}>
      <h2 className="font-bold text-lg mb-3">Distribución del mes · demo</h2>
      {summary.calculation.status === 'calculated' ? <>
        <DistributionDetails distribution={summary.calculation.distribution} />
        <p className="text-sm mt-3">Distribución matemática exacta. El ahorro planificado no es un depósito ni un saldo de Control M&F.</p>
      </> : <p className="text-sm">{summary.calculation.status === 'decision_required'
        ? 'Tratamiento pendiente de aprobación: hay déficit o sobrante cero. No se genera distribución.'
        : 'Sin distribución: completa el ingreso y el GF aplicado del mes.'}</p>}
      {summary.requiresRoundingDecision && <p className="text-sm mt-3">Hay fracciones de céntimo. Se muestran exactas; su redondeo monetario sigue pendiente.</p>}
    </section>
    <section className={cardClass}>
      <h2 className="font-bold text-lg mb-3">Seguimiento GV · Salud y Ocio</h2>
      {summary.categories.map(category => <div key={category.id} className="border-t border-secundario py-3 text-sm">
        <h3 className="font-bold">{category.name} · {category.percentage}% de variables</h3>
        <p>Distribución: {category.allocation === null ? 'Sin distribución' : <span className="break-all">{formatAmount(category.allocation)}</span>}</p>
        <p>Gasto demo: {category.executed.amount === null ? 'Sin gastos registrados' : <span className="break-all">{formatAmount(category.executed.amount)}</span>}</p>
        <Comparison budget={category.allocation} spent={category.executed.amount} />
      </div>)}
    </section>
    <div className="grid gap-3 text-sm font-bold">
      {[
        ['/fiorella/presupuestos', 'Asignar presupuestos GF'], ['/fiorella/gastos', 'Registrar gastos GV'],
        ['/fiorella/historial', 'Historial y cambios de la sesión'], ['/fiorella/calculadora', 'Simular distribución independiente'],
        ['/fiorella/simulador', 'Comparar escenarios y planificar metas'],
        ['/fiorella/configuracion', 'Consultar reglas oficiales'],
      ].map(([to, label]) => <Link key={to} to={to} className={`${cardClass} underline`}>{label}</Link>)}
    </div>
  </div>;
}
