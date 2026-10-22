# MilFi 2.0 — Fase 2.1: Finanzas de Fiorella

Implementación en `MILFI-Desarrollo`, rama `feat/milfi-v1-mejoras`. Las Fases 1,
1.1 y 1.2 permanecen cerradas. Esta entrega no desarrolla Control Finanzas ni
comienza Fase 2.2.

## Fuente oficial y límites

Se leyó el Excel de Fiorella en memoria mediante ZIP/XML, sin instalar librerías,
modificarlo ni copiar sus importes a código, pruebas, capturas o documentación.
Solo se traslada la configuración funcional autorizada: etiquetas y jerarquía
de categorías. La huella SHA-256 se compara con la inicial al cerrar la entrega.

El catálogo GF conserva cinco grupos y 19 subcategorías de Configuración / Track GF:

| Grupo | Subcategorías oficiales |
| --- | --- |
| Servicios | Gas, Celular, iCloud, Luz, Agua, Internet |
| Transporte | Trabajo, Gym, Otros (Transporte) |
| Comida | Proteinas, Carbohidrados, Frutas&Verduras, Condimentos&Aliños, Otros (Comida) |
| Bienestar | Gym, Slinda, Masajes, Miositol |
| Otros | Otros (Otros) |

Los identificadores incluyen el grupo: los dos conceptos Gym no colisionan.
Se conservan las etiquetas del libro, sin reinterpretar categorías antiguas.
Las filas vacías de configuración no se convierten en categorías inventadas.
GV conserva exclusivamente Salud 50% y Ocio 50%; los espacios libres de
subcategorías GV del Excel no contienen un catálogo adicional que importar.

Todos los registros introducidos por formularios son **demostraciones en memoria**,
con origen simulado y estado pendiente. Se muestran avisos explícitos de pérdida
al recargar. No existe escritura en historial real, persistencia de datos
financieros, autenticación, confirmación financiera, importador ni servicio remoto.

## Funciones implementadas

### Resumen mensual — `/fiorella`

- Selector dinámico de mes/año, compartido con GF y GV durante la sesión.
- Registro y actualización de ingreso mensual y GF aplicado; cada campo puede
  estar pendiente. No se rellena el GF aplicado automáticamente con el tope.
- Presentación separada de ingreso, GF aplicado, presupuesto detallado y ejecución GF.
- Distribución calculada por el motor existente, sin cambiar sus porcentajes.
- Seguimiento GV por categoría: asignación calculada, acumulado registrado y diferencia.
- Datos faltantes como «Sin registrar» o «Sin distribución», sin convertirlos en cero.
- Déficit y sobrante cero conservables como datos de demostración, con distribución
  bloqueada. Registrar un borrador mensual no equivale a aprobar una asignación.

### Presupuestos GF — `/fiorella/presupuestos`

- Catálogo oficial agrupado, formularios por subcategoría y periodo.
- Presupuesto y gasto ejecutado como agregados mensuales independientes.
- Importes en blanco distintos del cero registrado; cobertura por número de
  subcategorías y totales parciales claramente identificados.
- Diferencia exacta presupuesto menos ejecución; el exceso se muestra sin
  crear un saldo negativo, redistribuir ni modificar el GF aplicado.
- El detalle puede superar el tope en una demostración y se advierte. El tope
  del GF aplicado al motor permanece S/ 1,500, con su validación existente.

### Seguimiento GV — `/fiorella/gastos`

- Alta y edición de fecha, categoría Salud/Ocio, descripción e importe.
- Acumulados exactos del periodo y comparación con el reparto calculado.
- Puede registrarse ejecución sin ingreso todavía registrado, pero no se inventa
  una distribución. Gastar más que la asignación no altera el reparto 50/50.
- Fechas válidas y coherentes con el periodo elegido; la interfaz indica cambiar
  el selector para registrar otro mes. Trasladar un registro existente entre
  periodos queda bloqueado para revisión posterior.
- Un gasto con contenido idéntico se señala como posible duplicado. El usuario
  puede indicar expresamente que es otro gasto distinto; la indicación queda
  en la trazabilidad. No se confunden coincidencia de datos e identidad real.

### Historial — `/fiorella/historial`

- Agrupación por mes/año, más reciente primero.
- Registros de formularios y simulaciones independientes en secciones distintas.
- Aviso permanente de historial real todavía no importado.
- Cambios de sesión con fecha, revisión y valores antes/después. GF mantiene
  grupo y subcategoría visibles también en el historial.
- Repetir una actualización sin cambios no crea otra revisión ni duplica importes.

### Interfaz

Se conserva la paleta y la estructura móvil actual. Se añaden enlaces GF/GV,
formularios con etiquetas, mensajes de resultado y retorno al inicio del contenido
al cambiar de ruta. No se cambia la presentación financiera de Control M&F.

## Contratos y preparación para futura integración

`fiorellaCategories.js` contiene únicamente el catálogo oficial inmutable.
`fiorellaSession.js` contiene preparación de comandos, claves lógicas, selectores
de resumen e historial y comparación exacta. Los componentes visuales no calculan
porcentajes ni producen movimientos de Control. El store aplica las operaciones
validadas y copia snapshots para evitar compartir referencias con el llamador.

Cada registro incluye versión de esquema, ID, módulo, propietaria, periodo,
tipo, moneda, origen, estado, procedencia, revisión y fechas de creación/cambio.
`actorId` es nulo: no se finge una sesión autenticada. La moneda PEN corresponde
solo al módulo de Fiorella y su configuración oficial; no se infiere para Control.

Tipos de registro:

| Tipo | Datos propios | Identidad lógica |
| --- | --- | --- |
| `monthly-plan` | ingreso y GF aplicado, independientes y anulables | periodo |
| `fixed-budget` | subcategoría, presupuesto y ejecución mensual anulables | periodo + subcategoría |
| `variable-expense` | fecha, categoría, descripción e importe | ID de gasto |

Los comandos requieren `expectedRevision`, ID de evento y timestamp UTC válido.
Se rechazan IDs repetidos, claves mensuales duplicadas, revisiones obsoletas y
ediciones anteriores al último cambio. Los formularios conservan la revisión
que cargaron y la actualizan únicamente después de una escritura local aceptada.
Las revisiones no son permisos ni una protección frente a modificar JavaScript.

`fiorellaDemoEvents` conserva snapshots antes/después y la indicación de gasto
similar. `fiorellaDemoRecords` está separado de `fiorellaRecords` reales, de las
simulaciones de la calculadora y de `controlMovements`. Recargar vacía registros
y eventos de demostración; no se usa localStorage, IndexedDB ni Zustand persist.

Una futura integración PostgreSQL/Supabase podrá mapear estos contratos a tablas
de periodos, presupuestos, gastos y eventos, con unicidad por propietaria/periodo/
categoría, IDs de gastos y revisión esperada. Necesitará validación de servidor,
actualización y evento en una transacción, tipos NUMERIC compatibles con la
precisión aprobada, autenticación y políticas de acceso reales. No se crean
tablas, conexiones, SQL ejecutable, claves ni servicios en esta fase. Los datos
de demostración no se promoverán automáticamente a esas tablas reales.

## Verificación

- `npm test`: 122 pruebas aprobadas: las 97 anteriores y 25 nuevas para GF, GV,
  estado no registrado, aritmética exacta, duplicados, revisiones, separación,
  años/meses, años extremos y día bisiesto.
- Renderizado SSR ampliado a las nuevas rutas, conservando los escenarios previos.
- `npm run lint`: sin errores.
- `npm run test:browser`: build y ocho recorridos Chromium; el runner informa
  nueve pruebas contando el contenedor.
- Los recorridos conservan las cuatro verificaciones anteriores y añaden
  formularios GF/GV, ediciones, duplicados explícitos, fechas fuera del periodo,
  trazabilidad, separación de Control y recarga que elimina todos los ejemplos.
- Resoluciones comprobadas: 320×844, 390×844, 768×1024 y 1280×1024, sin
  desbordamiento horizontal en resumen, GF, GV e historial y con campos etiquetados.
- Capturas inspeccionadas visualmente, solo con datos sintéticos inventados por
  las pruebas, en `/tmp/milfi-fase2-1-capturas/`. No se versionan imágenes ni Excel.
  Puede elegirse otra carpeta mediante `MILFI_CAPTURE_DIR` al ejecutar Chromium.
- Permanecen las advertencias heredadas de Browserslist y `module.register`;
  no se actualizan dependencias para silenciarlas.

Capturas generadas: `01-resumen-movil.png`, `02-presupuestos-movil.png`,
`03-gastos-movil.png`, `04-historial-movil.png`, `05-resumen-escritorio.png`,
`06-formulario-gf-movil.png` y `07-formulario-gv-movil.png`. Son artefactos
temporales: pueden regenerarse con `npm run test:browser`.

## Pendientes y cierre

- Recibir y validar el Excel actualizado con el historial real de Fiorella.
- Aprobar déficit, sobrante cero, redondeo monetario y cambios de periodo; esta
  fase no resuelve esas decisiones ni liquida fracciones de céntimo.
- Diseñar posteriormente el flujo de datos reales, permisos, persistencia y
  sincronización. El historial de esta sesión no es una bitácora durable ni segura.
- Las metas, proyecciones, borrado/anulación de registros y nuevas funciones de
  Control no se implementan en esta entrega.

Los Excel originales, reglas financieras definitivas, dependencias y `main`
permanecen intactos. No hay importación real, push, merge ni despliegue.
El trabajo se detiene al terminar Fase 2.1 para su evaluación.
