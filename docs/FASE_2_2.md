# MilFi 2.0 — Fase 2.2: Simulador y metas

Entrega local en `MILFI-Desarrollo`, rama `feat/milfi-v1-mejoras`, sobre la
Fase 2.1 aprobada. No hay backend, autenticación ni datos financieros importados.

## Correcciones de Fase 2.1

### Periodo con edición intermedia

`PeriodInput` deja al navegador gestionar los segmentos intermedios del campo
`month`, sin restablecer un valor controlado en cada pulsación. `periodDraftState`
solo permite cambiar el periodo aplicado cuando el borrador completo es válido.
Se muestra el periodo que sigue aplicado y el error se presenta al salir del
campo incompleto, no en cada pulsación. Los importes de un mes no se trasladan
durante la edición.

El componente se reutiliza en el selector mensual GF/GV y en el editor de
simulaciones. En este último se deshabilita guardar mientras el periodo está
incompleto. La solución usa HTML/React estándar, incluido el fallback de texto
de navegadores sin selector `month`; no depende de APIs específicas de Chromium.
Esto no constituye una prueba real en Firefox o Safari: véanse las limitaciones.

### Diferencia GF con cobertura incompleta

El dominio informa cuántas subcategorías tienen presupuesto y ejecución
registrados simultáneamente. La diferencia global solo está disponible cuando
las 19 subcategorías tienen ambos importes. En otro caso muestra información
incompleta y mantiene separados los totales parciales, sin restarlos.

Las diferencias individuales siguen calculándose cuando existen ambos valores
de esa subcategoría. No se compara, por ejemplo, el presupuesto de Gas con la
ejecución de Celular. Un cero registrado cuenta como dato; un blanco no.

## Verificación de las reglas del Excel

Se revisó en memoria la hoja Simulador del Excel oficial. No se modificó el
archivo ni se copiaron sus nombres de metas, notas o importes de ejemplo.

| Referencia funcional | Fórmula verificada | Implementación |
| --- | --- | --- |
| F/G/H de filas de proyección | ahorro total, personal y pareja con las tasas de Configuración | motor existente, sin cambios |
| I9 y acumulados siguientes | primer ahorro de pareja; acumulado anterior + ahorro de pareja del mes | suma exacta de periodos elegidos |
| F28, Meta inversa | objetivo / meses disponibles | cociente exacto; entradas inválidas bloqueadas |
| F29, Meta inversa | aporte mensual / (porcentaje ahorro × porcentaje pareja) + tope GF | ingreso necesario suponiendo GF de S/ 1,500 |

La hoja permite variar ingresos y GF por fila. Se conserva el máximo aprobado
de GF; no se importan ni se fijan sus meses o años de ejemplo.

Diferencias y ambigüedades que no se adoptan automáticamente:

- El Excel utiliza `MAX(ingreso-GF,0)` en la proyección. Las decisiones de déficit
  y sobrante cero no están aprobadas; se sigue bloqueando su distribución con el
  motor existente. No se oculta el déficit convirtiéndolo en capacidad cero.
- `IFERROR(...,0)` en la meta inversa no autoriza un resultado financiero cero
  ante meses nulos o inválidos. Se exige objetivo positivo y meses enteros positivos.
- I18 refiere a I17, que en esta copia no tiene valor ni fórmula. La intención
  de ese resumen queda pendiente; no se usa como total anual ni como fuente
  histórica. Sí se utiliza la acumulación explícita verificable de las filas.
- Fecha límite, estado y notas de metas del libro no establecen una relación
  verificable entre mes inicial, meses disponibles y fecha de cumplimiento.
  No se genera ninguna fecha límite ni se copian esos registros.
- La meta inversa está referida al ahorro de pareja. No se generaliza el ingreso
  necesario a metas personales sin aprobar ese comportamiento.

## Funciones implementadas

### Escenarios — `/fiorella/simulador`

- Editor de ingreso, GF y periodo, reutilizado también por `/fiorella/calculadora`.
- Distribución exacta de GF, GV, ahorro total, personal, pareja, Salud y Ocio.
- Comparación de dos alternativas, con cambio de B respecto de A en ocho magnitudes.
  Las alternativas no se suman y debe elegirse un escenario distinto para cada lado.
- Los cálculos se recomputan con el motor oficial; no se toma como cierta una
  distribución derivada alterada dentro de un snapshot.
- Durante una transición a déficit se retiran inmediatamente los resultados
  accionables anteriores. La animación no mantiene visible el botón de guardar
  de un escenario que ya dejó de ser válido.

### Proyección explícita

- Selección manual de una alternativa por periodo, ordenada cronológicamente.
- Acumulados de ahorro de pareja y total personal separado.
- Rechazo de IDs repetidos y de dos alternativas del mismo mes.
- Si un periodo elegido está sin resolver no se presenta una suma parcial como
  resultado completo. Los meses vacíos no se rellenan ni se repiten ingresos.
- No hay saldo inicial, intereses, rentabilidad, aportes externos, depósitos ni
  conciliación con Control Finanzas M&F.

### Metas hipotéticas de pareja

- Nombre propio, objetivo y meses definidos por el usuario, sin valores del Excel.
- Estimación de aporte mensual y de ingreso necesario con el supuesto GF=1500
  explícito de la fórmula original.
- Alta y edición solo en memoria, con ID, versión, origen simulado, estado
  pendiente, revisión esperada y fechas de creación/cambio. `actorId` es nulo,
  no una sesión autenticada. Se bloquean revisiones obsoletas o cambios retroactivos.
- Comparación con capacidad de pareja de los periodos seleccionados; el ahorro
  personal se presenta como excluido del objetivo.
- Para comparar con N meses se requieren N periodos distintos. Si no son
  consecutivos, su relación con el plazo queda pendiente; no se inventan meses
  intermedios ni una fecha límite. La proyección independiente sí puede mostrar
  la suma de esos periodos explícitamente elegidos.
- Cada meta se evalúa por separado. No se reserva ni distribuye la misma capacidad
  entre varias metas ni se declara que todas estén financiadas a la vez.

Los ratios se calculan con enteros de precisión arbitraria. Si un cociente tiene
un decimal finito se muestra completo; si no, se conserva la fracción reducida.
Fracciones de céntimo y decimales no finitos quedan señalados como pendientes
de redondeo monetario. No se aplica `toFixed`, redondeo hacia arriba ni aproximación
para fingir una cuota pagable. Todas las cifras son estimaciones hipotéticas.

## Separación y almacenamiento

Los escenarios continúan en `simulations` y las metas en `savingsGoals` del
store temporal. Las selecciones de comparación/proyección son controles locales
de la pantalla. Volver a entrar conserva escenarios y metas durante la sesión,
pero requiere volver a elegir alternativas; recargar elimina todo ese contenido.

No se escriben `fiorellaRecords`, `fiorellaDemoRecords` ni `controlMovements` al
planificar. No hay promoción de simulaciones a ingresos, depósitos ni saldos.
No se usa localStorage, IndexedDB, Zustand persist ni servicios externos.

Los nuevos cálculos y contratos están en `savingsPlanning.js` y `savingsGoals.js`.
El editor visual no contiene porcentajes alternativos. `financialRules.js`,
`distribution.js` y `amounts.js` permanecen intactos.

## Pruebas y capturas

- `npm test`: 142 aprobadas, conservando las 122 anteriores y añadiendo 20 casos
  de periodo, cobertura GF, alternativas, proyección, división exacta, metas,
  revisión y separación de datos. Se amplía SSR a la nueva ruta.
- `npm run lint`: sin errores. Build de producción completo.
- `npm run test:browser`: 12 recorridos Chromium aprobados (13 pruebas contando
  el contenedor), incluidos los ocho anteriores.
- Chromium comprueba borrador nativo de periodo, actualización solo al completar,
  GF de coberturas distintas, diferencias individuales, comparación de escenarios,
  exclusión de alternativas duplicadas, déficit, metas/fracciones, edición,
  ausencia de contaminación de GF/Control y pérdida de escenarios/metas al recargar.
- Resoluciones: 320×844, 390×844, 768×1024 y 1280×1024. Sin desbordamiento
  horizontal en la pantalla final; los campos tienen etiquetas asociadas.
- Se inspeccionan visualmente capturas con datos sintéticos en
  `/tmp/milfi-fase2-2-capturas/`, fuera de Git. Las nuevas son
  `08-gf-incompleto-movil.png`, `09-comparacion-movil.png`,
  `10-meta-fraccion-movil.png` y `11-proyeccion-escritorio.png`.
  Puede cambiarse el destino con `MILFI_CAPTURE_DIR`. Son regenerables.

### Límites de la comprobación de navegadores

Solo hay Chromium instalado. Se comprobó ausencia de ejecutables Firefox y
Safari/safaridriver y de runtimes Firefox/WebKit en la caché local; tampoco hay
herramienta alternativa disponible para ejecutarlos. No se instalaron navegadores.
No se declara verificación real en Firefox, Safari, WebKit ni un iPhone físico.
Las resoluciones móviles son emulaciones de viewport en Chromium. Queda pendiente
la prueba real del selector por segmentos/fallback y los formularios en esos entornos.

Persisten las advertencias heredadas de Browserslist y `module.register`.
No se cambian dependencias para silenciarlas.

## Decisiones pendientes y cierre

Commits locales de implementación:

- `0fa7518`: contratos, proyecciones, ratios exactos y pruebas de dominio.
- `f4ea295`: interfaz, correcciones de periodo/GF y recorridos Chromium.

El informe y README se versionan en un commit documental posterior, identificado
en la entrega final.

Déficits, sobrante cero, redondeo monetario, fechas límite, metas personales
inversas, asignación entre múltiples metas y el resumen ambiguo del Excel quedan
sin decidir. Tampoco se implementa rentabilidad ni cumplimiento de metas reales.

Se comprueban las huellas de ambos Excel y la ausencia de cambios en `main`,
reglas oficiales, dependencias y contratos/pantalla de Control Finanzas. No se
importa información real ni se realiza push, merge, despliegue o reescritura Git.
Al terminar se detiene el trabajo para evaluar Fase 2.2.
