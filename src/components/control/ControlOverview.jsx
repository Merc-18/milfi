import { controlMoney } from '../../presentation/control.js';

// Separate registered savings balances. No combined total or currency conversion.
export default function ControlOverview({ balance, usdBalance, onReview }) {
  return <section className="rounded-[24px] bg-principal/40 p-4 shadow-soft space-y-2" data-testid="control-balance" aria-labelledby="balance-title">
    <h2 id="balance-title" className="font-bold">Saldo de ahorro según lo registrado</h2>
    <p className="text-4xl font-bold tabular-nums break-all">{balance.negative ? '−' : ''}{controlMoney(balance.amount, 'PEN')}</p>
    <p className="text-sm font-bold">Saldo USD</p>
    <p className="text-3xl font-bold tabular-nums break-all" data-testid="control-usd-balance">{usdBalance.negative ? '−' : ''}{controlMoney(usdBalance.amount, 'USD')}</p>
    {(balance.usdWithdrawn || balance.pending > 0) && <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {balance.usdWithdrawn && <span>Retirado en dólares: <strong className="tabular-nums">
        {controlMoney(balance.usdWithdrawn, 'USD')}</strong></span>}
      {balance.pending > 0 && <button type="button" onClick={onReview} className="min-h-11 font-bold underline">
        {balance.pending} {balance.pending === 1 ? 'movimiento' : 'movimientos'} por revisar</button>}
    </p>}
  </section>;
}
