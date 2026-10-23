import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Plus } from 'lucide-react';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import StatusNotice from '../components/StatusNotice.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import Sheet from '../components/ui/Sheet.jsx';
import BalanceSteps from '../components/charts/BalanceSteps.jsx';
import ControlOverview from '../components/control/ControlOverview.jsx';
import MonthlyTable from '../components/control/MonthlyTable.jsx';
import MovementList from '../components/control/MovementList.jsx';
import MovementDetail from '../components/control/MovementDetail.jsx';
import MovementForm from '../components/control/MovementForm.jsx';
import ReviewForm from '../components/control/ReviewForm.jsx';
import ReviewQueue from '../components/control/ReviewQueue.jsx';
import { buttonClass, cardClass, PageHeader } from '../components/FiorellaSession.jsx';
import { canManage } from '../domain/access.js';
import { inspectLedger } from '../domain/controlLedger.js';
import { fiorellaEvolution } from '../domain/fiorellaDashboard.js';
import { periodKey } from '../domain/fiorellaSession.js';
import { balanceSeries, monthlyRows, movementMonth, reviewQueue, reviewReasons, savingsBalance } from '../presentation/controlLedgerView.js';
import { withFixedCap } from '../presentation/fixedCap.js';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { useLedgerStore } from '../store/ledgerStore.js';
import { usePeriodStore } from '../store/periodStore.js';
import { useSessionStore } from '../store/sessionStore.js';
import { useStore } from '../store/useStore.js';
import { parsePeriodInput } from '../presentation/format.js';

// Control Finanzas M&F: one view for the demo (in-memory ledger) and real data.
// Overview on top, then the month's movements and what needs a review. The only
// place to register is "Registrar movimiento".
export default function ControlFinanzas() {
  const manage = canManage(useModuleAccess('control-mf'));
  const userId = useSessionStore(state => state.user?.id ?? null);
  const { status, error, records, events } = useLedgerStore(useShallow(state => ({ status: state.status, error: state.error, records: state.records,
    events: state.events })));
  const fiorella = useStore(state => state.fiorellaDemoRecords);
  const persisted = useStore(state => !!state.remote);
  const input = usePeriodStore(state => state.selectedPeriod);
  const period = parsePeriodInput(input);
  const [form, setForm] = useState(null);
  const [opened, setOpened] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [notice, setNotice] = useState('');
  const entries = useMemo(() => inspectLedger(records), [records]);
  const plans = useMemo(() => new Map(fiorellaEvolution(withFixedCap(fiorella), persisted ? 'real' : 'simulated')
    .filter(row => row.couplePlanned != null).map(row => [row.key, row.couplePlanned])), [fiorella, persisted]);
  const balance = savingsBalance(entries);
  const series = balanceSeries(entries, period);
  const rows = monthlyRows(entries, plans);
  const queue = reviewQueue(entries);
  const month = entries.filter(entry => { const at = movementMonth(entry.record); return at && periodKey(at) === input; });
  const openedEntry = entries.find(entry => entry.record.id === opened) ?? null;
  const resolvingEntry = entries.find(entry => entry.record.id === resolving);
  const resolvingItem = resolvingEntry ? { entry: resolvingEntry, ...reviewReasons(resolvingEntry, entries) } : null;
  const editing = form && form !== 'new' ? entries.find(entry => entry.record.id === form)?.record ?? null : null;
  const done = message => { setNotice(message); setForm(null); setResolving(null); setOpened(null); };
  const toReview = () => document.getElementById('por-revisar')?.focus();
  return <div className="pb-10 space-y-4 [overflow-wrap:anywhere]" data-testid="control-ledger">
    <PageHeader title="Control M&F">
      <div className="flex flex-wrap items-end gap-2">
        <PeriodPicker id="control-selected-period" onChange={() => setNotice('')} />
        {manage && <button type="button" className={`${buttonClass} inline-flex min-h-11 items-center gap-2`}
          onClick={() => { setNotice(''); setForm('new'); }}>
          <Plus size={18} aria-hidden="true" />Registrar movimiento</button>}
      </div>
    </PageHeader>
    {status === 'error' && <StatusNotice title="No se pudieron cargar los movimientos">
      <p role="alert">MilFi no pudo leer los datos ({error}).</p></StatusNotice>}
    {status === 'loading' && <p role="status" className="text-sm">Cargando movimientos…</p>}
    {!manage && <ReadOnlyNotice>Administra Milton.</ReadOnlyNotice>}
    {notice && <p role="status" className="text-sm font-bold rounded-xl bg-exito/60 px-3 py-2">{notice}</p>}
    <div className="grid gap-4 lg:grid-cols-3 items-start">
      <ControlOverview balance={balance} onReview={toReview} />
      <section className={`${cardClass} space-y-2 lg:col-span-2`} aria-labelledby="balance-chart-title" data-testid="balance-chart">
        <h2 id="balance-chart-title" className="font-bold">Ahorro acumulado</h2>
        <BalanceSteps series={series} selected={input} label="Ahorro acumulado en soles" />
      </section>
    </div>
    <MonthlyTable rows={rows} selected={input} />
    <MovementList key={input} entries={month} onOpen={setOpened} />
    <ReviewQueue items={queue} manage={manage} onResolve={setResolving} />
    {manage && <Sheet open={form !== null} onClose={() => setForm(null)} title={editing ? 'Editar movimiento' : 'Registrar movimiento'}>
      <MovementForm key={form ?? 'closed'} record={editing} selected={period} onDone={done} onCancel={() => setForm(null)} />
    </Sheet>}
    <Sheet wide open={!!openedEntry} onClose={() => setOpened(null)} title="Detalle del movimiento">
      {openedEntry && <MovementDetail entry={openedEntry} events={events.filter(event => event.recordId === openedEntry.record.id)} userId={userId}
        manage={manage} entries={entries}
        onEdit={() => { setOpened(null); setForm(openedEntry.record.id); }} onReview={() => { setOpened(null); setResolving(openedEntry.record.id); }} />}
    </Sheet>
    {manage && <Sheet open={!!resolvingItem} onClose={() => setResolving(null)} title="Resolver movimiento">
      {resolvingItem && <ReviewForm key={`${resolvingItem.entry.record.id}:${resolvingItem.entry.record.revision}`} item={resolvingItem} onDone={done} />}
    </Sheet>}
  </div>;
}
