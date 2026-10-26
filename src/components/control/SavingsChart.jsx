import BalanceSteps from '../charts/BalanceSteps.jsx';
import { cardClass } from '../FiorellaSession.jsx';

// Accumulated savings by month; dollars only when there are USD savings deposits.
export default function SavingsChart({ pen, usd, selected }) {
  return <section className={`${cardClass} space-y-2 lg:col-span-2`} aria-labelledby="balance-chart-title" data-testid="balance-chart">
    <h2 id="balance-chart-title" className="font-bold">Ahorro acumulado</h2>
    <div data-currency-chart="PEN"><BalanceSteps series={pen} selected={selected} label="Ahorro acumulado en soles" /></div>
    {usd && <div data-currency-chart="USD"><h3 className="font-bold text-sm">En dólares</h3>
      <BalanceSteps series={usd} selected={selected} currency="USD" label="Ahorro acumulado en dólares" /></div>}
  </section>;
}
