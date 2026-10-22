# MilFi 2.0 — Fase 3.1: Control Finanzas M&F

Implementación local en `MILFI-Desarrollo`, rama `feat/milfi-v1-mejoras`,
sobre la Fase 2.2 aprobada (`1d6fc03`). No se repitieron auditorías anteriores.
No hay importación de historial real, backend, autenticación ni persistencia.

## Continuidad de la entrega

Codex implementó la fase en `8687a60` y `2b74fc3` y dejó sin commitear un ajuste
de esperas en `tests/browser.test.js`, el README y un borrador de este informe.
Claude Code recuperó ese estado sin descartar cambios, revisó el código frente
al alcance, verificó de forma independiente los resultados declarados y las
afirmaciones sobre la estructura del Excel, y completó la entrega con el ajuste
de pruebas y la documentación. No fue necesario modificar código de aplicación.

## Funcionalidades entregadas

La ruta `/control` deja de ser una pantalla informativa y permite probar:

- Selección independiente de mes y año, con el componente compartido que conserva
  los borradores intermedios y aplica únicamente periodos completos válidos.
- Conteos de depósitos, retiros y movimientos pendientes del periodo seleccionado.
- Registro y edición de depósitos y retiros hipotéticos, con fecha, periodo,
  moneda explícita, importe, aportante, destino, descripción y procedencia manual.
- Identificación separada del aportante, el destino y el usuario declarado que
  registra. Cualquiera de las dos personas puede figurar como aportante de gastos
  o ahorro. No se deriva el destino ni un receptor a partir del aportante.
- Retiros independientes; su aportante puede quedar sin identificar. No se crean
  retiros a partir de diferencias ni se atribuyen automáticamente a una persona.
- Revisión explícita, aceptación o rechazo del ejemplo, con responsable declarado,
  fecha, motivo y referencia. Nunca confirma una operación financiera real.
- Historial filtrado por periodo y estado: demo pendiente, revisada, rechazada,
  inválida y consulta de confirmados reales todavía vacía.
- Resúmenes exactos de demos revisadas, separados por moneda, operación y destino.
  Los depósitos se desglosan además por aportante. Los retiros no se agregan por
  persona ni se interpretan como pagos recibidos por ella.
- Evidencia original del ejemplo, revisiones anteriores e historial temporal de
  altas, ediciones y revisiones, con versión, responsable declarado y antes/después.

Los ejemplos pendientes, rechazados, inválidos o con revisión desactualizada no
participan en los resúmenes revisados. Los conteos de registros incluyen los
movimientos del periodo; no representan cantidades de dinero.

No se calcula un saldo neto, inicial, bancario o disponible. Tampoco se establece
un límite de retiro. Depósitos y retiros se suman por separado dentro de su grupo;
no se suman PEN y USD ni se inventan conversiones. La pantalla distingue
claramente el resumen demostrativo de los movimientos reales no importados.

## Estructura del Excel consultada en lectura

Se verificó en memoria la estructura de `Control_Finanzas_M&F.xlsx`, sin escribir
el libro ni copiar sus movimientos, importes o descripciones personales:

| Posición estructural | Interpretación conservada |
| --- | --- |
| Hoja Control Finanzas, A/B de filas 5–18 | Mes y año, sin inventar un día efectivo |
| C y D de una misma fila de depósitos | Operaciones distintas para gastos y ahorro |
| E de esas filas | Fórmula de resumen; no es un depósito adicional |
| A/B/C del bloque desde la fila 24, antes del total combinado de la fila 44 | Fecha, descripción e importe de cada retiro independiente |
| Encabezados y rangos combinados | Contexto utilizable solo con asociación verificable a la operación |

Los encabezados relativos y las etiquetas externas a una operación no resuelven
por sí mismos la identidad de una persona. El libro no aporta una indicación
explícita general de moneda: no se asume PEN, USD ni una moneda a partir de su
formato. La futura importación deberá conservar originales y dejar esas
ambigüedades fuera de los saldos confirmados hasta su revisión.

Esta comprobación no importa operaciones ni introduce un parser o selector de
archivos en la aplicación. Las huellas SHA-256 de ambos originales permanecen
idénticas a las registradas antes del trabajo. No hay Excel versionados.

## Contratos, procedencia y revisiones

Se reutilizan `inspectMovementBatch`, la validación de fechas, periodos y monedas,
la aritmética decimal exacta, `sourceOperationKey` y `evidenceBinding` de las
Fases 1–1.2. Los mecanismos de evidencia Excel no se modificaron.

El único cambio en el contrato compartido `models.js` es añadir dos tipos de
procedencia simulada exclusivos de Control:

- `control-session-demo`: declaración manual de un ejemplo, con fuente de sesión,
  identidad inmutable de operación, responsable declarado, fecha de captura,
  referencia y valores originales conservados antes de normalizar.
- `control-demo-excel`: permite verificar el contrato con capturas Excel inventadas
  y un contexto independiente. Se usa en pruebas; el flujo visual no lee archivos
  ni permite dar de alta o revisar estos registros como importaciones.

Ambos exigen origen `simulated`; no pueden ser movimientos reales ni tener estado
financiero `confirmed`. Los registros visuales conservan `validationStatus=pending`
incluso tras revisar o rechazar la demostración. El estado operativo de demo se
deriva de sus revisiones, separado de la validación financiera del contrato.

Una procedencia manual no puede hacerse pasar por evidencia Excel añadiendo
celdas, referencias de evidencia o una huella de archivo. Para la evidencia Excel
se exige el contexto independiente existente: se comprueba la relación de cada
campo con la operación, incluidos encabezados y celdas combinadas. Una revisión
genérica de demo no omite las validaciones A1 ni resuelve automáticamente campos
ambiguos. El flujo existente de revisión específica de evidencia se conserva;
no se habilita importación real ni revisión de archivos desde esta pantalla.

La aceptación demostrativa requiere datos completos, revisión explícita y
ninguna decisión financiera pendiente. La falta de moneda, aportante de un
depósito o destino no se resuelve por defecto. Puede conservarse el ejemplo
pendiente, completarse mediante edición y revisarse después, o rechazarse.

La revisión se vincula a toda la operación, su procedencia, la evidencia disponible
y una versión de contenido. Editar invalida las revisiones anteriores, incluso si
luego se restauran los valores antiguos. La asignación explícita entre periodos
queda vinculada a la fecha efectiva y al periodo de esa operación; editar exige
revisarla nuevamente. No se define una regla general de imputación.

Cada comando exige revisión esperada, ID único de evento y timestamp ISO válido
no anterior al último cambio. La identidad de operación no puede cambiar al editar.
Los eventos guardan snapshots independientes antes/después. Los resultados se
clonan al entrar al store para impedir mutaciones accidentales desde el llamador.
Esto permite reutilizar contratos con almacenamiento futuro, pero no ofrece firma,
autenticación, protección contra manipulación del navegador ni auditoría permanente.

### Duplicados

- Colisiones de ID excluyen los registros implicados, sin fusionarlos.
- La identidad de operación manual se conserva entre ediciones; cambiar el ID de
  registro no permite dar de alta otra vez la misma operación de origen.
- Se reutiliza la identidad física Excel por SHA-256, hoja y ancla de importe
  normalizada, conservando los controles de fila/rango y las celdas combinadas.
  Cambiar ID o lote no crea una operación nueva.
- C y D de una fila siguen siendo operaciones distintas. Una fila no se utiliza
  como clave única de movimiento.
- Coincidir en tipo, fecha, periodo, moneda, importe, aportante y destino produce
  una advertencia. Para introducir una operación legítimamente distinta con esos
  mismos valores se exige una explicación explícita, que queda registrada.

## Arquitectura y separación de módulos

| Pieza | Responsabilidad |
| --- | --- |
| `domain/controlSession.js` | Comandos puros, validación, identidad, revisión y resumen de demos |
| `store/controlStore.js` | Estado de Control solo en memoria, con cambios atómicos de movimiento y evento |
| `presentation/control.js` | Textos, estados y presentación exacta con moneda explícita |
| `ControlMovementEditor` / `ControlReviewEditor` | Formularios separados de las reglas |
| `routes/ControlFinanzas.jsx` | Dashboard, filtros, coordinación e historial visual |

El store es independiente de Fiorella. No escribe en sus ingresos, presupuestos,
gastos, escenarios, metas ni historial. No modifica `controlMovements`, reservado
para operaciones reales futuras. Las proyecciones de ahorro de Fiorella no se
convierten en depósitos ni se incluyen en ningún resumen de Control.

Se reutilizan `PeriodInput` y `StatusNotice` sin modificar sus implementaciones.
Los componentes, store y reglas de Fiorella permanecen intactos. No cambian las
dependencias, configuración de Vercel, PWA ni porcentajes aprobados.

Milton administra y Fiorella consulta como definición funcional futura. La UI
informa que el responsable se declara y que no hay autenticación ni permisos
verificados. No hay login, selector de rol con supuesta seguridad ni acceso real
restringido. La autorización efectiva deberá aplicarse posteriormente en backend.

No se utiliza localStorage, IndexedDB, Zustand persist, archivos de datos ni
servicios remotos. Navegar dentro de la aplicación conserva los ejemplos y sus
eventos; recargar o abrir una instancia nueva los elimina. No se promete guardado
permanente, sincronización ni recuperación de sesión.

## Validación y capturas

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 171/171: conserva las 142 anteriores y añade 29 de Control |
| `npm run lint` | Sin errores |
| `npm run build` | Correcto; también se ejecuta dentro del recorrido browser |
| `npm run test:browser` | 18/18 recorridos Chromium, incluidos los 12 anteriores; 19 pruebas contando el contenedor. Estable en tres ejecuciones consecutivas adicionales |
| Móvil/tablet/escritorio | 320×844, 390×844, 768×1024 y 1280×1024, sin desbordamiento horizontal |
| Excel originales / código protegido | Huellas intactas; reglas, código de Fiorella, dependencias y contratos Excel sin cambios |

Las pruebas nuevas incluyen depósitos/retiros, identidades independientes,
importes exactos, monedas separadas, casos incompletos o inválidos, políticas
pendientes, revisión/rechazo, imputación explícita entre periodos, revisión
obsoleta tras editar y revertir, duplicados por ID y procedencia, columnas de la
misma fila, encabezados, combinadas y rechazo de referencias arbitrarias.

Chromium recorre el registro, advertencias de duplicidad, edición, revisión,
rechazo, resúmenes por moneda, filtros de mes/año/estado, navegación entre módulos,
etiquetas de formularios y eliminación de todos los ejemplos y eventos al recargar.
También verifica que editar o revisar lleve al formulario correspondiente.
Las capturas esperan dos frames de render antes de obtener la imagen.

Las capturas se generan exclusivamente con datos inventados, fuera de Git, en
`/tmp/milfi-fase3-1-capturas/` (destino configurable con `MILFI_CAPTURE_DIR`):

- `12-control-resumen-movil.png`: resumen revisado de demostración.
- `13-control-monedas-movil.png`: monedas y operaciones separadas.
- `14-control-revision-movil.png`: movimiento editado y revisado, con historial.
- `15-control-escritorio.png`: presentación de escritorio.
- `16-control-formulario-movil.png`: formulario temporal de registro.
- `17-control-revision-formulario-movil.png`: revisión explícita de imputación.

Se inspeccionaron visualmente las capturas de resumen, revisión y escritorio.
Los flujos anteriores también regeneran sus capturas sintéticas en ese directorio.
El servidor de preview y el perfil temporal de Chromium se cierran al terminar.
No se instalaron dependencias ni navegadores. No se declara prueba en Safari,
Firefox ni un iPhone físico: los tamaños móviles son emulaciones en Chromium.
Persisten las advertencias heredadas de Browserslist y `module.register`; no
impiden ESLint, build ni pruebas y no se actualizan dependencias para ocultarlas.

## Decisiones pendientes y límites de entrega

- Identificación de monedas y aportantes ambiguos del Excel real, conservando las
  pruebas originales y exigiendo revisión específica antes de confirmar.
- Tratamiento de retiros para gastos, importe cero, fracciones de céntimo,
  redondeo, sobregiros, saldos iniciales y conciliación. No se adoptan reglas nuevas.
  Los casos de demo afectados pueden registrarse pendientes o rechazarse, pero
  una aceptación genérica no puede incluirlos en un resumen revisado.
- Criterios de imputación entre periodos a escala global. Solo se permite una
  decisión explícita y trazada sobre el ejemplo concreto.
- Importación real, almacenamiento, autorización autenticada y sincronización.
  Requerirán validación y control de concurrencia del servidor, además de los
  contratos de dominio; no basta con trasladar el store del navegador.
- Correspondencia futura de ahorro proyectado con operaciones efectivas. No hay
  conciliación ni promoción automática entre módulos.

Commits locales:

- `8687a60` (Codex): contratos de demostración, revisiones, aislamiento y 29 pruebas.
- `2b74fc3` (Codex): dashboard, formularios, historial y seis recorridos Chromium nuevos.
- Commit de pruebas (Claude Code): esperas de desplazamiento al formulario en Chromium.
- Commit documental (Claude Code): este informe y el README. No se modificó `main`, no se importó historial real y no se
hizo push, merge, despliegue o reescritura del historial. La Fase 3.2 no se inició.
El trabajo se detiene aquí para la revisión funcional focalizada solicitada.
