import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Flower2, Users } from 'lucide-react';
import { useFiorellaPeriod } from '../presentation/fiorellaSession.js';
import { remainingToSpend } from '../presentation/status.js';
import { formatAmount, formatPeriod } from '../presentation/format.js';
import { inspectLedger, summarizeLedger } from '../domain/controlLedger.js';
import { summarizeControlDemo } from '../domain/controlSession.js';
import { useLedgerStore } from '../store/ledgerStore.js';
import { useControlStore } from '../store/controlStore.js';

const cardClass = 'block p-6 rounded-[24px] shadow-soft border-2';
const MISSING = { 'missing-income': 'Falta el ingreso del mes', deficit: 'El ingreso no cubre el GF aplicado',
  'zero-surplus': 'No queda sobrante para repartir este mes' };

function ModuleCard({ to, icon, title, description, label, value, className }) {
  return <Link to={to} className={`${cardClass} ${className}`}>
    {icon}
    <h2 className="text-xl font-bold mb-1">{title}</h2>
    <p className="text-sm mb-4">{description}</p>
    <p className="text-xs text-texto-light">{label}</p>
    <p className="text-2xl font-bold tabular-nums break-all mb-4">{value}</p>
    <span className="inline-flex items-center gap-2 font-bold text-sm">Abrir <ChevronRight size={18} aria-hidden="true" /></span>
  </Link>;
}

export default function Home() {
  const { period, summary } = useFiorellaPeriod();
  const remaining = remainingToSpend(summary);
  const ledger = useLedgerStore(state => state.persistence ? state.records : null);
  const demo = useControlStore(state => state.demoMovements);
  const pending = useMemo(() => ledger ? summarizeLedger(inspectLedger(ledger), period).pending : summarizeControlDemo(demo, period).pending, [ledger, demo, period]);
  const fiorellaValue = MISSING[remaining.status] ?? `${remaining.status === 'over' ? '−' : ''}${formatAmount(remaining.amount)}`;
  return (
    <div className="pb-8">
      <header className="mt-2 mb-6 flex items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold tracking-tight mb-1">MilFi 🌸</h1>
          <p className="text-sm first-letter:uppercase">{formatPeriod(period)}</p></div>
        <img src="/logo.png" alt="Mascota de MilFi" className="w-14 h-14 object-cover rounded-[18px] shadow-soft border-2 border-principal" />
      </header>
      <div className="grid gap-5 md:grid-cols-2">
        <ModuleCard to="/fiorella" icon={<Flower2 size={28} className="mb-3" aria-hidden="true" />} title="Finanzas de Fiorella" description="Ingreso, gastos y ahorro del mes."
          label={remaining.status === 'over' ? 'Te pasaste por' : 'Te queda por gastar'} value={fiorellaValue}
          className="bg-white border-principal/40 hover:border-principal" />
        <ModuleCard to="/control" icon={<Users size={28} className="mb-3" aria-hidden="true" />} title="Control Finanzas M&F" description="Depósitos y retiros de la pareja."
          label="Movimientos pendientes de revisión" value={pending}
          className="bg-secundario/30 border-transparent hover:border-secundario" />
      </div>
    </div>
  );
}
