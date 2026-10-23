# Cierre de mejoras de Control M&F

Base conservada: `3c0237d` (desfase mensual). Este cierre no modifica la referencia
R − 1, las asignaciones explícitas ni las reglas de Finanzas de Fiorella.

## Qué estaba implementado

La tabla mensual (`MonthlyTable.jsx` y `monthlyRows()`) ya separaba los depósitos
y retiros por moneda; el plan y su cobertura continúan exclusivamente en PEN.
Los pendientes de revisión ya estaban excluidos de los totales.

El saldo y `BalanceSteps` solo representaban PEN, con una nota de retiros USD.
No existía una vista acumulada de aportes por persona, moneda, mes y destino.

## Qué se completó

- `savingsBalance(entries, currency)` y `balanceSeries(entries, selected, currency)`
  reutilizan la aritmética exacta existente para cada moneda. PEN conserva su
  fórmula; USD tiene su propio saldo, escala, serie y marcadores de retiros.
  `ControlOverview` y el gráfico de Control muestran ambas monedas sin total
  combinado ni conversión.
- `contributionHistory(entries)` deriva aportes de los movimientos existentes.
  `ContributionHistory.jsx` muestra total y acumulado mensual por Milton/Fiorella,
  moneda y destino. Usa el mes real del movimiento, mantiene los pendientes fuera
  y no descuenta retiros del historial de quién aportó.
- Se corrigieron dos escapes redundantes en una instrucción existente de la
  prueba de Control para dejar lint en verde, sin cambiar su comportamiento.

## Contraste con el bloque inferior del Excel

Se leyó exclusivamente el archivo local y el archivo privado de decisiones.
No se reimportó ni se consultó o escribió Supabase. El bloque inferior contiene
cinco resúmenes calculados; no es otra fuente de movimientos que deban sumarse.
El archivo quedó intacto.

| Resumen | Contraste con las filas originales |
|---|---|
| Total de gastos de Milton | Coincidencia exacta |
| Total de ahorro de Fiorella | Diferencia menor a un céntimo en el valor guardado de la fórmula |
| Total acumulado de ahorro | Diferencia menor a un céntimo en el valor guardado de la fórmula |
| Total retirado de ahorro | Coincidencia exacta de los importes numéricos |
| Saldo disponible de ahorro | Diferencia menor a un céntimo en el valor guardado de la fórmula |

Las tres diferencias se conservan como `SUBCENT_CACHE_DIFFERENCE`: no se aplicó
redondeo ni se alteró ningún importe para forzar coincidencias. La comparación
con retiros es de la aritmética del archivo: el ensayo local con las decisiones
originales sigue teniendo 8 movimientos pendientes y 4 importes sin resolver.
No significa que esos retiros estén revisados ni verifica revisiones posteriores
guardadas en la base real. Tampoco supone que el texto con dólares cubra planes
PEN o forme parte de las sumas numéricas del Excel.

El contraste reproducible es de solo lectura y muestra códigos y recuentos,
sin importes:

```bash
node scripts/check-control-contributions.mjs "$HOME/milfi-datos/Control_Finanzas_M_F.xlsx" "$HOME/milfi-datos/control-decisiones.json"
```

El comando devuelve estado 1 mientras haya diferencias, incluidas las de caché
menores a un céntimo. Es un aviso de contraste; no ejecuta fórmulas, importación,
corrección o escritura. `controlWorkbookContrast.js` mantiene separados el
contraste de origen y la comparación con los aportes preparados en memoria.

## Verificación focalizada

- `node tests/controlCompletion.test.js`: 7/7 pruebas nuevas de monedas,
  acumulados, pendientes, recarga y contraste con un Excel inventado.
- `node tests/controlLedgerView.test.js`: 5/5 pruebas existentes de Control.
- `node tests/controlMonthlyOffset.test.js`: 12/12 para conservar el desfase,
  los resultados de Fiorella y la recarga de persistencia sintética.
- `npm run test:control:browser`: 3 recorridos nuevos más su contenedor, 4/4,
  con saldos, gráficas, histórico, 360/1280 px y lectura de Fiorella sin acciones
  de escritura. Solo fixtures inventados y persistencia simulada.
- `npm run lint`, `npm run build` y `git diff --check`: verdes.

No se repitieron las suites generales ni se ejecutaron auditorías de la base.
Los nuevos casos quedan incluidos en `npm test` y `npm run test:browser` para
las siguientes verificaciones completas.

Entrega en un commit local adicional, sin push ni publicación. Se conservan
los 30 movimientos reales, las fechas y asignaciones, permisos y RLS. Los
importes, periodos y cálculos de Finanzas de Fiorella permanecen inalterados.
