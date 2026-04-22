import { Outlet, NavLink } from 'react-router-dom';
import { Home, Calculator, Users, Settings } from 'lucide-react';

export default function Layout() {
  const navItems = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/calculadora", icon: Calculator, label: "Calcular" },
    { to: "/fondo-comun", icon: Users, label: "Fondo M&F" },
    { to: "/configuracion", icon: Settings, label: "Config" }
  ];

  return (
    <div className="flex flex-col h-screen bg-fondo w-full max-w-md mx-auto relative overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.1)] sm:rounded-3xl sm:h-[850px] sm:my-8 border-x sm:border-y border-principal">
      <main className="flex-1 overflow-y-auto pb-24 p-6">
        <Outlet />
      </main>

      <nav className="absolute bottom-0 w-full bg-white/80 backdrop-blur-md border-t border-secundario rounded-t-[32px] shadow-[0_-8px_30px_rgba(0,0,0,0.04)] pb-safe pt-3 px-6 flex justify-between items-center h-24 z-50">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className="flex-1 flex justify-center"
          >
            {({ isActive }) => (
              <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-300 ${
                isActive ? "bg-principal text-texto font-bold -translate-y-3 shadow-soft" : "text-texto-light hover:text-texto hover:-translate-y-1"
              }`}>
                <item.icon size={24} strokeWidth={isActive ? 3 : 2} />
                <span className="text-[10px] mt-1">{item.label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
