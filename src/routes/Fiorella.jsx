import { Link } from 'react-router-dom';
import { Calculator, History, Settings } from 'lucide-react';
import StatusNotice from '../components/StatusNotice.jsx';

const links = [
  { to: '/fiorella/calculadora', Icon: Calculator, title: 'Simular distribución', detail: 'Calcula con los porcentajes oficiales.' },
  { to: '/fiorella/historial', Icon: History, title: 'Historial y simulaciones', detail: 'Consulta el estado del historial y los ejemplos de esta sesión.' },
  { to: '/fiorella/configuracion', Icon: Settings, title: 'Configuración oficial', detail: 'Porcentajes definitivos y categorías Salud / Ocio.' },
];

export default function Fiorella() {
  return (
    <div className="pb-10">
      <header className="my-6"><h1 className="text-2xl font-bold mb-2">Finanzas de Fiorella 🌸</h1><p className="text-sm">Administración prevista: Fiorella · Consulta de ambos</p></header>
      <StatusNotice title="Plantilla configurada"><p>Historial real aún no importado. Esperamos la versión actualizada del Excel de Fiorella.</p></StatusNotice>
      <div className="space-y-4">
        {links.map(item => (
          <Link key={item.to} to={item.to} className="flex items-start gap-4 bg-white p-5 rounded-[24px] shadow-soft hover:bg-principal/20">
            <item.Icon size={24} className="shrink-0" aria-hidden="true" />
            <div><h2 className="font-bold mb-1">{item.title}</h2><p className="text-sm">{item.detail}</p></div>
          </Link>
        ))}
      </div>
      <section className="mt-6 text-sm bg-fondo border border-secundario p-5 rounded-[24px]">
        <h2 className="font-bold mb-2">Próximas funciones</h2>
        <p>Presupuestos GF, registro de gastos GV, metas y proyecciones. Su implementación continuará después de la revisión de esta fase.</p>
      </section>
    </div>
  );
}
