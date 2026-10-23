# MilFi · UX Fase 4

Entrega en `feat/ux-fase-4`, basada en `origin/main` (`2aaee01`). Se continúa el
trabajo interrumpido: los tres commits previos se conservan. Sin merge ni
migración, carga, reversión o despliegue sobre la base real.

## Comportamiento entregado

- Control usa el mismo libro de movimientos con Supabase y en la demo en memoria.
  «Registrar movimiento» abre un formulario con tipo, destino, aportante, importe,
  moneda y fecha; el mes viene de la fecha y el responsable de la sesión. Las
  referencias opcionales quedan en «Más opciones». No se piden IDs ni revisiones.
- Los depósitos manuales nuevos de ahorro exigen elegir mes del plan:
  `MISSING_PLAN_PERIOD`. El atajo al mes anterior no lo selecciona por sí solo.
  `plan_year/plan_month` se guardan juntos y solo en depósitos de ahorro.
- `prepareImportedReview` permite completar los campos pendientes del Excel y
  aceptar o rechazar con referencia; se preservan los valores originales.
  `prepareControlPlanAssignment` asigna o cambia el plan sin invalidar revisiones.
  Las asignaciones pueden modificarse desde el detalle.
- Saldo en PEN = depósitos de ahorro PEN − retiros PEN. Solo cuentan estados
  `reviewed` o `imported` sin motivos pendientes; USD se informa por separado.
  La gráfica muestra el saldo por mes y marca los retiros.
- La tabla usa exactamente: Mes | Gastos (Milton) | Ahorro depositado | Plan del
  mes | Cubierto | Estado | Retiros. «Ahorro depositado» usa `period`; «Cubierto»
  usa el mes del plan aunque el dinero haya entrado después. Incluye meses con
  plan sin movimientos; el estado usa los tokens existentes `--color-semaforo-*`.
- «Por revisar» separa en su explicación las confirmaciones pendientes y los
  ahorros que aún no tienen plan. Una posible fecha invertida se muestra como
  aviso en la revisión o el detalle, sin alterar fechas ni añadir bloqueos.
- El ahorro cubierto del Resumen de Fiorella usa las asignaciones al plan del mes.
  Se pueden eliminar metas propias con confirmación local; las metas del Excel y
  el acceso de solo lectura no ofrecen esa acción.
- En Gasto fijo, los segmentos dicen «Sumar» y «Reemplazar» y caben a 360 px.

## Excel, decisiones y ensayo local

El lector reconoce ` 1Enero`, `1Enero` y ` 1 Marzo`, con fixtures inventados. Omite
los depósitos vacíos, incluidas fórmulas sin resultado. La plantilla de decisiones
propone Milton para gastos, Fiorella para ahorro, PEN para números sin símbolo y
`zeroAmounts: "omit"`. El texto con `$` conserva monto/moneda pendientes y una
sugerencia US$ que requiere confirmación.

Ensayo del 23/10/2026 sobre `~/milfi-datos/Control_Finanzas_M_F.xlsx`, con una copia
de la plantilla privada en `/tmp/milfi-control-decisiones.json`, sin red:

| Resultado | Cantidad |
|---|---:|
| Movimientos a cargar | 30 |
| Depósitos preparados | 22 |
| Retiros pendientes | 8 |
| Depósitos cero omitidos | 1 |
| Inválidos | 0 |

| Motivo (pueden solaparse) | Recuento |
|---|---:|
| `MISSING_CONFIRMED_PERIOD` | 8 |
| `SOURCE_PERIOD_AMBIGUOUS` | 8 |
| `UNRESOLVED_MONEY` | 4 |
| `SOURCE_AMOUNT_INTERPRETATION_REQUIRED` | 4 |
| `SOURCE_CURRENCY_AMBIGUOUS` | 4 |

Los ocho retiros necesitan confirmar el mes; cuatro también necesitan confirmar
monto y moneda. Ningún importe real se incluye en el informe ni en las pruebas.
Tras cargar sobre Control vacío, `/control` tendría **19 tareas**: esos 8 retiros
y 11 depósitos de ahorro sin mes del plan. Estos últimos ya cuentan en el saldo;
su asignación cambia «Cubierto» y el semáforo, no el saldo.

La migración se llama `20261023120000_milfi_control_plan_period.sql`: mismo formato
de 14 dígitos y fecha de hoy. Solo se probó en PostgreSQL en memoria. La guía
explica `--include-all` para proyectos con la migración anterior del día 24 ya en
su historial. No se renombra ni reaplica ninguna migración anterior.

## Validación

| Comprobación | Resultado |
|---|---|
| `npm run lint` | Verde |
| `npm test` | 273/273 |
| `npm run build` | Verde (también forma parte de `test:browser`) |
| `npm run test:browser` | 33/33, 30 recorridos más 3 contenedores |
| `git diff --check` | Sin errores |

Se comprueban las fórmulas de saldo e importación, separación de periodos,
semáforos, datos vacíos/cero, revisión del texto con dólares, formulario compacto,
cambio de asignación y eliminación de metas. Las pruebas de persistencia recorren
la migración y las políticas RLS en PGlite: correcciones y asignaciones sobreviven
a una recarga y Fiorella no puede escribir. La plantilla de reversión se ejecuta
solo con datos inventados: borra un lote y sus revisiones, mantiene otros lotes y
la auditoría. Chromium usa fixtures inventados y persistencia simulada.

PGlite y los recorridos de navegador no sustituyen una comprobación posterior con
usuarios reales de Supabase. La entrega no realizó esa conexión. El build mantiene
el aviso de tamaño del bundle; no se añadieron dependencias.

## Continuación y carga real

[Guía completa para el propietario](CARGA_CONTROL_FASE_4.md): migración y consultas
de verificación, archivo privado de decisiones, comandos exactos de ensayo y carga,
recuentos esperados en `/control` y reversión limitada a un lote.

Commits heredados: `44d8095` (dominio/importación), `910cbfc` (persistencia/demo y
eliminación de metas), `db6047c` (vistas derivadas). Continuación: `9429c86`
(decisiones, migración y reversión), `9d0ce85` (interfaz y recorridos) y commit documental.
