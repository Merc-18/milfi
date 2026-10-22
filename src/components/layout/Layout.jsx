import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Flower2, Users } from 'lucide-react';
import { useEffect, useRef } from 'react';
import AuthGate from '../auth/AccessGuards.jsx';
import DataSync from '../auth/DataSync.jsx';

export default function Layout() {
  const { pathname } = useLocation();
  const main = useRef(null);
  useEffect(() => { main.current?.scrollTo({ top: 0 }); }, [pathname]);
  const navItems = [
    { to: "/", icon: Home, label: "Inicio", end: true },
    { to: "/fiorella", icon: Flower2, label: "Fiorella", end: false },
    { to: "/control", icon: Users, label: "Control M&F", end: false },
  ];

  return (
    <div className="flex flex-col h-dvh bg-fondo w-full max-w-md mx-auto relative overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.1)] sm:rounded-3xl sm:h-[850px] sm:my-8 border-x sm:border-y border-principal">
      <main ref={main} className="flex-1 min-w-0 overflow-y-auto pb-32 p-4 sm:p-6">
        <div className="flex justify-end mb-2"><NavLink to="/acceso" className="text-xs font-bold underline min-h-11 py-3">Acceso</NavLink></div>
        {pathname.startsWith('/fiorella') && (
          <nav aria-label="Finanzas de Fiorella" className="flex flex-wrap gap-2 text-xs mb-4">
            {[
              ['/fiorella', 'Resumen'], ['/fiorella/calculadora', 'Simular'],
              ['/fiorella/presupuestos', 'Presupuestos GF'], ['/fiorella/gastos', 'Gastos GV'],
              ['/fiorella/simulador', 'Escenarios y metas'],
              ['/fiorella/historial', 'Historial'], ['/fiorella/configuracion', 'Reglas'],
            ].map(([to, label]) => <NavLink key={to} to={to} end className={({ isActive }) => `px-3 py-3 min-h-11 rounded-xl ${isActive ? 'bg-principal font-bold' : 'bg-white'}`}>{label}</NavLink>)}
          </nav>
        )}
        <DataSync />
        <AuthGate><Outlet /></AuthGate>
      </main>

      <nav aria-label="Módulos de MilFi" className="absolute bottom-0 w-full bg-white/80 backdrop-blur-md border-t border-secundario rounded-t-[32px] shadow-[0_-8px_30px_rgba(0,0,0,0.04)] pb-safe pt-3 px-6 flex justify-between items-center min-h-24 z-50">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="flex-1 flex justify-center"
          >
            {({ isActive }) => (
              <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-300 ${
                isActive ? "bg-principal text-texto font-bold -translate-y-3 shadow-soft" : "text-texto-light hover:text-texto hover:-translate-y-1"
              }`}>
                <item.icon size={24} strokeWidth={isActive ? 3 : 2} aria-hidden="true" />
                <span className="text-[10px] mt-1">{item.label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
