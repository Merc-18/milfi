import { controlMoney, personName, purposeName } from '../../presentation/control.js';
import { formatPeriod } from '../../presentation/format.js';

export default function ContributionHistory({ groups }) {
  return <section className="rounded-[24px] bg-white p-4 shadow-soft space-y-3" aria-labelledby="contributions-title" data-testid="control-contributions">
    <h2 id="contributions-title" className="font-bold">Historial acumulado de aportes</h2>
    <p id="contributions-note" className="text-sm text-texto-light">Depósitos revisados por persona, moneda, mes recibido y destino. El acumulado conserva los aportes realizados; los retiros se muestran aparte.</p>
    {!groups.length ? <p className="text-sm">Aún no hay aportes revisados.</p> : <div className="grid gap-3 lg:grid-cols-2">
      {groups.map(group => <section key={group.key} className="rounded-xl border border-secundario p-3 space-y-2" data-contribution-group={group.key}>
        <h3 className="font-bold text-sm">{personName(group.contributorId)} · {group.currency} · {purposeName(group.purpose)}</h3>
        <p className="font-bold tabular-nums">Total aportado: {controlMoney(group.total, group.currency)}</p>
        <div className="overflow-x-auto"><table className="w-full text-xs sm:text-sm" aria-describedby="contributions-note">
          <caption className="sr-only">Aportes de {personName(group.contributorId)} en {group.currency} para {purposeName(group.purpose)}</caption>
          <thead><tr className="text-left"><th scope="col" className="py-2">Mes recibido</th><th scope="col">Aportado</th><th scope="col">Acumulado</th></tr></thead>
          <tbody>{group.months.map(month => <tr key={month.key} className="border-t border-secundario" data-contribution-month={month.key}>
            <th scope="row" className="py-2 text-left font-normal">{formatPeriod(month.period)}</th>
            <td className="tabular-nums px-2">{controlMoney(month.amount, group.currency)}</td>
            <td className="tabular-nums">{controlMoney(month.cumulative, group.currency)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>)}
    </div>}
  </section>;
}
