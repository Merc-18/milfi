# Uso diario: versión visible, monedas y aportes extraordinarios

Trabajo sobre el checkout existente de `main`, actualizado y limpio al comenzar,
con HEAD `456b3ca`. No se crearon ramas ni worktrees. Un solo commit local al
terminar; sin push ni publicación.

## Fecha de compilación y versión

Debajo del logo se muestran dos líneas compactas:

- `Actualizado: DD/MM/AAAA · HH:mm`
- `Versión <commit corto>`

Los valores salen de `VITE_MILFI_BUILD` y `VITE_MILFI_VERSION`, que Vite inyecta
para esa compilación. Se conserva `VERCEL_GIT_COMMIT_SHA` como fuente prioritaria
del commit y Git como alternativa local. La fecha viene del sello existente,
generado en `America/Lima`, no de la fecha de edición de los datos. Una recarga
no genera otra fecha; sin metadatos se informa su ausencia. El detalle accesible
y la pantalla Acceso indican que es una compilación y que la hora es de Perú.

Se conserva el registro PWA existente (`autoUpdate`, limpieza de cachés,
`skipWaiting`, `clientsClaim` y comprobación al volver a primer plano), junto a
los encabezados `no-cache` de Vercel para el Service Worker y HTML. Una prueba
construye dos versiones de producción en carpetas temporales, instala la primera,
cambia el servidor a la segunda, activa la actualización y comprueba que el
nuevo commit sustituye al anterior y permanece tras recargar. Sin dependencias
nuevas, cambios de servicio externo ni publicación.

## Aportes por persona y moneda

Control muestra siempre «Aportes de Milton» y «Aportes de Fiorella», cada uno con
SOLES (PEN) y DÓLARES (USD). Si no hay depósitos elegibles de una moneda se informa
«Sin aportes USD confirmados» (o PEN), sin fabricar movimientos de cero.

Por destino se muestran el compromiso del mes recibido, habitual registrado,
extraordinario registrado, importe sin clasificación, total real del mes y
acumulado histórico. Los pendientes y la moneda no resuelta se identifican sin
sumarlos a cifras elegibles. PEN y USD conservan saldos, gráficas y totales
independientes, sin conversión.

Hay un solo historial de movimientos, con filtros por aportante, moneda, destino
y periodo. Cada fila abre el detalle con fecha real, mes recibido, mes de plan
asignado, importe, procedencia y tipo. Los depósitos históricos no se clasifican
retroactivamente: muestran «Sin clasificación histórica».

Cuando la procedencia guardada contiene `$` y el registro figura PEN, se muestra
un aviso para confirmar su moneda con la referencia original. Es un aviso de
procedencia, no una corrección automática. No se releyó ni reimportó el Excel,
ni se examinó o reescribió la base real para resolver esos casos.

## Registro de aportes extraordinarios

«Registrar movimiento» permite Habitual, Extraordinario o Habitual + extraordinario.
Para una transferencia combinada se introduce el importe total y su parte extra;
la parte habitual se calcula con aritmética decimal exacta y se muestra antes de
guardar. Se persiste una transferencia con un desglose estructurado, por ejemplo
**sintético**:

```json
{
  "amount": "700",
  "provenance": {
    "contribution": { "version": 1, "regular": "600", "extra": "100" }
  }
}
```

El total aportado y los saldos usan `amount` una sola vez. Dos transferencias
independientes se mantienen como dos operaciones con identidades distintas.
El habitual más el extra deben igualar exactamente el importe; no se usa `Number`
ni `parseFloat` para sumar dinero. Se conservan revisión, duplicados y auditoría.
Editar el desglose invalida la revisión anterior porque cambia la procedencia
ligada a ella; asignar solo un mes del plan sigue sin invalidarla.

Un depósito de ahorro puede quedar sin plan: el formulario ofrece «Asignar a un
mes del plan» como acción explícita. Esto reemplaza la obligatoriedad anterior
de elegir un plan al crear un depósito manual. La referencia habitual R − 1
sigue intacta, sin mover fechas o periodos ni asignar automáticamente extras.

## Compromisos explícitos y migración pendiente

No había una entidad de compromisos formales. Se prepara:

`supabase/migrations/20261023173000_milfi_control_contributions.sql`

La migración crea `control_contribution_commitments`, con importe decimal,
periodo recibido, persona, moneda, destino, nota y autoría del servidor. Reutiliza
los triggers y la auditoría existentes, y aplica los mismos permisos de Control:
Milton registra y ambos consultan. Las políticas de las tablas existentes no se
modifican. Cada acuerdo queda limitado a un periodo y combinación, sin UPDATE o
DELETE desde la app; no se sobrescriben acuerdos ni se copian a meses futuros.

El propietario confirma expresamente el acuerdo en «Definir compromiso del mes».
No se deduce del Excel, de medias, de un plan de Fiorella o de aportes extra. Un
compromiso no genera depósitos ni cambia el dinero recibido. Tras recargar se
recupera desde la tabla, sin sustituir otros acuerdos.

La migración también comprueba la estructura y suma del desglose JSON de las
transferencias nuevas. Los históricos sin ese campo permanecen válidos, sin
backfill ni UPDATEs. **La migración no se aplicó a Supabase real.**

El desglose ya puede persistirse en el JSON auditado existente sin exigir la
migración. Si la tabla de compromisos aún no existe, Control carga normalmente
y solo el registro de compromisos queda pendiente de habilitación. La UI no
muestra un error de carga del libro ni inventa acuerdos. Se probó expresamente
esta compatibilidad con el esquema anterior en PostgreSQL en memoria.

## Verificación pertinente

- 55 pruebas de cabecera, Control, desfase, repositorios y persistencia, incluidas
  11 nuevas: verdes.
- 16 pruebas de esquema, auditoría y RLS sobre PostgreSQL en memoria: verdes.
- Navegador: 5 recorridos de uso diario, su contenedor y 1 prueba PWA con dos
  compilaciones, 7/7. Datos sintéticos; medidas 390, 768 y 1280 px.
- `npm run lint`, `npm run build` y `git diff --check`: verdes.
- Las pruebas nuevas se incluyen en las suites completas futuras; no se repitieron
  importaciones ni suites ajenas a las dependencias afectadas.

Los casos cubren fecha y commit, sustitución de caché PWA, ambas personas y
monedas, moneda vacía, dos depósitos independientes, un depósito combinado,
precisión exacta, ausencia de duplicados, históricos no clasificados, extras PEN
y USD, pendientes excluidos, guardado y recarga, fechas/planes originales,
acuerdos explícitos e inmutables, modo consulta de Fiorella y presentación adaptable.

Los 30 movimientos históricos originales no se modificaron. No se ejecutaron
escrituras, importaciones ni migraciones contra Supabase real. Finanzas de
Fiorella, su distribución 40/60 y sus periodos y cálculos permanecen inalterados.
