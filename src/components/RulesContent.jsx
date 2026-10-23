import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { formatAmount } from '../presentation/format.js';

const rowClass = 'flex flex-wrap justify-between gap-2 border-b border-fondo pb-3';

// Official rules, shared by /fiorella/configuracion and the rules sheet.
export default function RulesContent() {
  const rules = FINANCIAL_RULES;
  const rows = [
    ['Gasto fijo · Tope', formatAmount(rules.fixedExpenseCap)],
    ['Gastos variables', `${rules.variablePercentage}% del sobrante`],
    ['Ahorro total', `${rules.savingsPercentage}% del sobrante`],
    ['Ahorro personal', `${rules.personalSavingsPercentage}% del ahorro`],
    ['Ahorro de pareja', `${rules.coupleSavingsPercentage}% del ahorro`],
  ];
  return <div className="space-y-4">
    <section className="bg-white p-5 rounded-[24px] shadow-soft">
      <h3 className="font-bold text-lg mb-4">Reglas definitivas</h3>
      <dl className="space-y-4 text-sm">{rows.map(([label, value]) => <div key={label} className={rowClass}><dt>{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl>
      <p className="text-sm mt-4">Fuente: configuración oficial del Excel de Fiorella. Los porcentajes se conservan sin cambios.</p>
    </section>
    <section className="bg-acento/20 p-5 rounded-[24px] shadow-soft">
      <h3 className="font-bold text-lg mb-4">Distribución de gastos variables</h3>
      <dl className="space-y-3 text-sm">{rules.variableCategories.map(category => <div key={category.id} className="flex justify-between gap-2">
        <dt>{category.name}</dt><dd className="font-bold">{category.percentage}% de variables</dd></div>)}</dl>
    </section>
  </div>;
}
