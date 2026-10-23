import { useState } from 'react';
import { Link } from 'react-router-dom';
import Sheet from './ui/Sheet.jsx';
import { useSessionView } from '../presentation/moduleAccess.js';

// The one place that explains the demo: shown only while no persisted session
// can exist (authentication not configured in this environment).
export default function DemoBadge() {
  const { mode } = useSessionView();
  const [open, setOpen] = useState(false);
  if (mode !== 'demo') return null;
  return <>
    <button type="button" data-testid="demo-mode" aria-haspopup="dialog" onClick={() => setOpen(true)}
      className="min-h-11 whitespace-nowrap rounded-full bg-acento px-3 text-xs font-bold hover:bg-principal">Modo demo</button>
    <Sheet open={open} onClose={() => setOpen(false)} title="Modo demo">
      <p className="text-sm">Estás usando MilFi sin una cuenta conectada: lo que registres son datos de prueba y se borran al recargar la página. Para guardar información real, inicia sesión desde Acceso.</p>
      <Link to="/acceso" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center font-bold underline">Ir a Acceso</Link>
    </Sheet>
  </>;
}
