# Carga de tu Excel de Control · Fase 4

Esta guía es para que **tú ejecutes** los pasos contra tu proyecto. En la entrega
solo se leyó el Excel local y se ensayaron las decisiones sin red. La migración,
la carga y la reversión real no se ejecutaron.

## 1. Aplicar la migración y verificarla

Desde la raíz de este checkout:

```bash
cd /home/procont/orca/workspaces/milfi/MILFI-Desarrollo
git switch feat/ux-fase-4
supabase --version
supabase login
read -r -p 'Project ref de tu proyecto Supabase: ' MILFI_PROJECT_REF
supabase link --project-ref "$MILFI_PROJECT_REF"
supabase migration list --linked
supabase db push --linked --include-all --dry-run
```

Con las migraciones anteriores ya aplicadas, la vista previa debe mostrar solo
`20261023120000_milfi_control_plan_period.sql`. Si aparecen otras, revisa primero
qué le falta a tu proyecto. `--include-all` es necesario si ya tienes aplicada la
migración anterior `20261024100000`: la nueva lleva la fecha de hoy, 23/10/2026,
y queda antes de ella en orden de timestamp. No renombres migraciones ya aplicadas.

Para aplicar y comprobar el registro:

```bash
supabase db push --linked --include-all
supabase migration list --linked
```

La fila `20261023120000` debe aparecer tanto en Local como en Remote.
En **Supabase → SQL Editor**, ejecuta estas consultas:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'control_movements'
  and column_name in ('plan_year', 'plan_month')
order by column_name;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.control_movements'::regclass
  and conname in ('control_movements_plan_pair', 'control_movements_plan_savings');
```

Debes ver dos columnas `smallint`, ambas anulables, y las dos restricciones:
ambos componentes del plan o ninguno, y plan solo para depósitos de ahorro.
La migración añade columnas; no asigna meses a movimientos existentes.

Los comandos de historial, simulación y aplicación siguen la
[referencia oficial de la CLI de Supabase](https://supabase.com/docs/reference/cli/supabase-db-push).

## 2. Archivo de decisiones fuera del repositorio

```bash
install -d -m 700 "$HOME/milfi-datos"
install -m 600 supabase/admin/control-decisiones.json.example "$HOME/milfi-datos/control-decisiones.json"
cat "$HOME/milfi-datos/control-decisiones.json"
```

La plantilla es JSON válido y contiene las decisiones propuestas:

| Entrada | Valor | Alcance |
|---|---|---|
| `reviewedBy` | `milton` | Responsable de las decisiones |
| `zeroAmounts` | `omit` | Política explícita de importe cero: **omitir** depósitos cero |
| `contributorId` | `milton` | Depósitos con destino gastos, reconocidos por el encabezado |
| `contributorId` | `fiorella` | Depósitos con destino ahorro, reconocidos por el encabezado |
| `currency` | `PEN` | Solo montos interpretados como números (`amountInterpreted: true`) |

Cada resolución incluye su motivo y la referencia a tu instrucción del 23/10/2026.
No hay resolución automática del texto con `$`, de los meses de los retiros ni del
mes de plan de los ahorros. El dominio llama al motivo de cero
`ZERO_AMOUNT_POLICY_PENDING`; la clave que declara la política es `zeroAmounts`,
con el valor admitido `omit`. Los meses vacíos no generan depósitos.

Lee el archivo antes de cargar. No lo guardes en Git; la copia privada es
`~/milfi-datos/control-decisiones.json`.

## 3. Ensayo en seco y carga real

El cargador espera `.env.development.local` (o `.env.local`) con
`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` de tu proyecto. Usa una clave
publicable `sb_publishable_…`. Al cargar te pedirá la sesión de **Milton**, con
permiso para administrar Control; escribe la contraseña oculta en la terminal.

Ensayo en seco, completamente local:

```bash
node scripts/historical-load.mjs control "$HOME/milfi-datos/Control_Finanzas_M_F.xlsx" --corte 2026-10-23 --decisiones "$HOME/milfi-datos/control-decisiones.json"
```

Para el archivo revisado, los recuentos son:

| Resultado | Cantidad |
|---|---:|
| Movimientos que se cargarían | 30 |
| Depósitos | 22 |
| Retiros | 8 |
| Preparados, sin motivos pendientes de importación | 22 |
| Pendientes de revisión de datos | 8 |
| Depósitos cero omitidos | 1 |
| Inválidos excluidos | 0 |

Motivos de revisión (se solapan; **no se suman**):

| Código | Cantidad |
|---|---:|
| `MISSING_CONFIRMED_PERIOD` | 8 |
| `SOURCE_PERIOD_AMBIGUOUS` | 8 |
| `UNRESOLVED_MONEY` | 4 |
| `SOURCE_AMOUNT_INTERPRETATION_REQUIRED` | 4 |
| `SOURCE_CURRENCY_AMBIGUOUS` | 4 |

En palabras: a 8 retiros les falta confirmar el mes; dentro de esos 8, hay 4
que también necesitan confirmar monto y moneda. La sugerencia US$ se muestra en
la app y solo se guarda cuando la confirmes.

El ensayo genera una **huella de carga de 16 caracteres** y un detalle privado
en `supabase/.temp/carga-control-<huella>.json`, ignorado por Git y con permisos
600. Ese detalle sí contiene los datos para tu revisión privada; la terminal
solo muestra recuentos, códigos y huellas. No lo publiques.

Después de revisar el detalle, copia la huella que acaba de mostrar y ejecuta:

```bash
read -r -p 'Huella de carga del ensayo (16 caracteres): ' MILFI_LOAD_DIGEST
node scripts/historical-load.mjs control "$HOME/milfi-datos/Control_Finanzas_M_F.xlsx" --corte 2026-10-23 --decisiones "$HOME/milfi-datos/control-decisiones.json" --aplicar "$MILFI_LOAD_DIGEST"
```

Con el mismo archivo, corte y decisiones, la huella debe coincidir. El script
vuelve a comprobar los conflictos con lo guardado, te pide escribir `CARGAR`
y guarda todo el lote en una transacción. Si rechaza la transacción no hay carga
parcial. Un archivo ya cargado se bloquea; no lo repitas para corregir una fila.

## 4. Qué ver en /control

Ejecuta la app con la configuración de tu proyecto, inicia sesión como Milton
y abre `/control`:

```bash
npm run dev -- --host 127.0.0.1
```

Si Control estaba vacío antes, habrá **30 movimientos en total**, de los cuales
**22 cuentan como cargados y 8 están pendientes de revisión de datos**. La lista
«Movimientos del mes» filtra por el mes elegido; no muestra los 30 juntos.

La sección global **«Por revisar (19)»** reúne:

- 8 retiros cuyos datos necesitan confirmación;
- 11 depósitos de ahorro cargados sin asignación de mes del plan.

Asignar el plan no cambia el estado de revisión ni el saldo: esos 11 ahorros ya
cuentan como depósitos. «Ahorro depositado» usa el mes de entrada (`period`);
«Cubierto» usa `plan_year/plan_month`, aunque el dinero entrara otro mes. Hasta
asignar los planes, «Cubierto» estará sin depósitos asignados. El semáforo compara
lo cubierto con el plan guardado de Fiorella; si no existe, muestra «Sin plan».

El saldo en soles es **depósitos de ahorro PEN menos retiros PEN**, contando solo
movimientos sin motivos pendientes. Los retiros USD se muestran aparte. Una
fecha posiblemente invertida es un aviso: no cambia la fecha ni bloquea totales.
Los recuentos anteriores describen este archivo y las decisiones de esta entrega;
si cambias uno de ellos, toma como referencia el nuevo ensayo.

## 5. Deshacer únicamente esta carga

Para un error en una fila puedes resolverla en la app. Si necesitas deshacer el
lote completo, usa el SQL Editor como propietario (`postgres`). Primero busca el
lote y verifica sus identificadores y su recuento, sin consultar importes:

```sql
select b.id as lote, b.household_id as hogar,
       left(b.source_fingerprint, 12) as archivo, b.created_at,
       count(m.id) as movimientos
from public.control_import_batches b
left join public.control_movements m on m.import_batch_id = b.id
where b.source_fingerprint like '649e75c4a220%'
group by b.id, b.household_id, b.source_fingerprint, b.created_at;
```

Para el archivo ensayado debe haber un lote con **30** movimientos. Si el archivo
cambió, usa el prefijo de **huella del archivo** que muestra tu nuevo ensayo:
no es la huella de carga de 16 caracteres.

Abre la plantilla de reversión:

```bash
cat supabase/admin/rollback_control_batch.sql.example
```

Copia el SQL en el editor y sustituye:

- `<UUID_LOTE>` por el `lote` de la consulta;
- `<UUID_HOGAR>` por el `hogar` de la misma fila;
- `<RECUENTO_MOVIMIENTOS>` por `30` (sin comillas), tras verificar el recuento.

Ejecuta el bloque completo. Comprueba el lote antes de confirmar la ejecución:
elimina sus movimientos y sus revisiones, conserva la auditoría y los datos de
otros lotes y de Fiorella. Si no encuentra el lote/hogar o no coincide el recuento,
aborta la transacción. No revierte la migración, que sigue siendo necesaria.

Verifica después, con los UUID que acabas de usar:

```sql
select count(*) from public.control_movements
where import_batch_id = '<UUID_LOTE>'::uuid;
select count(*) from public.control_import_batches
where id = '<UUID_LOTE>'::uuid and household_id = '<UUID_HOGAR>'::uuid;
```

Ambos resultados deben ser `0`. Recarga `/control`. Tras corregir lo necesario,
puedes repetir el ensayo y cargar de nuevo: al eliminarse el lote, ya no bloquea
por archivo repetido. La auditoría mantiene constancia de la carga anterior y de
su eliminación.
