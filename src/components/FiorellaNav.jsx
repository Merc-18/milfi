import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Info } from 'lucide-react';
import Sheet from './ui/Sheet.jsx';
import RulesContent from './RulesContent.jsx';

// Four tabs; each stays active on the pages it opens (Metas → Calculadora;
// Presupuestos redirects to Gastos). Rules are reference: an info button opens them.
const SECTIONS = [
  { to: '/fiorella', label: 'Resumen', also: [] },
  { to: '/fiorella/gastos', label: 'Gastos', also: [] },
  { to: '/fiorella/simulador', label: 'Metas', also: ['/fiorella/calculadora'] },
  { to: '/fiorella/historial', label: 'Historial', also: [] },
];
const tabClass = active => `rounded-xl px-2 sm:px-3 py-2 min-h-11 flex items-center ${active ? 'bg-texto text-white font-bold' : 'bg-white hover:bg-principal/60'}`;

export default function FiorellaNav() {
  const { pathname } = useLocation();
  const [rules, setRules] = useState(false);
  return <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 md:px-8">
    <nav aria-label="Finanzas de Fiorella" className="min-w-0 flex-1 overflow-x-auto">
      <div className="flex gap-1 pb-2 text-sm whitespace-nowrap">
        {SECTIONS.map(({ to, label, also }) => {
          const active = pathname === to || also.includes(pathname);
          return <Link key={to} to={to} aria-current={active ? 'page' : undefined} className={tabClass(active)}>{label}</Link>;
        })}
      </div>
    </nav>
    <button type="button" onClick={() => setRules(true)} aria-label="Reglas de Fiorella" aria-haspopup="dialog"
      className="mb-2 shrink-0 min-h-11 min-w-11 rounded-xl bg-white flex items-center justify-center hover:bg-principal/60">
      <Info size={20} aria-hidden="true" /></button>
    <Sheet open={rules} onClose={() => setRules(false)} title="Reglas de Fiorella"><RulesContent /></Sheet>
  </div>;
}
