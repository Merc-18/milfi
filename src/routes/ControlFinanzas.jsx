import StatusNotice from '../components/StatusNotice.jsx';

export default function ControlFinanzas() {
  return (
    <div className="pb-10">
      <header className="my-6"><h1 className="text-2xl font-bold mb-2">Control Finanzas M&F</h1><p className="text-sm">Administración prevista: Milton · Consulta de ambos</p></header>
      <StatusNotice title="Historial real pendiente de importación"><p>El Excel de Control contiene operaciones reales. Todavía no se ha importado ningún movimiento; no hay un saldo confirmado para mostrar.</p></StatusNotice>
      <div className="space-y-4">
        <section className="bg-white p-5 rounded-[24px] shadow-soft"><h2 className="font-bold text-lg mb-2">Depósitos para gastos</h2><p className="text-sm">Aportes de Milton destinados a gastos. Se conservarán separados de los depósitos para ahorro.</p></section>
        <section className="bg-exito/30 p-5 rounded-[24px] shadow-soft"><h2 className="font-bold text-lg mb-2">Depósitos y retiros de ahorro</h2><p className="text-sm">El saldo de ahorro se obtiene de sus depósitos reales menos sus retiros confirmados.</p></section>
        <section className="bg-white p-5 rounded-[24px] shadow-soft"><h2 className="font-bold text-lg mb-2">Pendientes de validación</h2><p className="text-sm">Los registros ambiguos conservarán sus datos originales y quedarán fuera de saldos confirmados hasta su revisión.</p></section>
      </div>
      <p className="text-sm mt-6">La importación y la conciliación con ahorros reales se habilitarán en una fase posterior. Las simulaciones de Fiorella permanecen separadas.</p>
    </div>
  );
}
