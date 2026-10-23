import { Settings as SettingsIcon } from 'lucide-react';
import { FINANCIAL_RULES } from '../domain/financialRules.js';
import { formatAmount } from '../presentation/format.js';

export default function Configuracion() {
  const rules = FINANCIAL_RULES;
  const rows = [
    ['Gasto fijo · Tope', formatAmount(rules.fixedExpenseCap)],
    ['Gastos variables', `${rules.variablePercentage}% del sobrante`],
    ['Ahorro total', `${rules.savingsPercentage}% del sobrante`],
    ['Ahorro personal', `${rules.personalSavingsPercentage}% del ahorro`],
    ['Ahorro de pareja', `${rules.coupleSavingsPercentage}% del ahorro`],
  ];
  return (
    <div className="pb-10">
      <header className="my-6 flex items-center gap-3"><SettingsIcon size={26} aria-hidden="true" /><div><h1 className="text-2xl font-bold">Configuración oficial</h1><p className="text-sm">Finanzas de Fiorella</p></div></header>
      <section className="bg-white p-5 rounded-[24px] shadow-soft mb-6">
        <h2 className="font-bold text-lg mb-4">Reglas definitivas</h2>
        <dl className="space-y-4 text-sm">{rows.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 border-b border-fondo pb-3"><dt>{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl>
        <p className="text-sm mt-4">Fuente: configuración oficial del Excel de Fiorella. Los porcentajes se conservan sin cambios.</p>
      </section>
      <section className="bg-acento/20 p-5 rounded-[24px] shadow-soft mb-6">
        <h2 className="font-bold text-lg mb-4">Distribución de gastos variables</h2>
        <dl className="space-y-3 text-sm">{rules.variableCategories.map(category => <div key={category.id} className="flex justify-between gap-2"><dt>{category.name}</dt><dd className="font-bold">{category.percentage}% de variables</dd></div>)}</dl>
      </section>
      <p className="text-sm">La plantilla define reglas y categorías. Sus importes simulados no se incorporan al historial real.</p>
    </div>
  );
}
