# MilFi 2.0

Aplicación React + Vite + Zustand para Finanzas de Fiorella y Control Finanzas M&F.
La Fase 1 prepara el dominio, los contratos de datos y la navegación. Todavía no
administra dinero real ni ofrece autenticación o sincronización.

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
npm run lint
npm run build
```

`npm test` utiliza `node:test`, sin dependencias de pruebas adicionales. Incluye
aritmética exacta, reglas aprobadas, validación y procedencia, aislamiento del
store y renderizado de rutas mediante Vite/React en memoria, sin escuchar puertos.
No sustituye pruebas de interacción en un navegador o dispositivo.

## Navegación

- `/`: entrada a los dos módulos.
- `/fiorella`: resumen y estado de la plantilla.
- `/fiorella/calculadora`: simulación con periodo explícito.
- `/fiorella/historial`: aviso de historial pendiente y simulaciones de la sesión.
- `/fiorella/configuracion`: consulta de las reglas oficiales.
- `/control`: estructura y estado de Control Finanzas M&F, sin saldos ficticios.

Las rutas anteriores `/calculadora`, `/historial`, `/configuracion` y
`/fondo-comun` redirigen a sus equivalentes. Las rutas desconocidas muestran una
página de recuperación. El futuro hosting deberá resolver rutas SPA a `index.html`.

## Límites y próximos pasos

No hay persistencia de datos financieros, importador, backend, autenticación,
autorización efectiva, conciliación ni operaciones de dinero real. Las identidades
y responsabilidades del modelo son metadatos del dominio, no sesiones ni permisos
de seguridad. Las funciones de presupuestos, gastos, metas y proyecciones completas
siguen pendientes.

Déficits, sobrante cero, redondeo monetario, sobregiros y movimientos ambiguos
requieren aprobación. La calculadora presenta aritmética decimal exacta sin
redondear; muestra una advertencia cuando hay fracciones de céntimo. Los casos
de déficit y sobrante cero quedan señalados sin generar una distribución.

Los Excel originales y los datos financieros reales deben permanecer fuera del
repositorio. Las extensiones Excel y archivos locales de credenciales están
excluidos en `.gitignore`; no se debe forzar su incorporación ni usar registros
privados como fixtures de pruebas.

Consulta [la arquitectura y el alcance de Fase 1](docs/FASE_1.md).
La siguiente fase queda detenida hasta la revisión técnica de Claude Code.
