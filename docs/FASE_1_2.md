# MilFi 2.0 — Fase 1.2

Correcciones A1, A2 y A3 de la segunda auditoría, implementadas exclusivamente
en `feat/milfi-v1-mejoras`, worktree `MILFI-Desarrollo`. Esta entrega sustituye
las condiciones de evidencia e identidad de operaciones descritas en Fase 1.1.
No inicia Fase 2 ni incorpora movimientos reales.

## A1 — Integridad y resolución explícita

`src/domain/excelEvidence.js` contrasta los cinco campos normalizados —fecha
efectiva, moneda, aportante, periodo e importe— con una captura independiente
del libro. Los originales declarados también deben coincidir exactamente con
esa captura, incluidos blancos y texto ambiguo. Un estado `confirmed` no evita
la comprobación.

Se distingue entre:

- Errores de estructura o trazabilidad: originales alterados, referencias que
  no se pueden verificar o evidencia desviada de la posición del original.
- Decisiones pendientes: campo ambiguo, valor normalizado contradictorio,
  captura ausente o reglas financieras todavía sin aprobar.

Ambos grupos quedan fuera de sumas confirmadas. Se conserva la separación de
simulados, reales pendientes, rechazados e inválidos. No es posible ocultar un
original conocido omitiendo su evidencia o apuntando a un blanco de otra celda.
Un depósito sin día exacto puede conservar fecha nula cuando no existe evidencia
de fecha exacta. No se inventa el primer día del mes.

Los importes se comparan como decimales exactos. Se admite notación científica
del XML numérico sin pasar por coma flotante. Símbolos monetarios, importes
abiertos y texto numérico con convenciones no resueltas quedan pendientes.
Los códigos de moneda deben estar explícitos en la evidencia; no hay conversión.

Las fechas ISO válidas y los seriales enteros de Excel se contrastan usando el
sistema de fechas 1900/1904 capturado del libro. Se rechaza el día ficticio del
serial 60 del sistema 1900. Una fecha de barras que admite dos interpretaciones
válidas requiere revisión, sin asumir una configuración regional. Las fracciones
de día no se redondean. El periodo puede proceder de una celda explícita
`AAAA-MM` o de referencias separadas de mes y año; no se deduce por defecto de
la fecha efectiva. La revisión de imputación entre periodos sigue siendo una
comprobación distinta de la fidelidad a la fecha original.

### Revisiones

`src/application/evidenceReview.js` ofrece `prepareEvidenceReview`: operación
pura que prepara una nueva revisión, conserva los originales, añade al historial
sin mutar el registro recibido, incrementa la revisión y deja el estado
**pendiente**. No confirma ni contabiliza movimientos.

Cada entrada de `evidenceReviews` incluye ID único, campo, decisión, motivo,
identidad declarada del revisor, fecha UTC válida, referencia de evidencia y
`binding`. Este último liga la decisión a la operación, captura, valor normalizado
y metadatos; para el importe incluye también la moneda. Cambiar esos datos
invalida el vínculo anterior. Se rechazan historiales mal formados y revisiones
con ID repetido. Las revisiones conservadas no sustituyen evidencias inexistentes
ni subsanan originales alterados o referencias inválidas.

La antigua declaración `amountInterpretation`, por sí sola, deja de habilitar
un registro. Una contradicción numérica puede representarse como resolución
explícita de un caso concreto mediante el nuevo historial; no se cambia el
valor original ni se establece una regla general para otros movimientos.

Las identidades de revisión son metadatos, no autenticación. `binding` es una
representación canónica de los datos contrastados, no una firma criptográfica.
No se implementa una pantalla de aprobación, permisos ni persistencia de auditoría.

## A2 — Identidad y reimportaciones

`inspectMovementBatch` comprueba simultáneamente:

1. Colisiones de ID, conservando la exclusión de todas sus apariciones.
2. Colisiones de operación de origen: SHA-256 del libro, hoja normalizada y
   posición física del importe, con fila y columna. Las posiciones dentro de
   una combinación se resuelven a la misma celda ancla.

`provenance.operation` declara `range` y `amountRef`. El rango debe contener la
fila declarada y la posición del importe. Los originales y la evidencia del
importe deben apuntar a esa misma operación. La identidad se obtiene del ancla
física, no de una etiqueta de operación libre que pudiera cambiar al reimportar.
Cambiar el rango exterior tampoco convierte un mismo importe en otra operación.

Dos importes en columnas distintas de una misma fila son operaciones distintas.
Cambiar ID, lote, nombre de origen, moneda, aportante, destino, periodo o tipo
normalizados no permite duplicar una misma posición del mismo libro. Se
normalizan mayúsculas del hash, nombre de hoja y direcciones absolutas de Excel.
Ante una colisión dentro de un conjunto se excluyen ambas apariciones: no se
elige una ganadora ni se interpreta el resultado como saldo histórico completo.

`inspectMovementBatch(candidates, evidenceContext, existingRecords)` permite
contrastar candidatos con registros existentes durante una futura prevalidación
de reimportación. Solo informa sobre candidatos; no altera registros existentes
ni sus totales. El contrato no dispone de almacenamiento global: sin proporcionar
los existentes no puede conocer importaciones de otra sesión.

Un archivo editado tiene otro SHA-256. La identidad entre versiones distintas
requiere una estrategia posterior de conciliación y revisión; no se inventan
coincidencias por importe o descripción. Una futura importación también deberá
garantizar exclusión transaccional de duplicados concurrentes. No hay importador
ni escritura de dinero en esta entrega.

## A3 — Evidencias de encabezados, combinaciones y otras posiciones

Se elimina la obligación anterior de situar todas las evidencias en la fila
del movimiento. Se admiten celdas, referencias absolutas y rangos combinados
verificables, incluso en otra hoja mediante `originalReferences`. Un rango
arbitrario sin combinación conocida no se considera una celda verificable.
Las coordenadas se limitan a los límites reales de Excel y se comprueba su
existencia en la captura.

La estructura de Control Finanzas se contrastó privadamente mediante lectura
del ZIP/XML original en memoria, sin copiar registros a archivos ni fixtures:

- Los depósitos están en dos columnas distintas de la misma fila; la columna
  de total contiene fórmulas y no identifica un tercer depósito.
- Mes y año ocupan posiciones separadas.
- Hay encabezados combinados de secciones y contexto del aportante fuera de
  las filas de operaciones. Las etiquetas relativas requieren revisión o
  contexto verificable; no se convierten en restricciones sobre quién aporta.
- Los retiros tienen su propio bloque de fecha, descripción e importe.
- Los encabezados inspeccionados no declaran una moneda inequívoca universal
  para todas las operaciones. No se asigna PEN por la interfaz de la aplicación.

Las pruebas reproducen únicamente esa geometría con valores inventados. Las
fórmulas de totales permanecen fuera de operaciones primarias confirmadas,
incluso si se añade una revisión de importe: falta una política aprobada para
tratarlas como movimientos y se evita contabilizar resúmenes como dinero nuevo.

## Contrato de captura y frontera de confianza

Las funciones de movimientos, partición y suma reciben `evidenceContext` como
argumento adicional. Su forma es:

```js
{
  workbooks: new Map([
    [fingerprint, {
      dateSystem: '1900', // o '1904', leído del libro
      sheets: {
        NombreDeHoja: {
          cells: { A1: { type: 'text', value: 'texto original' } },
          merges: [],
        },
      },
    }],
  ]),
}
```

Las celdas conservan tipo (`text`, `number`, `blank`), valor crudo como cadena o
nulo y, cuando corresponde, `formula`. `provenance.evidence` relaciona cada campo
con referencias `{sheet, ref, role?}`; mes y año separados declaran sus roles.
`provenance.original` conserva los valores originales, `cells` sus posiciones
y `originalReferences` permite precisar hoja/posición por campo.

La captura debe pertenecer al lector verificado, no construirse a partir del
movimiento que se pretende aceptar. Sin captura se devuelve
`SOURCE_NOT_VERIFIED` y no hay elegibilidad ni total confirmado. Los fixtures
construyen capturas sintéticas separadas al crearse; las pruebas A1 alteran luego
los registros y comprueban que la evidencia no cambia.

Este contrato **no autentica por sí mismo los bytes del Excel**. El futuro
adaptador deberá calcular la huella de los bytes leídos, extraer celdas,
combinaciones, fórmulas y sistema de fechas de esos mismos bytes, y entregar una
captura confiable. El futuro servidor deberá verificar también las revisiones.
Aceptar una captura o identidad suministrada libremente por un cliente no sería
seguridad. No se implementan esos servicios en Fase 1.2.

`validateEnvelope` solo valida la envoltura; no constituye autorización para
contabilizar. La elegibilidad requiere inspección completa y verificación de
duplicados del conjunto relevante. Las sumas siguen siendo helpers de contrato,
sin conexión a la interfaz ni cálculo de saldo neto.

## Validación de la entrega

Commit local de implementación y pruebas: `45ba954`
(`fix: validate Excel evidence and prevent source operation duplicates`).
La documentación se entrega en un commit local posterior.

- `npm test`: **79 aprobadas**, con los **46 escenarios anteriores** conservados
  y **33 nuevos** para A1/A2/A3. Se actualizan sus fixtures para añadir captura
  independiente y revisar explícitamente la interpretación ambigua; no se
  eliminan escenarios ni se reutilizan registros privados.
- `npm run lint`: sin errores.
- `npm run test:browser`: build de producción y cuatro recorridos Chromium
  aprobados; el runner informa cinco pruebas contando el contenedor.
- Chromium cubre redirecciones antiguas, Atrás, historial de dos simulaciones,
  navegación entre módulos, aislamiento de Control, bloqueo de operaciones
  pendientes y recarga sin historial real inventado.
  Se corrige una espera frágil de recarga que consultaba `document.body` antes
  de existir y se conserva el detalle de las excepciones para diagnosticar fallos.
- Comparación SHA-256 de ambos Excel con las huellas de inicio: sin cambios.
- Revisión de Git: cambios limitados a contratos, helper de revisión, pruebas
  y documentación; reglas oficiales, dependencias, lockfile y `main` intactos.

Se conservan las advertencias heredadas de Browserslist y `module.register`.
No se instalaron ni actualizaron dependencias para eliminarlas. La compatibilidad
declarada entre Vite y el plugin PWA sigue pendiente de revisión posterior.

## Pendientes y revisión focalizada

- Revisión de Claude Code sobre cobertura de originales, vigencia de revisiones,
  identidad física de operaciones y uso de contexto confiable.
- Aprobar interpretaciones concretas de fecha, moneda, aportante, periodo e
  importes ambiguos antes de cualquier confirmación real.
- Decidir conciliación entre versiones distintas del Excel y evidencias
  necesarias cuando falten datos; no se deducen de ejemplos o simulaciones.
- Mantener pendientes déficit, sobrante cero, redondeos, sobregiros y reglas
  de retiro no aprobadas. Los porcentajes oficiales de Fiorella siguen intactos.
- Resolver posteriormente M1 sobre información potencialmente sensible del
  historial Git; no se reescribe ni se vuelve a publicar ese historial.
- Esperar el Excel actualizado con historial real de Fiorella. Su plantilla
  simulada y los mocks siguen excluidos de toda migración real.

No hay importación real, persistencia, autenticación, conexión a Supabase,
despliegue, push ni merge. Al concluir esta entrega se detiene el trabajo para
la revisión focalizada de Claude Code, sin comenzar Fase 2.

## Corrección final A1 — Relación entre evidencia y operación

La verificación focalizada identificó que comprobar el contenido de una celda
no acreditaba su relación con el movimiento. La captura independiente incorpora
ahora `sheets.NombreDeHoja.operations`, indexado por el ancla del importe. Cada
entrada declara el rango de la operación y `fields`, con las referencias exactas
que el lector confiable vincula a cada campo de esa operación. Por ejemplo,
una entrada sintética puede vincular `C5` con `contributorId` en `C4`, mientras
que `D5` vincula ese campo con `D4`. Encabezados, combinaciones y contexto de
otras posiciones se aceptan cuando ese vínculo está verificado en la captura.

Las asociaciones se contrastan siempre, independientemente de la presencia de
entradas en `original` o `cells`. Debe coincidir el conjunto completo de referencias,
incluidos sus roles; no basta seleccionar una celda cuyo texto coincida. Ampliar
el rango declarado o añadir un indicador de relación al registro no altera el
mapa independiente. Una evidencia existente pero sin vínculo confiable deja el
campo pendiente de revisión; una evidencia obligatoria ausente no permite
confirmación. Tampoco se puede ocultar una fecha conocida declarando día nulo y
eliminando sus metadatos originales. La ausencia legítima de día exacto requiere
que la captura verificada también acredite esa ausencia.

La revisión explícita existente puede resolver la falta de relación estructural
para un caso concreto. Su vínculo incorpora ahora también el rango declarado y
las asociaciones independientes del campo; cambiar evidencia, rango o asociación
invalida la revisión anterior. Preparar una revisión sigue dejando el registro
pendiente, sin contabilizarlo automáticamente. Las asociaciones del lector son
metadatos de confianza: no se deben aceptar mapas fabricados por el cliente o
derivados del propio registro que se está validando.

Se conservan los 79 escenarios anteriores y se añaden 18 pruebas sintéticas:
97 aprobadas en total, ESLint sin errores y build completo. Las modificaciones
en fixtures anteriores solo aportan los vínculos independientes requeridos por
el nuevo contrato. La identidad de duplicados A2, la resolución de referencias
A3 y las reglas de Fiorella no cambian. No se infiere una moneda para Control
Finanzas ni se leen/importan registros financieros reales en estas pruebas.
