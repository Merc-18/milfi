# MilFi 2.0 — Fase 1

Las observaciones de la revisión independiente se atienden en
[Fase 1.1](FASE_1_1.md), que actualiza contratos, presentación y diagnóstico
de confidencialidad del código heredado. Este documento conserva el alcance inicial.

## Alcance y decisiones técnicas

Esta entrega implementa exclusivamente la base técnica autorizada en
`feat/milfi-v1-mejoras`. Conserva React, Vite, Zustand, Router, Motion y la paleta
visual existente. No instala ni actualiza dependencias.

### Separación de responsabilidades

| Capa | Ubicación | Responsabilidad |
| --- | --- | --- |
| Configuración oficial | `src/domain/financialRules.js` | Tope, porcentajes, categorías GV e identificador de reglas |
| Dinero y distribución | `src/domain/amounts.js`, `distribution.js` | Aritmética decimal exacta y cálculo sin efectos secundarios |
| Contratos y validación | `src/domain/models.js` | Identidades, módulos, periodos, categorías, movimientos y procedencia |
| Operaciones | `src/application/simulations.js` | Preparar una simulación de sesión; no registrar ingresos reales |
| Estado de interfaz | `src/store/useStore.js` | Estado inicial vacío y simulaciones separadas |
| Presentación | `src/presentation/`, `src/components/`, `src/routes/` | Formateo exacto, vistas y navegación |

Se utilizan JavaScript con contratos JSDoc y validación ejecutable para no añadir
un toolchain TypeScript durante esta fase. Las declaraciones de categorías,
presupuesto/real y asignación mensual preparan contratos; no equivalen a CRUD,
validadores completos para todas las entidades o tablas de una base de datos.

El catálogo GF detallado, los gastos, metas y la conciliación todavía no tienen
operaciones de edición. No se copian registros de ninguno de los Excel.

### Contrato de registros

Los registros comparten identificador, módulo, periodo, origen, estado de
validación, procedencia, actor, `schemaVersion`, `revision` y `householdId`.

- `origin`: `simulated` o `real`. Es independiente de la validación.
- `validationStatus`: `pending`, `confirmed` o `rejected`.
- `provenance`: tipo e identificador de fuente; para Excel, hoja, fila, huella,
  lote de importación y valores originales de texto, sin convertirlos.
- `actorId`: quien registra. No equivale a `contributorId`, quien aporta.
  Un autor histórico desconocido permanece desconocido.
- `period`: año/mes. Un registro pendiente puede conservar `null`; no se inventa
  un periodo para poder confirmarlo.
- `effectiveDate`: fecha exacta opcional para depósitos conocidos solo por mes.
  Un retiro confirmado requiere fecha válida. Las fechas ambiguas permanecen
  en la procedencia, con el campo interpretado sin completar.
- `amount` y `currency`: campos interpretados, separados de su texto original.
  No se elimina un símbolo monetario para adivinar una moneda ni se redondea
  automáticamente. Los movimientos confirmados exigen valores resueltos y no
  pueden contener fracciones de céntimo mientras la política siga pendiente.
- `householdId` y `revision`: preparación para aislamiento y concurrencia futura.
  Las simulaciones locales no inventan una pareja autenticada: household y actor
  son `null`. Los registros confirmados requieren un ámbito explícito.

`partitionMovements` separa simulados, reales confirmados, pendientes, rechazados
e inválidos. No suma cantidades ni confirma registros. Su validación verifica el
contrato y la clasificación declarada; no prueba la autenticidad de un archivo,
una identidad o una huella. Eso corresponde al futuro servidor e importador.

Los movimientos de Control distinguen depósitos para gastos y para ahorro.
Fase 1.1 retira la prohibición de otros destinos de retiro: admite destino
desconocido o tratamiento pendiente, sin incorporarlos a saldos confirmados.
No hay seguimiento de gastos
personales de Milton. No se implementó un cálculo de saldo ni una política
de sobregiro.

### Clasificación oficial de fuentes

| Fuente | Uso |
| --- | --- |
| Configuración del Excel actual de Fiorella | Referencia funcional oficial; porcentajes definitivos |
| Registros del Excel actual de Fiorella | Simulados; no importables como historial real |
| Excel actualizado de Fiorella | Futuro origen real, aún no recibido ni importado |
| Control Finanzas M&F | Origen real inicial; importación no implementada |
| Mocks del código anterior | Excluidos de migraciones; M1 identifica contenido potencialmente sensible en el historial |
| Entradas manuales de la calculadora | Simulaciones locales, sin persistencia |

Las procedencias simuladas no pueden validarse como origen real. Los registros
ambiguos requieren revisión y permanecen fuera de saldos confirmados. No existe
una operación que vincule simulaciones con depósitos de Control.

### Aritmética y decisiones financieras

El motor opera con cadenas decimales y coeficientes `BigInt`. Las proporciones
aprobadas producen resultados exactos; no utiliza flotantes binarios para repartir
dinero y no impone dos decimales como resultado de la operación.

Ejemplo exclusivamente sintético: una distribución con fracciones de céntimo
mantiene todos sus decimales y señala `requiresRoundingDecision`. La presentación
también conserva esos decimales. Guardarla como simulación no equivale a aprobar
su liquidación monetaria ni a confirmar una operación real.

Se rechazan entradas negativas, no finitas, con moneda incrustada o formato
ambiguo, y GF superior al tope oficial. El motor no recorta silenciosamente GF.
La entrada está limitada a 100 caracteres por razones técnicas, sin establecer
un nuevo tope financiero. Los valores vacíos no se convierten en cero.

Si el sobrante es negativo o cero se devuelve `decision_required`, sin asignar
importes. No se resolvieron las discrepancias de esos casos entre hojas del Excel.
Las incidencias de subtotales y del acumulado del simulador se mantienen pendientes
de revisión; no se reprodujeron ni corrigieron dentro de un importador.

### Interfaz

La entrada ofrece ambos módulos, con navegación interna de Fiorella y compatibilidad
con rutas anteriores. Control y el inicio no muestran importes de ejemplo ni saldos
cero como sustituto de un historial pendiente.

La calculadora y el historial indican que las simulaciones solo duran la sesión.
Guardar dos simulaciones del mismo periodo conserva ambas; son escenarios
independientes, no una decisión sobre acumulación o reemplazo de ingresos reales.
Identificadores repetidos se rechazan sin sobrescribir.

Se conserva el estilo visual como punto de partida. Se añadieron etiquetas de
campos, controles semánticos, foco visible, idioma español, zoom y utilidad de
área segura inferior. No se realizó una auditoría visual completa de accesibilidad.

## Validación de la entrega

- `npm test`: reglas exactas, conservación de importes en casos sintéticos,
  validaciones y decisiones bloqueadas, procedencia, particiones, aislamiento
  del store y renderizado de rutas con datos iniciales vacíos.
- `npm run lint`: sin desactivar las reglas que detectaron los errores previos.
  Se eliminó el estado derivado dentro de un efecto y el cálculo de totales sin
  uso. El componente animado utiliza una referencia JSX reconocida por el lint.
- `npm run build`: genera la aplicación y el service worker con las dependencias
  existentes. Los artefactos `dist/` están ignorados en Git.

Las pruebas usan el runner nativo `node:test`, con una entrada que importa las
suites en un proceso para reportar cada caso. Vite transforma JSX en memoria
para comprobar las rutas; su WebSocket, HMR y vigilancia de archivos están
desactivados. No se requieren servicios ni dependencias adicionales.

El renderizado automatizado no sustituye interacción en navegador, instalación
PWA, funcionamiento offline o comprobación visual en móvil. Estas verificaciones
no se declaran realizadas en esta fase.

### Riesgos técnicos heredados

- `vite-plugin-pwa@1.2.0` declara peers hasta Vite 7 y el proyecto usa Vite 8.0.9.
  El build observado funciona, pero el contrato de compatibilidad sigue sin
  resolverse. Se mantiene `.npmrc` y no se cambian versiones sin una revisión
  específica de dependencias.
- Los iconos y referencias PWA identificados en la auditoría inicial siguen
  pendientes de saneamiento; un build correcto no certifica instalación PWA.
- El build informa antigüedad de Browserslist y deprecación de `module.register`
  bajo el Node de validación. No se ejecutó una actualización automática.
- No existe persistencia, backend ni seguridad multiusuario. Los metadatos de
  responsables y lectores describen el diseño, sin controles de acceso efectivos.

## Pendientes y puerta de revisión

Antes de la Fase 2 se requiere revisión técnica de Claude Code sobre estos commits.
No se envían mensajes ni se inicia automáticamente otro agente para esa revisión.

Pendientes funcionales/técnicos:

1. Backend, autenticación y autorización reales por pareja/módulo.
2. Persistencia, migraciones de esquema, recuperación, respaldo y sincronización.
3. Catálogo GF detallado, presupuestos, gastos, metas y proyecciones.
4. Importador de Control, previsualización privada y validación de ambigüedades.
5. Recepción y análisis del Excel real actualizado de Fiorella.
6. Conciliación de asignaciones reales y depósitos reales, nunca simulaciones.
7. Pruebas de navegador/móvil y saneamiento de PWA y compatibilidad de dependencias.

Decisiones que requieren aprobación:

- Tratamiento de déficit y sobrante cero.
- Liquidación monetaria y asignación de residuos de redondeo.
- Política de sobregiros y correcciones de movimientos.
- Interpretación de monedas, fechas e importes ambiguos del historial real.
- Relación entre GF aplicado, presupuesto detallado y gasto real.
- Criterios de conciliación parcial, agrupada o entre periodos.

Los porcentajes y la clasificación de fuentes ya son definitivos y no forman
parte de estas decisiones pendientes. No se inicia ninguna importación,
autenticación, despliegue ni desarrollo de Fase 2 con esta entrega.
