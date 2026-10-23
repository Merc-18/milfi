import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { formatAmount } from '../presentation/format.js';

export default function DistributionDetails({ distribution }) {
  return (
    <div className="space-y-4">
      <section className="bg-principal/20 border-2 border-principal/40 rounded-[24px] p-5">
        <h2 className="font-bold text-lg mb-2">🌸 Gasto fijo aplicado</h2>
        <p className="font-bold text-xl break-words">{formatAmount(distribution.fixedExpense)}</p>
      </section>
      <section className="bg-acento/20 border-2 border-acento/40 rounded-[24px] p-5">
        <h2 className="font-bold text-lg mb-2">🍑 Variables · {FINANCIAL_RULES.variablePercentage}% del sobrante</h2>
        <p className="font-bold text-xl mb-3 break-words">{formatAmount(distribution.variable.total)}</p>
        <dl className="space-y-2">
          {FINANCIAL_RULES.variableCategories.map(category => (
            <div key={category.id} className="flex flex-wrap justify-between gap-2 text-sm bg-white/50 px-3 py-2 rounded-xl">
              <dt>{category.name} ({category.percentage}%)</dt>
              <dd className="font-bold break-all">{formatAmount(distribution.variable.categories[category.id])}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="bg-exito/30 border-2 border-exito/50 rounded-[24px] p-5">
        <h2 className="font-bold text-lg mb-2">💚 Ahorro · {FINANCIAL_RULES.savingsPercentage}% del sobrante</h2>
        <p className="font-bold text-xl mb-3 break-words">{formatAmount(distribution.savings.total)}</p>
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt>Personal ({FINANCIAL_RULES.personalSavingsPercentage}%)</dt>
            <dd className="font-bold break-all">{formatAmount(distribution.savings.personal)}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 bg-white p-3 rounded-xl">
            <dt>Pareja ({FINANCIAL_RULES.coupleSavingsPercentage}%)</dt>
            <dd className="font-bold break-all">{formatAmount(distribution.savings.couple)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
