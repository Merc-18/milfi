import { controlMoney } from '../../presentation/control.js';

const signed = (value, currency) => `${value.negative ? '−' : ''}${controlMoney(value.amount, currency)}`;

// Savings in soles; dollars in a small line only when there is something in USD.
export default function SavingsCard({ balance, usd }) {
  return <section className="rounded-[24px] bg-principal/40 p-4 shadow-soft space-y-1" data-testid="control-balance" aria-labelledby="balance-title">
    <h2 id="balance-title" className="font-bold">Ahorro disponible</h2>
    <p className="text-4xl font-bold tabular-nums break-all">{signed(balance, 'PEN')}</p>
    {usd && <p className="text-sm" data-testid="control-usd-balance">{usd.kind === 'saved' ? 'Ahorro en dólares' : 'Gastado en dólares'}:{' '}
      <strong className="tabular-nums">{signed(usd, 'USD')}</strong></p>}
    <p className="text-xs">Según lo registrado y revisado</p>
  </section>;
}
