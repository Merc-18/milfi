# Control M&F · referencia habitual al plan del mes anterior

El ajuste afecta exclusivamente a la presentación de Control. Para una fila de
recepción R se consulta el plan original de Fiorella de R − 1 mes, una sola vez.
El helper puro `previousPlanPeriod()` maneja enero/diciembre y valida los límites
del calendario. El mismo helper ofrece el atajo opcional del formulario; no elige
ni guarda un plan por sí mismo.

La tabla muestra «Mes recibido», «Gastos depositados», «Ahorro depositado»,
«Ahorro previsto», «Ahorro asignado», «Estado» y «Retiros». Explica el desfase una
sola vez y vincula la explicación a la tabla mediante `aria-describedby`.
El ahorro previsto identifica el mes original de su plan y conserva la marca
«Proyectado» cuando corresponde.

- Ahorro depositado: movimientos válidos del periodo real de la fila, por moneda.
- Ahorro previsto: ahorro de pareja PEN del plan original del mes anterior.
- Ahorro asignado: suma PEN de depósitos con asignación explícita a ese plan
  original, aunque hayan llegado en otros meses.
- Estado: comparación monetaria existente entre asignado y previsto, con los
  mismos estados Sin plan, Pendiente, Parcial y Completo.

La coincidencia de importes no crea asignaciones. Los depósitos sin plan siguen
sin asignarse y en la lista de revisión. USD y PEN permanecen separados, sin
conversión. Los movimientos pendientes de revisión no entran en los totales.
Los planes proyectados no se incorporan como depósitos ni como deuda vencida.
El detalle conserva por separado fecha/mes de recepción y mes del plan asignado.

## Invariantes comprobadas

`record.period`, `record.effectiveDate` y `record.planPeriod` no se modifican.
Los totales globales y las series por fecha real permanecen idénticos. Los
importes y periodos de Finanzas de Fiorella permanecen inalterados, al igual que
GF/GV, distribución 40/60, ahorro personal y de pareja, proyecciones, metas e
historial. Sus funciones, rutas, repositorios y reglas financieras no se editan.

No se leyó ni reimportó el Excel real ni se modificaron los 30 movimientos
cargados. No se ejecutaron migraciones, cambios de RLS ni escrituras reales.
Las pruebas de persistencia usan únicamente PostgreSQL en memoria y datos
inventados; comprueban también que la comparación no genera eventos de auditoría.

## Verificación

- `node tests/controlMonthlyOffset.test.js`: 12/12 casos nuevos requeridos.
- `node tests/controlLedgerView.test.js`: 5/5 casos de presentación existentes.
- `npm test`: 285/285.
- `npm run test:browser`: 33/33, incluidos etiquetas, explicación accesible,
  plan proyectado, asignaciones y referencias del detalle.
- `npm run lint`: verde.
- `npm run build`: verde.
- `git diff --check`: sin errores.

La entrega queda en un commit local de `feat/ux-fase-4`, sin push, pendiente de
revisión del propietario.
