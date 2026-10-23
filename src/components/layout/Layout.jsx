import { Link, Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Flower2, Plus, Users, UserRound } from 'lucide-react';
import { useEffect } from 'react';
import AuthGate from '../auth/AccessGuards.jsx';
import DataSync from '../auth/DataSync.jsx';
import FiorellaNav from '../FiorellaNav.jsx';
import DemoBadge from '../DemoBadge.jsx';
import { BUILD_STAMP, versionLabel } from '../../presentation/version.js';
import { useModuleAccess } from '../../presentation/moduleAccess.js';
import { canManage } from '../../domain/access.js';

const MODULES = [
  { to: '/', icon: Home, label: 'Inicio', end: true },
  { to: '/fiorella', icon: Flower2, label: 'Fiorella', end: false },
  { to: '/control', icon: Users, label: 'Control M&F', end: false },
];

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  // Quick entry for Fiorella's managers; on Gastos it opens the page's expense sheet.
  const quickExpense = canManage(useModuleAccess('fiorella')) && pathname.startsWith('/fiorella');

  return (
    <div className="min-h-dvh w-full bg-fondo">
      <header className="sticky top-0 z-40 border-b border-secundario/70 bg-fondo/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 md:px-8">
          <div className="flex min-w-0 flex-col">
            <NavLink to="/" className="flex items-center gap-2 font-bold text-lg min-h-11">
              <img src="/logo.png" alt="" className="h-8 w-8 rounded-xl object-cover" />MilFi</NavLink>
            <span className="-mt-1.5 text-[10px] leading-none tabular-nums text-texto-light" data-testid="build-stamp" title={versionLabel}
              aria-label={versionLabel}>{BUILD_STAMP}</span>
          </div>
          <nav aria-label="Módulos de MilFi" className="hidden md:flex items-center gap-1">
            {MODULES.map(item => <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => `flex items-center gap-2 rounded-xl px-4 py-2 min-h-11 text-sm ${isActive ? 'bg-principal font-bold' : 'hover:bg-white'}`}>
              <item.icon size={18} aria-hidden="true" />{item.label}</NavLink>)}
          </nav>
          <div className="flex items-center gap-2">
          <DemoBadge />
          <NavLink to="/acceso" className={({ isActive }) => `flex items-center gap-2 rounded-xl px-3 py-2 min-h-11 text-sm ${isActive ? 'bg-principal font-bold' : 'hover:bg-white'}`}>
            <UserRound size={18} aria-hidden="true" />Acceso</NavLink>
          </div>
        </div>
        {pathname.startsWith('/fiorella') && <FiorellaNav />}
      </header>

      <main className={`mx-auto w-full max-w-6xl min-w-0 px-4 pt-4 md:px-8 ${quickExpense ? 'pb-48 md:pb-28' : 'pb-32 md:pb-12'}`}>
        <DataSync />
        <AuthGate><Outlet /></AuthGate>
      </main>

      {quickExpense && <Link to="/fiorella/gastos?nuevo"
        className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 inline-flex min-h-14 items-center gap-2 rounded-full bg-texto px-5 font-bold text-white shadow-soft md:right-8 md:bottom-8">
        <Plus size={20} aria-hidden="true" />Registrar gasto</Link>}

      <nav aria-label="Módulos de MilFi (móvil)" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-md border-t border-secundario rounded-t-[28px] shadow-[0_-8px_30px_rgba(0,0,0,0.04)] pb-safe pt-2 px-6 flex justify-between items-center">
        {MODULES.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} className="flex-1 flex justify-center">
            {({ isActive }) => (
              <div className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-colors ${isActive ? 'bg-principal text-texto font-bold' : 'text-texto-light'}`}>
                <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                <span className="text-[11px] mt-0.5">{item.label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
