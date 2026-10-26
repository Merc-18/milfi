// A comment with gasto(s) and PEN 1,234.00 is not visible text.
/* Neither is this block: movimiento(s), USD 5. */
const pattern = /PEN 1\d|(s)/;
export const Sample = () => <p title={`US$ ${pattern.source.length}`}>2 gastos</p>;
