import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Plus } from 'lucide-react';
import { ReadOnlyNotice } from '../components/auth/AccessGuards.jsx';
import StatusNotice from '../components/StatusNotice.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import Sheet from '../components/ui/Sheet.jsx';
import AssignForm from '../components/control/AssignForm.jsx';
import CommitmentForm from '../components/control/CommitmentForm.jsx';
import MonthlyTable from '../components/control/MonthlyTable.jsx';
import MovementList from '../components/control/MovementList.jsx';
import MovementDetail from '../components/control/MovementDetail.jsx';
import MovementForm from '../components/control/MovementForm.jsx';
import PersonContributions from '../components/control/PersonContributions.jsx';
import ReviewForm from '../components/control/ReviewForm.jsx';
import SavingsCard from '../components/control/SavingsCard.jsx';
import SavingsChart from '../components/control/SavingsChart.jsx';
import TaskStrip from '../components/control/TaskStrip.jsx';
import { buttonClass, PageHeader } from '../components/FiorellaSession.jsx';
import { canManage } from '../domain/access.js';
import { inspectLedger } from '../domain/controlLedger.js';
import { balanceSeries, monthlyRows, movementMonth, personContributions, reviewReasons, reviewTasks, savingsBalance, usdSavings }
  from '../presentation/controlLedgerView.js';
import { useControlPlans } from '../presentation/controlPlans.js';
import { currentPeriodInput, parsePeriodInput } from '../presentation/format.js';
import { periodKey } from '../domain/fiorellaSession.js';
import { useModuleAccess } from '../presentation/moduleAccess.js';
import { useLedgerStore } from '../store/ledgerStore.js';
import { usePeriodStore } from '../store/periodStore.js';
import { useSessionStore } from '../store/sessionStore.js';

// Deposits without a plan month, by the month they were received.
const byReceiptMonth = items => items.reduce((months, item) => {
  const key = periodKey(movementMonth(item.entry.record));
  return months.set(key, [...(months.get(key) ?? []), item]);
}, new Map());

// Control Finanzas M&F, top to bottom: tasks, savings, month by month, people,
// movements. The only place to register is "Registrar movimiento".
export default function ControlFinanzas() {
  const manage = canManage(useModuleAccess('control-mf'));
  const userId = useSessionStore(state => state.user?.id ?? null);
  const { status, error, records, events, commitments, commitmentsAvailable } = useLedgerStore(useShallow(state => ({ status: state.status,
    error: state.error, records: state.records, events: state.events, commitments: state.commitments, commitmentsAvailable: state.commitmentsAvailable })));
  const plans = useControlPlans();
  const input = usePeriodStore(state => state.selectedPeriod);
  const period = parsePeriodInput(input);
  const [form, setForm] = useState(null);
  const [commitmentOpen, setCommitmentOpen] = useState(false);
  const [opened, setOpened] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const entries = useMemo(() => inspectLedger(records), [records]);
  const tasks = useMemo(() => reviewTasks(entries, plans), [entries, plans]);
  const usd = usdSavings(entries);
  const rows = monthlyRows(entries, plans, parsePeriodInput(currentPeriodInput()));
  const openedEntry = entries.find(entry => entry.record.id === opened) ?? null;
  const resolvingEntry = entries.find(entry => entry.record.id === resolving);
  const resolvingItem = resolvingEntry ? { entry: resolvingEntry, ...reviewReasons(resolvingEntry, entries) } : null;
  const editing = form && form !== 'new' ? entries.find(entry => entry.record.id === form)?.record ?? null : null;
  const done = message => { setNotice(message); setForm(null); setResolving(null); setOpened(null); setAssigning(null); };
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
    <TaskStrip tasks={tasks} open={tasksOpen} onToggle={() => setTasksOpen(value => !value)} manage={manage}
      onResolve={setResolving} onAssign={(items, mode) => setAssigning({ items, mode })} />
    <div className="grid gap-4 lg:grid-cols-3 items-start">
      <SavingsCard balance={savingsBalance(entries)} usd={usd} />
      <SavingsChart pen={balanceSeries(entries, period)} usd={usd?.kind === 'saved' ? balanceSeries(entries, period, 'USD') : null} selected={input} />
    </div>
    <MonthlyTable rows={rows} selected={input} toAssign={manage ? byReceiptMonth(tasks.withoutPlan) : undefined}
      onAssign={(items, mode) => setAssigning({ items, mode })} />
    <PersonContributions people={personContributions(entries, period, commitments)}
      onCommit={manage && commitmentsAvailable ? () => setCommitmentOpen(true) : null} />
    <Sheet open={commitmentOpen && manage} onClose={() => setCommitmentOpen(false)} title="Compromiso del mes">
      <CommitmentForm key={input} period={period} onDone={message => { setNotice(message); setCommitmentOpen(false); }} />
    </Sheet>
    <MovementList entries={entries} selected={input} onOpen={setOpened} />
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
    {manage && <Sheet open={!!assigning} onClose={() => setAssigning(null)} title={assigning?.mode === 'batch' ? 'Asignar al plan' : 'Asignar mes del plan'}>
      {assigning && <AssignForm key={assigning.items.map(item => item.entry.record.id).join()} items={assigning.items} mode={assigning.mode} onDone={done} />}
    </Sheet>}
  </div>;
}
