# MilFi 2.0 — Fase 3.2: Lector de Excel y preimportación de Control

Entrega local en `MILFI-Desarrollo`, rama `feat/milfi-v1-mejoras`, sobre la Fase 3.1
aprobada (`b179442`). No se importa historial real, no hay backend, autenticación
ni persistencia, y no se repitieron auditorías anteriores.

## Funcionalidades implementadas

Ruta `/control/preimportacion`, enlazada desde Control Finanzas M&F:

1. **Selección local** de un `.xlsx`. El archivo se lee en el navegador; no se sube,
   no se guarda y desaparece al recargar.
2. **Resultado de la lectura**: huella SHA-256, hojas reconocidas, movimientos
   identificados (depósitos/retiros), estructuras detectadas que no se importan
   y recuento de preparados, pendientes, rechazados e inválidos.
3. **Revisión por categoría**: respaldados por evidencia, aportante desconocido o
   ambiguo, moneda pendiente, periodo o fecha por revisar, posibles duplicados e
   interpretación no resuelta, además de preparados, rechazados e inválidos.
4. **Resolución de campos** durante la sesión: importe y moneda, moneda, aportante
   (depósitos), fecha (retiros), periodo, destino y «operación distinta». También
   se pueden corregir campos ya resueltos o preparados.
5. **Decisión** de preparar para una importación futura o rechazar, con resumen de
   preparados por archivo, moneda, operación, destino y aportante.

## Lector local (`src/infrastructure/xlsx/`)

- ZIP propio en memoria: entradas almacenadas o deflate (`DecompressionStream`),
  comprobación CRC-32 y límites de tamaño, entradas y descompresión real.
- XML no validante: rechaza `DOCTYPE`/`ENTITY` y entidades desconocidas; no resuelve
  DTD, entidades externas ni instrucciones de procesamiento.
- Captura de celdas (texto compartido, enriquecido, en línea, números), combinadas,
  sistema de fechas 1900/1904 y fórmulas. **Las fórmulas no se ejecutan**: se registra
  su texto y su valor almacenado solo como evidencia.
- Huella SHA-256 de los bytes leídos mediante Web Crypto.
- Sin dependencias nuevas. Funciona igual en el navegador y en Node para las pruebas.

Se rechazan de forma segura: archivos que no son ZIP, `.xls` antiguos o libros
protegidos con contraseña, ZIP cifrados, compresión no admitida, CRC alterado,
archivos mayores de 10 MB o con descompresión excesiva, macros (`vbaProject.bin`),
ActiveX u objetos incrustados, XML mal formado o con DTD, hojas duplicadas y libros
sin la estructura de Control. Los vínculos externos se ignoran y se informan.

## Reconocimiento de la estructura (`src/domain/controlWorkbook.js`)

Las tablas se localizan por **evidencia de encabezados**, no por coordenadas fijas
(las pruebas desplazan filas y columnas):

| Evidencia | Interpretación |
| --- | --- |
| Fila con `Mes` y `Año` contiguos | Encabezado de depósitos mensuales |
| Columnas `Depósito …` a la derecha | Una operación por celda con valor; dos columnas son operaciones distintas |
| Columnas `Total …` y fila `Total…` | Fórmulas de resumen excluidas |
| Fila con `Fecha`, `Descripción` y `Monto …` | Encabezado de retiros |
| Título combinado con `Retiros …` sobre esa fila | Contexto del destino de los retiros |
| Resto de celdas y fórmulas | Informadas como fuera de las tablas; no se importan |

La identidad de cada operación es SHA-256 + hoja + celda ancla del importe, como
en la Fase 1.2. El lector construye el mapa de evidencias de cada operación
(propiedad del lector, nunca del registro) que exige el contrato existente:

| Campo | Depósito | Retiro |
| --- | --- | --- |
| Importe | Celda del importe | Celda del importe |
| Moneda | Celda del importe (no contiene moneda) | Celda del importe (no contiene moneda) |
| Aportante | Encabezado de su columna | Ausencia verificada: sin aportante |
| Fecha | Ausencia verificada: depósito mensual | Celda de fecha |
| Periodo | Celdas de mes (rol `month`) y año (rol `year`) | Celda de fecha, sin deducción automática |
| Destino | Encabezado `Depósito Gastos/Ahorros` | Título `Retiros de gastos/ahorros` |

Los valores normalizados iniciales se obtienen con las mismas reglas de
interpretación del contrato (`interpretExcelField`); el contrato no cambió su
comportamiento, solo se exportaron dos funciones de lectura.

## Revisión y trazabilidad (`src/domain/controlPreimport.js`, `src/application/controlPreimport.js`)

- Se reutilizan `inspectMovementBatch`, `evidenceBinding`, `sourceOperationKey` y las
  revisiones de evidencia de las Fases 1–1.2. Cada resolución de importe, moneda,
  aportante, fecha o periodo genera una revisión de evidencia vinculada a las celdas
  capturadas, a la operación y al valor elegido.
- El destino se verifica contra el encabezado reconocido; cualquier otro valor
  requiere una resolución trazable. «Operación distinta» se vincula al conjunto de
  coincidencias: si cambia, debe confirmarse de nuevo.
- La decisión de preparar o rechazar se vincula a todo el estado de la operación
  (datos, procedencia, imputación, revisiones y evidencias). Cualquier corrección
  posterior la deja desactualizada y el movimiento vuelve a pendiente.
- Interpretar un importe exige una moneda explícita en la misma acción, porque la
  revisión del importe incluye la moneda. Cambiar después la moneda invalida esa
  interpretación.
- Un periodo distinto del mes de la fecha exige marcar la imputación explícita de
  esa operación concreta; no hay regla general.
- La aplicación múltiple es solo una comodidad: requiere marcarla, y cada
  movimiento con la misma evidencia de origen recibe su propia revisión.
- El ámbito de pareja (`householdId`) se deja para la importación autenticada futura;
  se muestra como diferido, no se inventa.
- Preparado nunca equivale a confirmado: `validationStatus` sigue `pending`, el
  origen sigue `real` y `eligibleForConfirmed` es siempre falso. Nada se escribe en
  `controlMovements`, en los ejemplos de Control ni en Fiorella.

## Casos soportados

- Dos depósitos en una misma fila: operaciones distintas, nunca duplicadas.
- La misma operación no se cuenta dos veces: el mismo archivo (misma huella) no
  puede cargarse otra vez en la sesión.
- Filas con los mismos datos dentro de un archivo: advertencia que exige confirmar
  «operación distinta» o rechazar.
- Versiones distintas del Excel: se cargan por separado, se resumen por archivo y la
  misma celda con el mismo original se señala; no se concilian ni fusionan.
- Monedas: nunca se asume PEN; los preparados se agrupan por moneda y no se suman
  entre monedas.
- Aportantes: las etiquetas relativas de encabezado («Tú», «Ella») no identifican a
  una persona sin revisión explícita. Un retiro nunca recibe aportante.
- Fechas: seriales 1900/1904 y texto `dd/mm/aaaa` inequívoco; fechas ausentes o
  ambiguas quedan pendientes.
- Importes en texto, con símbolo o abiertos (`$`, `+`) requieren interpretación.
  Los importes cero quedan pendientes de política y solo pueden rechazarse.
- Fórmulas: totales y resúmenes excluidos; un importe calculado por fórmula no se
  ejecuta y queda pendiente de política.
- Saldos: no se calculan ni se infieren.

## Casos no soportados

- `.xls`, `.xlsb`, `.ods`, libros cifrados o con macros, y ZIP64.
- Estructuras de Control distintas de las tablas reconocidas por encabezados.
- Conciliar automáticamente versiones distintas, deducir retiros de diferencias o
  importar definitivamente: fuera del alcance de esta fase.
- Interpretación del formato numérico de celda (por ejemplo símbolos monetarios de
  formato); no se usa como evidencia de moneda.

## Contraste privado con el Excel original

`npm run check:control-structure -- <ruta>` lee el archivo una vez en memoria e
imprime posiciones, recuentos y códigos, nunca importes, fechas, descripciones ni
nombres. Ejecutado sobre el Excel original de Control, sin modificarlo:

- Libro compatible, sistema de fechas 1900, una hoja reconocida.
- 23 depósitos (columnas C y D) y 8 retiros identificados; 0 errores de contrato.
- Fórmulas de totales y del bloque de resumen excluidas e informadas.
- Los 31 movimientos quedan pendientes: moneda en todos, aportante en los 23
  depósitos, periodo en los retiros y en algunos meses no reconocidos como nombre de
  mes, e interpretación de importes en texto. Ninguno queda preparado automáticamente.

Las huellas SHA-256 de ambos Excel son idénticas antes y después del trabajo.

## Privacidad

- Sin `localStorage`, `sessionStorage`, IndexedDB, red, telemetría ni `console` en
  el lector, la preimportación y su pantalla (comprobado por prueba).
- Chromium verifica que el almacenamiento del navegador permanece vacío.
- Las pruebas generan libros sintéticos en memoria. Reproducen la geometría y las
  etiquetas estructurales de encabezado, nunca importes, fechas, descripciones o
  nombres reales. Se comprobó que ningún valor numérico ni descripción del Excel
  real aparece en los cambios.

## Pruebas y capturas

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 186/186: conserva las 171 anteriores y añade 15 de lectura, procedencia, duplicados, revisión, ambigüedad, versiones, separación y privacidad |
| `npm run lint` | Sin errores |
| `npm run build` | Correcto |
| `npm run test:browser` | 21/21 recorridos Chromium (22 pruebas con el contenedor): los 18 anteriores y 3 nuevos; estable en dos ejecuciones |
| Móvil/escritorio | 320, 390, 768 y 1280 px sin desbordamiento horizontal y con campos etiquetados (emulación Chromium) |

Los recorridos nuevos cubren lectura, categorías, resolución múltiple e individual,
preparación, rechazo, invalidación tras corregir, resumen por moneda, archivo no
compatible, mismo archivo repetido, versiones separadas y limpieza al recargar.
Detectaron y se corrigieron dos defectos antes del commit: la aplicación múltiple
no enviaba los identificadores y un preparado no podía corregirse sin rechazarlo.

Capturas sintéticas, fuera de Git, en `/tmp/milfi-fase3-2-capturas/`
(configurable con `MILFI_CAPTURE_DIR`): `18-preimportacion-resumen-movil.png`,
`19-preimportacion-resolucion-movil.png`, `20-preimportacion-movimiento-movil.png`
y `21-preimportacion-versiones-escritorio.png`, además de las anteriores.

No se probaron Safari, Firefox ni un iPhone físico: no están disponibles. El
selector de archivos se ejercita mediante CDP en Chromium.

## Decisiones pendientes

- Moneda del Excel de Control: el libro no la indica. Hace falta una decisión
  aprobada (por archivo o por operación) antes de cualquier importación real.
- Identidad de los aportantes de cada columna de depósitos.
- Imputación de los retiros a periodos y criterio general entre periodos.
- Tratamiento de importes cero, importes en texto o abiertos, fórmulas, redondeo,
  sobregiros, retiros para gastos y saldos iniciales.
- Conciliación entre versiones distintas del Excel.
- Importación definitiva: persistencia, autenticación, ámbito de pareja,
  autorización y control de concurrencia en servidor.

## Commits y estado Git

- `dec1427`: lector local, reconocimiento, preimportación, pantalla, script de
  contraste privado y 15 pruebas.
- `911db45`: recorridos Chromium de la preimportación.
- Commit documental posterior: este informe y el README.

`main` y `origin/main` permanecen en `084eeb1`. No hubo push, merge, despliegue,
reescritura de historial ni cambios de dependencias (solo un script npm). La
Fase 3.3 no se inició.
