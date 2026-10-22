import StatusNotice from '../components/StatusNotice.jsx';

export default function ControlFinanzas() {
  return (
    <div className="pb-10">
      <header className="my-6"><h1 className="text-2xl font-bold mb-2">Control Finanzas M&F</h1><p className="text-sm">Administración prevista: Milton · Consulta de ambos</p></header>
      <StatusNotice title="Historial real pendiente de importación"><p>El Excel de Control contiene operaciones reales. Todavía no se ha importado ningún movimiento; no hay un saldo confirmado para mostrar.</p></StatusNotice>
      <div className="space-y-4">
        <section className="bg-white p-5 rounded-[24px] shadow-soft"><h2 className="font-bold text-lg mb-2">Depósitos por destino</h2><p className="text-sm">Los aportes para gastos y los depósitos para ahorro se mantienen separados. Cada depósito identifica su aportante, su destino y, cuando se conoce, el usuario que lo registra.</p></section>
        <section className="bg-exito/30 p-5 rounded-[24px] shadow-soft"><h2 className="font-bold text-lg mb-2">Retiros y consulta de saldos</h2><p className="text-sm">Los retiros conservan su destino y su procedencia. Los casos cuyo tratamiento requiera aprobación quedan pendientes. Los saldos solo podrán consultarse con operaciones reales validadas y moneda explícita.</p></section>
        <section className="bg-white p-5 rounded-[24px] shadow-soft"><h2 className="font-bold text-lg mb-2">Pendientes de validación</h2><p className="text-sm">Los registros ambiguos conservarán sus datos originales y quedarán fuera de saldos confirmados hasta su revisión.</p></section>
      </div>
      <p className="text-sm mt-6">La importación y la conciliación con ahorros reales se habilitarán en una fase posterior. Las simulaciones de Fiorella permanecen separadas.</p>
    </div>
  );
}
