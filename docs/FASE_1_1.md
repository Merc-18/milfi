# MilFi 2.0 — Fase 1.1

Correcciones M2/M3 y diagnóstico M1 posteriores a la aprobación de Fase 1 con
observaciones. No se inicia Fase 2. No se incorporan datos financieros privados
a este documento, código, pruebas o artefactos nuevos versionados.

## M2 — Contratos financieros

### Estructura y decisiones pendientes

`inspectMovement` distingue `errors` de `pendingReasons`. Los primeros indican
estructura inválida o contradicciones; los segundos conservan casos financieros
que requieren revisión. `eligibleForConfirmed` exige origen real, estado declarado
confirmado y ausencia de ambos tipos de incidencia. No modifica el registro.

`validateEnvelope` y `validateMovement` mantienen la interfaz de lista de códigos:
para una declaración de confirmación incluyen también los motivos que la bloquean.
`partitionMovements` conserva por separado simulados, confirmados, pendientes,
rechazados e inválidos. Un estado declarado confirmado no evita las comprobaciones.

### Fecha efectiva e imputación

- Una fecha dentro del periodo es coherente sin reglas adicionales.
- Un depósito cuya fuente solo conoce el mes puede mantener fecha exacta nula.
- Una discrepancia entre fecha efectiva y periodo no se corrige ni se acepta
  automáticamente: requiere revisión.
- `periodAssignment` permite representar una imputación legítima ya revisada,
  con periodo efectivo y contable, motivo, identidad declarada del revisor y
  referencia de evidencia. Ambos periodos deben coincidir con los datos del registro.
- Una revisión que identifica inconsistencia se distingue de una imputación
  todavía no revisada. Ambas quedan fuera de confirmados.

La estructura no establece una regla general de traslado entre meses ni autentica
al revisor. La aprobación y la evidencia deberán verificarse externamente; no se
implementó una pantalla o una operación para aprobar imputaciones.

### Moneda y agregación

La moneda interpretada requiere un identificador explícito reconocido por
`Intl.supportedValuesOf('currency')`. Un símbolo original no se convierte en un
código ni se utiliza para adivinar una moneda. Una moneda sin resolver permanece
nula y pendiente; códigos inválidos se reportan como errores de contrato.

`sumConfirmedMovements` es un helper puro de comprobación, sin conexión a datos:

- Requiere ámbito de pareja, destino, tipo de movimiento y moneda explícitos.
- Suma únicamente registros reales elegibles, mediante aritmética decimal exacta.
- Rechaza mezclar monedas del mismo ámbito seleccionado, aunque se solicite una
  moneda concreta. No realiza conversiones ni filtra silenciosamente esa mezcla.
- Sin registros elegibles devuelve total nulo y estado no disponible.
- No calcula saldos netos, sobregiros ni asignaciones de retiros. No está conectado
  a una pantalla ni a un repositorio de movimientos reales.

Un subtotal de registros elegibles tampoco demuestra que el historial completo
esté conciliado. Las operaciones pendientes e inválidas siguen disponibles para
revisión y nunca se convierten en cero para sumarlas.

### Procedencia de Excel

La trazabilidad exige tipo de fuente compatible con el origen/módulo, identificador,
hoja, fila válida de Excel, huella con formato SHA-256, lote, originales de texto
significativos y correspondencia de cada campo original con una celda de esa fila.
Los movimientos deben conservar específicamente el importe original y su celda.
Se rechazan originales vacíos, compuestos solo por blancos/nulos o coordenadas
inexistentes. No se copia ningún valor de los Excel reales a fixtures.

Un importe numérico interpretado que contradice el original queda pendiente.
Un original ambiguo tampoco queda confirmado por introducir un número y una
moneda en los campos interpretados. `amountInterpretation` permite representar
una revisión externa documentada del texto ambiguo, ligada al original, importe
y moneda explícita. No contiene un conversor, no completa importes abiertos y
no puede usarse para cambiar un original numérico inequívoco.

La forma de una huella y la declaración de una evidencia no prueban autenticidad,
autoridad ni aprobación real. El futuro importador/servidor deberá verificarlas.
Esta fase no importa ni confirma operaciones reales.

### Identificadores y separación de datos

`findDuplicateIds` e `inspectMovementBatch` detectan colisiones. Todas las
apariciones de un identificador duplicado quedan excluidas, sin elegir ganador,
sobrescribir ni alterar los originales. Se detectan también variantes con blancos
externos sin cambiar sus identificadores almacenados.

Origen simulado con estado financiero confirmado es una contradicción explícita.
Las simulaciones, mocks, registros rechazados, inválidos y decisiones pendientes
no participan en las sumas de confirmados. Se conservan las reglas oficiales de
Fiorella sin cambios.

## M3 — Presentación de Control Finanzas

La pantalla conserva su aviso de historial real pendiente de importación y no
muestra saldos ni cifras de ejemplo. Se retira la afirmación que asociaba una
persona de manera exclusiva con un destino de depósito.

El contrato distingue aportante, destino y usuario que registra. Cualquiera de
las identidades del modelo puede aparecer como aportante en cualquiera de los
dos destinos de depósito; la administración prevista de Milton no determina
quién aporta. Un actor histórico desconocido sigue siendo nulo.

Los retiros para gastos dejan de rechazarse como combinación prohibida. Se
conservan pendientes porque no existe una política aprobada para ese tratamiento.
También se admite destino desconocido explícito, pendiente de validación, sin
asignarlo al ahorro por defecto. No se implementan reglas nuevas de retiro,
sobregiro ni un flujo de aprobación.

## M1 — Diagnóstico privado del historial Git

Se examinó en memoria `c844e3e:src/store/useStore.js` y se compararon privadamente
sus depósitos y retiros con el Excel real de Control Finanzas. Los originales
solo se leyeron; no se copiaron al repositorio ni se registraron sus datos en logs.

Resultados sanitizados:

- Existen coincidencias exactas de depósitos por periodo e importes, junto con
  coincidencias parciales y diferencias en otros registros.
- Los retiros antiguos coinciden con operaciones reales en importe y descripción.
  Existen fechas diferentes y coincidencias completas en otros casos.
- El código añade clasificación y etiquetas de demostración que no acreditan
  que el contenido sea independiente o anónimo.
- La comparación aporta evidencia fuerte de reutilización parcial de información
  real. No demuestra el proceso de creación, autoría o versión exacta de origen.
  No corresponde certificar esos registros como ejemplos independientes.
- El árbol de ese commit no contiene el archivo Excel original. El riesgo reside
  también en los valores y textos incluidos directamente en el código histórico.

Conclusión: debe tratarse ese contenido heredado como potencialmente sensible,
aunque permanezca excluido de toda migración real. Retirarlo de la ejecución y
añadir patrones a `.gitignore` no elimina las versiones conservadas en Git.

El commit es ancestro de la rama de trabajo, de `main` local y de la referencia
local de seguimiento `origin/main`. No se consultó ni modificó el servidor remoto:
esta comprobación no acredita su visibilidad actual ni el alcance de sus copias.
Las revisiones locales, clones y eventuales artefactos históricos pueden conservar
el material aun cuando el código actual ya no lo utilice.

Alternativas para decisión posterior:

1. Conservar el historial y revisar/restringir accesos al repositorio y copias.
   Reduce exposición futura según los controles disponibles, pero mantiene el
   contenido histórico y no retira copias existentes.
2. Preparar una sanitización coordinada de las referencias afectadas, con respaldo
   privado y revisión antes de ejecutar cualquier reescritura/remoto. Requiere
   autorización específica y coordinación de clones y artefactos; no garantiza
   retirar copias ajenas.
3. Crear posteriormente un repositorio con una instantánea saneada y decidir el
   tratamiento del repositorio anterior. La instantánea nueva no sanea por sí
   sola el historial previo ni las copias existentes.

No se ejecutó ninguna alternativa, no se eliminaron commits ni se reescribió
historial. M1 queda diagnosticado y pendiente de decisión.

## Verificación y alcance de las pruebas

Se conservan los 26 escenarios previos. En dos se corrigen expectativas que
admitían una simulación confirmada o imponían un destino exclusivo de retiro.
Se añaden casos de contratos para fecha/periodo, evidencia, moneda, procedencia,
duplicados, combinaciones contradictorias y aislamiento de sumas.

`npm test` ejecuta las suites de dominio, estado y renderizado en memoria.
`npm run test:browser` construye producción y utiliza un Chromium existente con
un perfil temporal, sin instalar dependencias. Puede configurarse con
`MILFI_CHROMIUM_PATH`; el servidor de preview escucha únicamente en localhost.
El perfil contiene solo datos inventados, se bloquean peticiones de fuentes
externas y los procesos y recursos temporales se cierran al finalizar.

Las comprobaciones de navegador cubren las cuatro rutas antiguas y reemplazo de
historial, regreso con Atrás, guardado de dos escenarios del mismo periodo,
navegación entre módulos, consulta del detalle, ausencia de contaminación de
Control, operaciones bloqueadas y limpieza de simulaciones tras recarga.
No constituyen una auditoría visual completa o certificación PWA.

También se ejecutan ESLint, build, revisión de diferencias y estado Git. La
verificación final compara las huellas de ambos Excel antes/después de su lectura,
sus tamaños con la auditoría previa y que sus fechas de modificación sean
anteriores al commit aprobado de Fase 1. `main`,
porcentajes oficiales, dependencias y lockfile se mantienen sin cambios.

Resultado de verificación: 46 pruebas de dominio/estado/renderizado aprobadas
(26 escenarios previos y 20 añadidos), cuatro recorridos Chromium aprobados
(el runner informa cinco pruebas contando su contenedor), ESLint sin errores y
build completo. Permanecen las advertencias heredadas de Browserslist y
`module.register`, así como la compatibilidad declarada Vite/plugin PWA pendiente.

## Pendientes de aprobación y segunda revisión

- Decisión sobre el contenido sensible del historial Git descrito en M1.
- Reglas generales de imputación entre periodos y evidencia válida para casos concretos.
- Interpretación de monedas, fechas e importes ambiguos, sin conversiones inventadas.
- Tratamiento de retiros no definido por las reglas aprobadas, sobregiros,
  déficit, sobrante cero y liquidación de fracciones de céntimo.

No hay persistencia, autenticación, Supabase ni importación de datos reales.
Fase 2 permanece detenida hasta la segunda verificación independiente de Claude Code.
