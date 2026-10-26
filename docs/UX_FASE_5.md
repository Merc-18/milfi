# MilFi · UX Fase 5

Entrega en `feat/ux-fase-5`, basada en `origin/main` (`4884fa2`). No se escribe,
migra ni importa nada contra la base real. La migración
`20261023173000_milfi_control_contributions.sql` sigue sin aplicar. Paleta,
fuente y dependencias no cambian. Todas las pruebas usan datos inventados.

## Fórmulas

- **Tareas** (`reviewTasks`; un único contador para Inicio, la franja y «Por revisar»):
  `total = por confirmar + sin mes del plan`.
  - Por confirmar: movimientos con estado `pending`.
  - Sin mes del plan: depósitos de ahorro que cuentan, sin `planPeriod`, y cuyo
    plan del mes anterior (R − 1) existe en Fiorella.
  - Los depósitos de ahorro cuyo R − 1 no tiene plan en Fiorella (Control empieza
    antes que el historial de Fiorella) van a «Depósitos sin plan de Fiorella (N)».
    Esa lista va plegada, no suma tareas y se pueden asignar si se quiere.
- **Sugerencia de plan** (`planSuggestion`): plan = R − 1. Es *exacta* solo si el
  depósito está en PEN y su importe es igual al plan; se compara como decimal
  exacto, sin `Number()`.
- **Dólares** (`usdSavings`):
  - con depósitos de ahorro USD se muestra «Ahorro en dólares» = depósitos USD − retiros USD;
  - sin ellos, «Gastado en dólares» = retiros USD;
  - si no hay nada en USD, no se muestra nada.
  - El gráfico USD solo aparece si hay depósitos USD.
- **Meses visibles** (`monthlyRows`): un mes R aparece si tiene movimientos que
  cuentan, o si existe el plan de R − 1 y R ≤ el mes actual en Lima.
- **Plan del mes anterior** (`planText`): «S/ asignado de S/ plan (plan de mes)».
- **Ahorro de pareja en Fiorella** (`coupleSavingsLight`): si el mes elegido es el
  actual o uno futuro y no tiene depósitos asignados, se muestra en gris
  «Se deposita en <mes siguiente>». Los meses pasados conservan el semáforo
  Completo / Parcial / Pendiente.
- **Compromiso** (`commitmentLight`): recibido ≥ acordado es Cumplido (verde);
  algo recibido es Parcial (amarillo); nada recibido es Sin aportes (gris).

## Formato

`formatMoney` es el único formato de dinero: `S/ 1,234.56` y `US$ 1,234.56`,
conservando todos los decimales. `plural()` sustituye todos los «(s)». Una
prueba recorre el texto visible de `src/components` y `src/routes` (JSX y
literales, sin comentarios ni expresiones regulares) en busca de «(s)» y de
`PEN 12` / `USD 12`.

## Pruebas

- Nuevas:
  - `moneyText.test.js`: formateador, plurales y búsqueda en el texto visible.
  - `controlTasks.test.js`: tareas, sugerencia, USD, meses, textos y semáforos.
  - `controlTasks.browser.test.js`: contador común, asignación individual y en
    lote, casillas, nada sin confirmar, fallos parciales, tarjetas, USD y
    ausencia de franja sin tareas.
  - `noHorizontalScroll.browser.test.js`: todas las rutas a 320, 390, 768 y 1280 px.
- `tests/helpers/clock.js` fija la fecha de la página en las pruebas con datos de
  2031. El arnés admite `window.failControlSaves` para simular fallos.
- Las pruebas existentes se adaptaron a los textos y controles nuevos. No se
  retiró ninguna prueba sin reemplazo; los cambios por prueba se detallan en el PR.
