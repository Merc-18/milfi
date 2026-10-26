import { tasksText } from '../../presentation/controlLedgerView.js';
import ReviewQueue from './ReviewQueue.jsx';

// One strip with the one task count; "Resolver" unfolds "Por revisar" right below.
export default function TaskStrip({ tasks, open, onToggle, manage, onResolve, onAssign }) {
  if (!tasks.total && !tasks.noPlan.length) return null;
  return <section className={`rounded-[24px] p-4 shadow-soft space-y-3 ${tasks.total ? 'bg-acento/50' : 'bg-white'}`}
    data-testid="control-tasks" data-task-count={tasks.total} aria-labelledby="tasks-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="tasks-title" className="font-bold">{tasks.total ? tasksText(tasks) : 'Sin tareas pendientes'}</h2>
      <button type="button" aria-expanded={open} aria-controls="por-revisar" onClick={onToggle}
        className="min-h-11 rounded-xl bg-white px-4 font-bold shadow-soft">{open ? 'Ocultar' : tasks.total ? 'Resolver' : 'Ver detalle'}</button>
    </div>
    {open && <ReviewQueue tasks={tasks} manage={manage} onResolve={onResolve} onAssign={onAssign} />}
  </section>;
}
