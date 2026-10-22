import { useStore } from '../store/useStore.js';
import { formatAmount, formatPeriod } from '../presentation/format.js';
import DistributionDetails from '../components/DistributionDetails.jsx';
import StatusNotice from '../components/StatusNotice.jsx';

export default function Historial() {
  const simulations = useStore(state => state.simulations);
  return (
    <div className="pb-10">
      <header className="my-6"><h1 className="text-2xl font-bold">Historial y simulaciones</h1></header>
      <StatusNotice title="Historial real aún no importado"><p>La plantilla original contiene importes simulados. Los registros reales se incorporarán cuando recibamos y validemos el Excel actualizado de Fiorella.</p></StatusNotice>
      <h2 className="font-bold text-lg mb-2">Simulaciones de esta sesión</h2>
      <p className="text-sm mb-5">Son ejemplos independientes. No representan ingresos ni ahorros reales y se pierden al recargar.</p>
      {simulations.length === 0 ? <p className="text-sm bg-white p-5 rounded-[24px] shadow-soft">Todavía no guardaste simulaciones en esta sesión.</p> : (
        <div className="space-y-4">
          {simulations.map(simulation => (
            <details key={simulation.id} className="bg-white p-5 rounded-[24px] shadow-soft">
              <summary className="cursor-pointer font-bold"><span className="capitalize">{formatPeriod(simulation.period)}</span> · {formatAmount(simulation.distribution.income)}<span className="block text-sm font-normal mt-1">Simulación · Ver distribución</span></summary>
              <div className="mt-4"><DistributionDetails distribution={simulation.distribution} /></div>
              <p className="text-sm mt-3">Importes exactos, sin redondear.{simulation.requiresRoundingDecision && ' Contiene fracciones de céntimo pendientes de criterio monetario.'}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
