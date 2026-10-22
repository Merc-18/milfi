# MilFi 2.0

Aplicación React + Vite + Zustand para Finanzas de Fiorella y Control Finanzas M&F.
La Fase 3.1 incorpora registro, revisión e historial demostrativo de Control M&F,
independiente de los formularios GF/GV, escenarios y metas de Fiorella. La Fase 3.2
añade la lectura local del Excel de Control y una preimportación revisable que no
escribe en el historial real. La Fase 4.1 prepara Supabase Auth y PostgreSQL con RLS
(migraciones en `supabase/`), sin conectar todavía los formularios. Sin un proyecto
configurado la app funciona en modo demostración local: los datos duran solo la
sesión y se pierden al recargar. Todavía no administra dinero real ni ofrece autenticación
o sincronización.

## Estado de los datos

- **Fiorella:** plantilla configurada con reglas definitivas. Historial real aún
  no importado; se espera otra versión actualizada del Excel.
- **Control M&F:** fuente histórica real identificada, sin movimientos importados.
  Sus registros ambiguos deberán permanecer pendientes de validación.
- **Simulaciones:** ejemplos introducidos manualmente, solo en memoria durante la
  sesión. Se pierden al recargar y nunca se convierten en registros reales.
- Los mocks anteriores se retiraron de la aplicación. No hubo importación,
  conversión de registros ni conciliación de ahorros simulados con depósitos reales.

## Reglas oficiales

| Regla | Valor |
| --- | --- |
| Tope GF | S/ 1,500 |
| Variables | 40% del sobrante |
| Ahorro total | 60% del sobrante |
| Personal | 60% del ahorro |
| Pareja | 40% del ahorro |
| Salud | 50% de variables |
| Ocio | 50% de variables |

La fuente de código única es `src/domain/financialRules.js`. Sus objetos están
congelados y versionados. No existe una operación para editar los porcentajes.
No se reinterpretaron categorías históricas antiguas.

## Desarrollo y comprobaciones

Se mantienen las dependencias del lockfile existente. Vite 8 requiere Node
20.19+ o 22.12+ según sus rangos compatibles. Esta fase se verificó con Node 26.8.2.

Con las dependencias disponibles:

```sh
npm run dev
npm test
npm run test:browser
npm run lint
npm run build
npm run check:control-structure -- <ruta-local-al-xlsx>
```

`check:control-structure` contrasta en privado la estructura de un Excel de Control:
imprime posiciones, recuentos y códigos, nunca importes, fechas, descripciones ni
nombres, y comprueba que el archivo no cambió.

`npm test` utiliza `node:test`, sin dependencias de pruebas adicionales. Incluye
aritmética exacta, reglas aprobadas, validación y procedencia, aislamiento del
store y renderizado de rutas mediante Vite/React en memoria, sin escuchar puertos.
`npm run test:browser` compila y verifica redirecciones, navegación e historial
de simulaciones con un Chromium ya instalado, sin descargar dependencias.
Puede indicarse su ejecutable con `MILFI_CHROMIUM_PATH`; en Linux también se
detecta la caché local de Playwright. Usa un perfil temporal con datos inventados
y un servidor de preview limitado a localhost; ambos se cierran al terminar.
No sustituye la verificación visual completa en dispositivos.

## Navegación

- `/`: entrada a los dos módulos.
- `/fiorella`: resumen y estado de la plantilla.
- `/fiorella/presupuestos`: presupuestos y ejecución GF por subcategoría y periodo.
- `/fiorella/gastos`: registro y seguimiento GV de demostración.
- `/fiorella/simulador`: alternativas, proyección y metas hipotéticas de pareja.
- `/fiorella/calculadora`: simulación con periodo explícito.
- `/fiorella/historial`: aviso de historial pendiente y simulaciones de la sesión.
- `/fiorella/configuracion`: consulta de las reglas oficiales.
- `/control`: dashboard, movimientos y revisiones de demostración; sin historial real importado ni saldo bancario.
- `/acceso`: inicio y cierre de sesión con Supabase Auth, o aviso de modo demostración si no está configurado.
- `/control/preimportacion`: lectura local de un Excel de Control y revisión previa de sus movimientos, solo en la sesión.

Las rutas anteriores `/calculadora`, `/historial`, `/configuracion` y
`/fondo-comun` redirigen a sus equivalentes. Las rutas desconocidas muestran una
página de recuperación. El futuro hosting deberá resolver rutas SPA a `index.html`.

## Límites y próximos pasos

No hay persistencia de datos financieros, importador, backend, autenticación,
autorización efectiva, conciliación ni operaciones de dinero real. Las identidades
y responsabilidades del modelo son metadatos del dominio, no sesiones ni permisos
de seguridad. Presupuestos y gastos de Fiorella pueden probarse como demostración
de la sesión. Las metas y proyecciones respaldadas por fórmulas verificadas son
hipotéticas; los flujos de datos reales siguen pendientes.

Déficits, sobrante cero, redondeo monetario, sobregiros y movimientos ambiguos
requieren aprobación. La calculadora presenta aritmética decimal exacta sin
redondear; muestra una advertencia cuando hay fracciones de céntimo. Los casos
de déficit y sobrante cero quedan señalados sin generar una distribución.

Los Excel originales y los datos financieros reales deben permanecer fuera del
repositorio. Las extensiones Excel y archivos locales de credenciales están
excluidos en `.gitignore`; no se debe forzar su incorporación ni usar registros
privados como fixtures de pruebas.

Consulta [la arquitectura y el alcance de Fase 1](docs/FASE_1.md).
Las [correcciones y el diagnóstico de historial de Fase 1.1](docs/FASE_1_1.md)
documentan los contratos reforzados y las decisiones pendientes sobre M1.
Las [correcciones A1/A2/A3 de Fase 1.2](docs/FASE_1_2.md) refuerzan la comparación
con evidencia independiente, revisiones trazables e identidad de operaciones
para detectar reimportaciones, incluidos encabezados y celdas combinadas.
La [entrega de Fase 2.1](docs/FASE_2_1.md) documenta funcionalidades, contratos,
pruebas y capturas. La [entrega de Fase 2.2](docs/FASE_2_2.md) incorpora las
correcciones de periodo/GF y la planificación exacta, con decisiones financieras
y comprobación real en Safari/Firefox pendientes. La [entrega de Fase 3.1](docs/FASE_3_1.md)
documenta Control M&F temporal, contratos, pruebas, capturas y decisiones pendientes.
La [entrega de Fase 3.2](docs/FASE_3_2.md) documenta el lector local, la preimportación,
los casos soportados y las decisiones pendientes. La [entrega de Fase 4.1](docs/FASE_4_1.md)
documenta el esquema, las políticas RLS, la autenticación, las pruebas con PostgreSQL
simulado y la configuración necesaria de Supabase. El trabajo queda detenido para su revisión.
