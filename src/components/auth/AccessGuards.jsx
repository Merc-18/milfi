import { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import StatusNotice from '../StatusNotice.jsx';
import { useSessionStore } from '../../store/sessionStore.js';
import { canRead, moduleForPath } from '../../domain/access.js';
import { useSessionView } from '../../presentation/moduleAccess.js';

export function ReadOnlyNotice({ children }) {
  return <StatusNotice title="Solo consulta"><p>{children} Los permisos se verifican en la base de datos; ocultar estos controles es solo una ayuda visual.</p></StatusNotice>;
}

const busy = new Set(['initializing', 'signing-in', 'loading-access']);

export default function AuthGate({ children }) {
  const { pathname } = useLocation();
  const { mode, status, access } = useSessionView();
  useEffect(() => { useSessionStore.getState().start(); }, []);
  if (mode === 'demo') return <>
    <p className="text-xs rounded-xl bg-secundario/30 p-3 mb-4" data-testid="demo-mode">Modo demostración local: la autenticación no está configurada en este entorno. No hay inicio de sesión, seguridad ni datos reales; los ejemplos se pierden al recargar.</p>
    {children}
  </>;
  if (pathname === '/acceso') return children;
  if (busy.has(status)) return <p role="status" className="my-6 text-sm">Verificando la sesión…</p>;
  if (status === 'signed-out' || status === 'expired') return <Navigate to="/acceso" replace state={{ from: pathname }} />;
  if (status === 'config-error' || status === 'error') return <StatusNotice title="No se puede verificar el acceso"><p>La conexión con el servicio de autenticación no está disponible o su configuración no es válida. No se muestra información.</p><Link to="/acceso" className="underline font-bold">Ir a Acceso</Link></StatusNotice>;
  if (status === 'no-access') return <StatusNotice title="Sin permisos asignados"><p>Tu usuario inició sesión, pero no tiene acceso asignado a MilFi. Un administrador debe asignarlo en la base de datos.</p><Link to="/acceso" className="underline font-bold">Ir a Acceso</Link></StatusNotice>;
  const module = moduleForPath(pathname);
  if (module && !canRead(access?.[module])) return <StatusNotice title="Sin permiso para este módulo"><p>Tu usuario no puede consultar este módulo.</p></StatusNotice>;
  return children;
}
