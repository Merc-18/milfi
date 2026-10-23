import { Link } from 'react-router-dom';
import { ChevronRight, Flower2, Users } from 'lucide-react';

export default function Home() {
  return (
    <div className="pb-8">
      <header className="my-6 flex items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold tracking-tight mb-1">MilFi 🌸</h1><p className="text-sm">Finanzas personales y ahorro en pareja</p></div>
        <img src="/logo.png" alt="Mascota de MilFi" className="w-14 h-14 object-cover rounded-[18px] shadow-soft border-2 border-principal" />
      </header>
      <p className="text-sm mb-6">Dos espacios para organizarse y consultar juntos.</p>
      <div className="space-y-5">
        <Link to="/fiorella" className="block bg-white p-6 rounded-[24px] shadow-soft border-2 border-principal/40 hover:border-principal">
          <Flower2 size={28} className="mb-3" aria-hidden="true" />
          <h2 className="text-xl font-bold mb-2">Finanzas de Fiorella</h2>
          <p className="text-sm mb-4">Plantilla configurada · Historial real aún no importado</p>
          <span className="inline-flex items-center gap-2 font-bold text-sm">Abrir módulo <ChevronRight size={18} aria-hidden="true" /></span>
        </Link>
        <Link to="/control" className="block bg-secundario/30 p-6 rounded-[24px] shadow-soft border-2 border-transparent hover:border-secundario">
          <Users size={28} className="mb-3" aria-hidden="true" />
          <h2 className="text-xl font-bold mb-2">Control Finanzas M&F</h2>
          <p className="text-sm mb-4">Depósitos y retiros reales · Importación pendiente</p>
          <span className="inline-flex items-center gap-2 font-bold text-sm">Abrir módulo <ChevronRight size={18} aria-hidden="true" /></span>
        </Link>
      </div>
    </div>
  );
}
