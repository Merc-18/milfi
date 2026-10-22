import { useStore } from '../store/useStore.js';
import { formatAmount, formatPeriod } from '../presentation/format.js';
import DistributionDetails from '../components/DistributionDetails.jsx';
import StatusNotice from '../components/StatusNotice.jsx';
import { FIXED_CATEGORIES, FIXED_SUBCATEGORIES } from '../domain/fiorellaCategories.js';
import { fiorellaHistory } from '../domain/fiorellaSession.js';

const labels = { income: 'Ingreso', appliedFixedExpense: 'GF aplicado', budgetAmount: 'Presupuesto GF', actualAmount: 'Gasto GF', amount: 'Importe GV', description: 'Descripción', effectiveDate: 'Fecha', categoryId: 'Categoría' };
const categoryName = id => {
  const category = FIXED_SUBCATEGORIES.find(item => item.id === id);
  return category ? `${FIXED_CATEGORIES.find(group => group.id === category.parentId).name} / ${category.name}` : id === 'salud' ? 'Salud' : 'Ocio';
};
const show = (field, value) => value == null ? 'Sin registrar' : ['description', 'effectiveDate'].includes(field) ? value : field === 'categoryId' ? categoryName(value) : formatAmount(value);

function DemoRecord({ record, persisted }) {
  const title = record.kind === 'monthly-plan' ? 'Datos mensuales' : record.kind === 'fixed-budget' ? `GF · ${categoryName(record.categoryId)}` : `GV · ${categoryName(record.categoryId)}`;
  return <article className="bg-white p-4 rounded-2xl text-sm space-y-2">
    <h4 className="font-bold">{title} · {persisted ? 'Guardado' : 'Demostración'}</h4>
    <dl>{Object.entries(labels).filter(([field]) => Object.hasOwn(record, field)).map(([field, label]) => <div key={field} className="py-1"><dt>{label}</dt><dd className="font-bold break-words">{show(field, record[field])}</dd></div>)}</dl>
    <p>Revisión {record.revision} · {persisted ? 'Guardado en MilFi' : 'Solo esta sesión'}</p>
  </article>;
}

export default function Historial() {
  const simulations = useStore(state => state.simulations);
  const records = useStore(state => state.fiorellaDemoRecords);
  const events = useStore(state => state.fiorellaDemoEvents);
  const persisted = useStore(state => !!state.remote);
  const groups = fiorellaHistory(records, events, simulations, persisted ? 'real' : 'simulated');
  return (
    <div className="pb-10">
      <header className="my-6"><h1 className="text-2xl font-bold">Historial y simulaciones</h1></header>
      <StatusNotice title="Historial real aún no importado"><p>La plantilla original contiene importes simulados. Los registros reales se incorporarán cuando recibamos y validemos el Excel actualizado de Fiorella.</p></StatusNotice>
      {persisted ? <>
        <h2 className="font-bold text-lg mb-2">Registros guardados por periodo</h2>
        <p className="text-sm mb-4">Ingresos, presupuestos y gastos guardados en MilFi, con el historial de cambios que registra la base de datos.</p>
        {!records.length && <p className="text-sm mb-5">Todavía no hay registros guardados.</p>}
      </> : <>
        <h2 className="font-bold text-lg mb-2">Registros de demostración por periodo</h2>
        <p className="text-sm mb-4">Ingresos, presupuestos y gastos de prueba; no son registros reales. Los cambios solo duran esta sesión y se pierden al recargar.</p>
        {!records.length && <p className="text-sm mb-5">Sin registros de demostración en esta sesión.</p>}
      </>}
      {groups.filter(group => group.records.length).map(group => <section key={group.key} className="space-y-3 mb-6" data-demo-period={group.key}>
        <h3 className="font-bold capitalize">{formatPeriod(group.period)}</h3>
        {group.records.map(record => <DemoRecord key={record.id} record={record} persisted={persisted} />)}
        <h4 className="font-bold">{persisted ? 'Historial de cambios' : 'Cambios de esta sesión'}</h4>
        {group.events.map(event => <article key={event.id} className="text-sm bg-secundario/20 p-4 rounded-2xl">
          <p className="font-bold">{event.action === 'created' ? 'Registro creado' : 'Registro actualizado'} · Revisión {event.revision}</p>
          <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</time>
          {Object.entries(labels).filter(([field]) => Object.hasOwn(event.after, field) && event.before?.[field] !== event.after[field]).map(([field, label]) => <p key={field} className="break-words mt-2">{label}: {show(field, event.before?.[field])} → {show(field, event.after[field])}</p>)}
          {event.similarExpenseAcknowledged && <p className="mt-2">Se indicó expresamente que es otro gasto con datos coincidentes.</p>}
        </article>)}
      </section>)}
      <h2 className="font-bold text-lg mb-2">Simulaciones de esta sesión</h2>
      <p className="text-sm mb-5">Son ejemplos independientes. No representan ingresos ni ahorros reales y se pierden al recargar.</p>
      {simulations.length === 0 ? <p className="text-sm bg-white p-5 rounded-[24px] shadow-soft">Todavía no guardaste simulaciones en esta sesión.</p> : (
        <div className="space-y-4">
          {groups.filter(group => group.simulations.length).map(group => <section key={group.key} className="space-y-4">
            <h3 className="font-bold capitalize">{formatPeriod(group.period)}</h3>
            {group.simulations.map(simulation => (
            <details key={simulation.id} className="bg-white p-5 rounded-[24px] shadow-soft">
              <summary className="cursor-pointer font-bold"><span className="capitalize">{formatPeriod(simulation.period)}</span> · {formatAmount(simulation.distribution.income)}<span className="block text-sm font-normal mt-1">Simulación · Ver distribución</span></summary>
              <div className="mt-4"><DistributionDetails distribution={simulation.distribution} /></div>
              <p className="text-sm mt-3">Importes exactos, sin redondear.{simulation.requiresRoundingDecision && ' Contiene fracciones de céntimo pendientes de criterio monetario.'}</p>
            </details>
          ))}</section>)}
        </div>
      )}
    </div>
  );
}
