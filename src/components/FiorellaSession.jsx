import { useStore } from '../store/useStore.js';
import StatusNotice from './StatusNotice.jsx';

export const fieldClass = 'w-full min-w-0 bg-fondo border border-secundario p-3 rounded-xl';
export const buttonClass = 'bg-texto text-white font-bold px-4 py-3 rounded-xl disabled:opacity-50';
export const cardClass = 'bg-white p-4 rounded-[24px] shadow-soft min-w-0';

// Only problems and loading are announced; the demo is explained by the header badge.
export function SessionNotice() {
  const remote = useStore(state => state.remote ? state.remoteStatus : null);
  const error = useStore(state => state.remoteError);
  if (remote === 'error') return <StatusNotice title="No se pudieron cargar los datos guardados"><p role="alert">MilFi no pudo leer la información ({error}). No se muestran datos incompletos como si fueran definitivos. Recarga o vuelve a iniciar sesión.</p></StatusNotice>;
  if (remote === 'loading') return <p role="status" className="text-sm mb-4">Cargando datos…</p>;
  return null;
}

export function Help({ title = 'Ayuda', children }) {
  return <details className="text-sm rounded-xl bg-secundario/20 px-3"><summary className="cursor-pointer min-h-11 py-3 font-bold">{title}</summary><div className="pb-3 space-y-2">{children}</div></details>;
}

export function PageHeader({ title, subtitle, children }) {
  return <header className="flex flex-wrap items-end justify-between gap-3 mt-2 mb-4">
    <div className="min-w-0"><h1 className="text-2xl md:text-3xl font-bold">{title}</h1>{subtitle && <p className="text-sm text-texto-light mt-1">{subtitle}</p>}</div>
    {children}
  </header>;
}

export function MoneyInput({ id, label, value, onChange }) {
  return <div className="min-w-0"><label htmlFor={id} className="block text-sm font-bold mb-1">{label}</label>
    <input id={id} type="text" inputMode="decimal" maxLength={100} autoComplete="off" className={fieldClass}
      value={value} onChange={event => onChange(event.target.value)} placeholder="Sin registrar" />
  </div>;
}
