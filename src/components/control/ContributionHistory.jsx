import { controlMoney, personName, purposeName } from '../../presentation/control.js';
import { formatPeriod, plural } from '../../presentation/format.js';

const money = (amount, currency) => amount === null ? '—' : controlMoney(amount, currency);
export default function ContributionHistory({ people, selected }) {
  return <section className="rounded-[24px] bg-white p-4 shadow-soft space-y-3" aria-labelledby="contributions-title" data-testid="control-contributions">
    <h2 id="contributions-title" className="font-bold">Aportes por persona</h2>
    <p className="text-sm text-texto-light">Recibido en {formatPeriod(selected)} y acumulado histórico. Un compromiso es un acuerdo, no dinero depositado. Los pendientes quedan fuera de los totales.</p>
    <div className="grid gap-4 lg:grid-cols-2">{people.map(person => <section key={person.contributorId} className="space-y-3 min-w-0" data-contribution-person={person.contributorId}>
      <h3 className="font-bold">Aportes de {personName(person.contributorId)}</h3>
      {person.unknownCurrencyPending > 0 && <p className="text-sm">{plural(person.unknownCurrencyPending, 'aporte')} con moneda por confirmar.</p>}
      {person.currencies.map(item => <section key={item.currency} className="border border-secundario rounded-xl p-3 space-y-2" data-contribution-currency={item.currency}>
        <h4 className="font-bold text-sm">{item.currency === 'PEN' ? 'SOLES (PEN)' : 'DÓLARES (USD)'}</h4>
        {item.destinations.every(dest => dest.total === null) && <p className="text-sm">Sin aportes {item.currency} confirmados</p>}
        {item.pending > 0 && <p className="text-sm">{plural(item.pending, 'aporte')} por revisar, fuera de los totales.</p>}
        {item.destinations.filter(dest => dest.total !== null || dest.commitment !== null).map(dest => <div key={dest.purpose} className="text-sm space-y-1" data-contribution-group={`${person.contributorId}:${item.currency}:${dest.purpose}`}>
          <h5 className="font-bold">{purposeName(dest.purpose)}</h5>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 tabular-nums">
            {[['Compromiso del mes', dest.commitment], ['Habitual registrado', dest.regular], ['Extraordinario registrado', dest.extra],
              ['Sin clasificación del mes', dest.unclassified], ['Total aportado del mes', dest.monthly], ['Acumulado histórico', dest.total]].map(([name, amount]) => <div key={name} className="contents">
                <dt>{name}</dt><dd className="text-right font-bold">{money(amount, item.currency)}</dd></div>)}
          </dl>
        </div>)}
      </section>)}
    </section>)}</div>
  </section>;
}
