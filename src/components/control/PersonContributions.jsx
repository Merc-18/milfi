import { compareAmounts } from '../../domain/amounts.js';
import { controlMoney, personName, purposeName } from '../../presentation/control.js';
import { commitmentLight } from '../../presentation/controlLedgerView.js';
import { plural } from '../../presentation/format.js';
import LightWord from './LightWord.jsx';

const positive = amount => amount != null && compareAmounts(amount, '0') > 0;

// "Gastos: S/ 700.00 este mes · S/ 4,900.00 acumulado"; zeros and empty parts are left out.
function Line({ person, currency, dest }) {
  const money = amount => controlMoney(amount, currency);
  const light = commitmentLight(dest.monthly, dest.commitment);
  const parts = [positive(dest.monthly) && `${money(dest.monthly)} este mes`, positive(dest.total) && `${money(dest.total)} acumulado`].filter(Boolean);
  return <li className="space-y-0.5" data-contribution-group={`${person}:${currency}:${dest.purpose}`}>
    <p><span className="font-bold">{purposeName(dest.purpose)}{currency === 'USD' ? ' en dólares' : ''}:</span>{' '}
      <span className="tabular-nums">{parts.length ? parts.join(' · ') : 'sin aportes'}</span></p>
    {positive(dest.extra) && <p className="text-xs tabular-nums">
      {[positive(dest.regular) && `Habitual ${money(dest.regular)}`, `Extra ${money(dest.extra)}`].filter(Boolean).join(' · ')}</p>}
    {light && <p className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums">Compromiso {money(dest.commitment)} · <LightWord {...light} /></p>}
  </li>;
}

export default function PersonContributions({ people, onCommit }) {
  return <section className="rounded-[24px] bg-white p-4 shadow-soft space-y-3" aria-labelledby="contributions-title" data-testid="control-contributions">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="contributions-title" className="font-bold">Aportes por persona</h2>
      {onCommit && <button type="button" className="min-h-11 text-sm underline" onClick={onCommit}>Definir compromiso</button>}
    </div>
    <div className="grid gap-4 sm:grid-cols-2">{people.map(person => {
      const lines = person.currencies.flatMap(item => item.destinations.filter(dest => dest.total !== null || dest.commitment !== null)
        .map(dest => <Line key={`${item.currency}:${dest.purpose}`} person={person.contributorId} currency={item.currency} dest={dest} />));
      const pending = person.unknownCurrencyPending + person.currencies.reduce((total, item) => total + item.pending, 0);
      return <section key={person.contributorId} className="min-w-0 space-y-1 text-sm" data-contribution-person={person.contributorId}>
        <h3 className="font-bold">{personName(person.contributorId)}</h3>
        {lines.length ? <ul className="space-y-1">{lines}</ul> : <p>Sin aportes registrados</p>}
        {pending > 0 && <p className="text-xs">{plural(pending, 'aporte')} por revisar, fuera de los totales</p>}
      </section>;
    })}</div>
  </section>;
}
