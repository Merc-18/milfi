import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import StatusNotice from '../components/StatusNotice.jsx';
import { useSessionStore } from '../store/sessionStore.js';
import { safeReturnPath } from '../domain/access.js';
import { controlButtonClass as buttonClass, controlCardClass as cardClass, controlFieldClass as fieldClass } from '../presentation/control.js';
import { noticeClass } from '../presentation/tones.js';

const errors = {
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  MISSING_CREDENTIALS: 'Escribe tu correo y tu contraseña.',
  EMAIL_NOT_CONFIRMED: 'La cuenta aún no está confirmada.',
  RATE_LIMITED: 'Demasiados intentos. Espera unos minutos.',
  NETWORK_ERROR: 'No hay conexión con el servicio de autenticación.',
  SESSION_EXPIRED: 'Tu sesión expiró o fue cerrada. Vuelve a iniciar sesión.',
  ACCESS_LOAD_FAILED: 'No se pudieron comprobar tus permisos.',
  PRIVILEGED_KEY_REJECTED: 'La configuración usa una clave privilegiada. Por seguridad la aplicación no se conecta.',
  INSECURE_URL: 'La dirección del servicio debe usar HTTPS.',
};
const message = code => errors[code] ?? 'No se pudo completar la operación de acceso.';
const levels = { manage: 'administra', read: 'consulta', none: 'sin acceso' };
const passwordErrors = { WEAK_PASSWORD: 'Usa al menos 12 caracteres y una contraseña que no hayas usado antes.', SAME_PASSWORD: 'La nueva contraseña debe ser distinta de la actual.' };

function ChangePassword() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const submit = async event => {
    event.preventDefault();
    if (password !== confirmation) { setResult({ ok: false, code: 'MISMATCH' }); return; }
    setSaving(true);
    const outcome = await useSessionStore.getState().changePassword(password);
    setSaving(false); setPassword(''); setConfirmation(''); setResult(outcome);
  };
  return <form aria-label="Cambiar contraseña" onSubmit={submit} className="space-y-3 border-t border-secundario pt-4">
    <h3 className="font-bold">Cambiar contraseña</h3>
    <div><label htmlFor="new-password" className="block text-sm font-bold mb-2">Nueva contraseña</label><input id="new-password" type="password" autoComplete="new-password" minLength={12} required className={fieldClass} value={password} onChange={event => setPassword(event.target.value)} /></div>
    <div><label htmlFor="new-password-confirm" className="block text-sm font-bold mb-2">Repite la nueva contraseña</label><input id="new-password-confirm" type="password" autoComplete="new-password" minLength={12} required className={fieldClass} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>
    {result && <p role={result.ok ? 'status' : 'alert'} className="text-sm">{result.ok ? 'Contraseña actualizada.' : result.code === 'MISMATCH' ? 'Las contraseñas no coinciden.' : passwordErrors[result.code] ?? message(result.code)}</p>}
    <button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Guardando…' : 'Cambiar contraseña'}</button>
  </form>;
}

export default function Acceso() {
  const { state } = useLocation();
  const session = useSessionStore(useShallow(store => ({ mode: store.mode, status: store.status, error: store.error, user: store.user, profile: store.profile, access: store.access })));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const returnPath = safeReturnPath(state?.from);
  if (session.status === 'ready' && returnPath) return <Navigate to={returnPath} replace />;
  const submit = async event => {
    event.preventDefault();
    setSubmitting(true);
    await useSessionStore.getState().signIn(email, password);
    setPassword('');
    setSubmitting(false);
  };
  return <div className="pb-10 space-y-5 max-w-lg">
    <header className="my-4"><h1 className="text-2xl font-bold">Acceso</h1></header>
    {session.mode === 'demo' && <StatusNotice title="Autenticación no configurada"><p>Este entorno no tiene un proyecto Supabase configurado. La aplicación funciona en modo demostración local, sin usuarios, sin seguridad y sin datos reales. No existe un inicio de sesión simulado.</p></StatusNotice>}
    {session.status === 'config-error' && <StatusNotice title="Configuración no válida"><p>{message(session.error)}</p></StatusNotice>}
    {session.status === 'initializing' && <p role="status" className="text-sm">Recuperando la sesión…</p>}
    {session.status === 'expired' && <p role="alert" className={noticeClass()}>{message('SESSION_EXPIRED')}</p>}
    {['signed-out', 'expired', 'signing-in'].includes(session.status) && <form aria-label="Iniciar sesión" onSubmit={submit} className={cardClass}>
      <div><label htmlFor="login-email" className="block text-sm font-bold mb-2">Correo</label><input id="login-email" type="email" autoComplete="username" required className={fieldClass} value={email} onChange={event => setEmail(event.target.value)} /></div>
      <div><label htmlFor="login-password" className="block text-sm font-bold mb-2">Contraseña</label><input id="login-password" type="password" autoComplete="current-password" required className={fieldClass} value={password} onChange={event => setPassword(event.target.value)} /></div>
      {session.error && session.status !== 'expired' && <p role="alert" className="text-sm">{message(session.error)}</p>}
      <button type="submit" className={buttonClass} disabled={submitting || session.status === 'signing-in'}>{submitting || session.status === 'signing-in' ? 'Ingresando…' : 'Iniciar sesión'}</button>
      <p className="text-xs">No hay registro público. Las cuentas las crea el administrador del proyecto.</p>
    </form>}
    {session.status === 'loading-access' && <p role="status" className="text-sm">Comprobando permisos…</p>}
    {['ready', 'no-access'].includes(session.status) && <section className={cardClass}>
      <h2 className="font-bold text-lg">Sesión iniciada</h2>
      <p className="text-sm">{session.profile?.display_name ?? session.user?.email}</p>
      {session.status === 'no-access' ? <p className="text-sm">Tu usuario no tiene permisos asignados en MilFi.</p>
        : <ul className="text-sm"><li>Finanzas de Fiorella: {levels[session.access.fiorella]}</li><li>Control Finanzas M&F: {levels[session.access['control-mf']]}</li></ul>}
      <button type="button" className={buttonClass} onClick={() => useSessionStore.getState().signOut()}>Cerrar sesión</button>
      {session.status === 'ready' && <ChangePassword />}
    </section>}
    {session.status === 'error' && <p role="alert" className={noticeClass()}>{message(session.error)}</p>}
    <p className="text-xs text-texto-light">Versión {import.meta.env.VITE_MILFI_VERSION ?? 'local'}</p>
  </div>;
}
