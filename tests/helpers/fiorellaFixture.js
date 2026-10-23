import { xlsxBytes } from './xlsxBuilder.js';
import { FIXED_CATEGORIES } from '../../src/domain/fiorellaCategories.js';

// Invented workbook with the labels of Fiorella's template. Every amount, date,
// description and goal here is made up; no private value is reproduced.
export const serial = iso => (Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) - Date.UTC(1899, 11, 30)) / 86400000;
export function syntheticFiorellaXlsx({ configuration = {}, gv = {}, gfFutureActual = false } = {}) {
  const config = { B2: '⚙️ Configuración', J2: 'GF_TOPE', K2: 1500, J3: 'PCT_GV', K3: 0.4, J4: 'PCT_AH', K4: 0.6, J5: 'PCT_AH_PER', K5: 0.6, J6: 'PCT_AH_PAR', K6: 0.4,
    B65: '  📁 Salud', C65: 0.5, B72: '  📁 Ocio', C72: 0.5, ...configuration };
  const history = { B6: 'Mes', C6: 'Año', D6: '💵 Ingreso', E6: '🌸 GF', F6: 'Sobrante',
    B7: 'Enero', C7: 2031, D7: 3000, E7: 1200, F7: { f: 'D7-E7', v: '1800' },
    B8: 'Febrero', C8: 2031, D8: { n: '3100.1000000000001' }, E8: 1200,
    B9: 'Marzo', C9: 2031, D9: 3500, E9: 1300,
    B10: 'Abril', C10: 2031,
    B11: 'TOTAL', D11: { f: 'SUM(D7:D10)', v: '9600.1' }, B13: '💡 Nota explicativa que no es un mes' };
  const gf = { B8: 'Subcategoría', C8: 'Enero 2031', F8: 'Febrero 2031', I8: 'Marzo 2031', B9: 'Categoría' };
  for (const start of ['C', 'F', 'I']) { const c = start.charCodeAt(0); Object.assign(gf, { [`${start}9`]: 'Presup.', [`${String.fromCharCode(c + 1)}9`]: 'Real', [`${String.fromCharCode(c + 2)}9`]: 'Dif.' }); }
  let row = 10; const totals = { C: 0, D: 0, F: 0, G: 0 };
  for (const group of FIXED_CATEGORIES) {
    gf[`B${row++}`] = `  📁 ${group.name}`;
    for (const child of group.children) {
      gf[`B${row}`] = child.name;
      gf[`C${row}`] = 10; gf[`D${row}`] = { n: '12.300000000000001' }; totals.C += 10; totals.D += 12.3;
      gf[`F${row}`] = 20; totals.F += 20;
      if (child.id !== 'servicios-luz') { gf[`G${row}`] = 5; totals.G += 5; }
      gf[`I${row}`] = 0;
      if (gfFutureActual && child.id === 'otros-otros') gf[`J${row}`] = 3;
      row++;
    }
    gf[`B${row++}`] = `  Subtotal ${group.name}`;
  }
  Object.assign(gf, { [`B${row}`]: '🌸 TOTAL GF', [`C${row}`]: { f: 'x', v: String(totals.C) }, [`D${row}`]: { f: 'x', v: String(totals.D) },
    [`F${row}`]: { f: 'x', v: String(totals.F) }, [`G${row}`]: { f: 'x', v: String(totals.G) }, [`B${row + 1}`]: 'Tope mensual GF' });
  const track = { B8: 'N°', C8: 'Fecha', D8: 'Mes', E8: 'Categoría', F8: 'Subcategoría', H8: 'Descripción', M8: 'Monto', O8: 'Notas',
    B9: 1, C9: serial('2031-02-03'), D9: 'Febrero', E9: 'Ocio', F9: 'Antojo', H9: 'Compra inventada', M9: { n: '12.300000000000001' }, O9: 'Nota inventada',
    B10: 2, C10: serial('2031-02-10'), D10: 'Febrero', E10: 'Salud', F10: 'Farmacia', H10: 'Otra compra inventada', M10: 20,
    B11: 3, B12: 4, B20: 'Total gastos registrados:', M20: { f: 'SUM(M9:M19)', v: '32.3' }, ...gv };
  const goals = { B34: 'Nombre', C34: 'Monto objetivo', D34: 'Meses', E34: 'Aporte/mes', F34: 'Fecha límite', G34: 'Estado', I34: 'Notas',
    B35: 'Meta inventada', C35: 900, D35: 3, E35: { f: 'C35/D35', v: '300' }, F35: 'Jun 2031', G35: '🟢 Activa', I35: 'Notas de prueba',
    B41: '💡 Texto de ayuda que no es una meta' };
  return xlsxBytes({ sheets: [{ name: '🏠 Dashboard', cells: { B2: 'Resumen' } }, { name: '⚙️ Configuración', cells: config }, { name: '📊 Historial', cells: history },
    { name: '🔮 Simulador', cells: goals }, { name: '📋 Track GF', cells: gf }, { name: '📋 Track GV ', cells: track }] });
}
