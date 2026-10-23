# MilFi 2.0 · Carga histórica única

El historial de los dos Excel se carga **una sola vez** de forma administrativa. No
existe pantalla de importación para el usuario: después, todo se registra en la app.

## Qué se conserva

**Finanzas de Fiorella** (`scripts/historical-load.mjs fiorella`):

| Dato del Excel | Destino | Regla |
|---|---|---|
| Ingreso y GF aplicado (📊 Historial) | `fiorella_monthly_plans` | Meses posteriores al corte → `plan_status = 'projected'` (no son ingresos recibidos). Vacío = NULL. |
| Presupuesto y gasto real GF por subcategoría y mes (📋 Track GF) | `fiorella_fixed_budgets` | Sin fecha inventada (total del mes). Vacío = NULL; cero = cero. Gasto real en meses futuros → pendiente. Ceros de plantilla en meses futuros → omitidos. |
| Movimientos GV (📋 Track GV) | `fiorella_variable_expenses` | Fecha, categoría, subcategoría, descripción, importe y notas. Mes escrito distinto de la fecha, importe vacío o fila idéntica → pendiente. |
| Metas guardadas (🔮 Simulador) | `fiorella_savings_goals` | Monto, meses, fecha límite tal como está escrita, estado y notas. El aporte mensual se deriva; no es un depósito. |
| Dashboard, Calculadora, proyección y meta inversa del Simulador | — | Derivados o simulaciones: no se cargan. |

Los importes de Excel se guardan como el decimal más corto del valor binario
almacenado (`12.300000000000001` → `12.3`), que es el valor que Excel muestra; el
texto original queda en `provenance`. Un importe con más de dos decimales queda pendiente.
La carga se bloquea si las reglas de ⚙️ Configuración difieren de `fiorella-official-v1`
o si algún total del libro no cuadra con las filas encontradas.

**Control Finanzas M&F** (`scripts/historical-load.mjs control`): usa el reconocedor y
las revisiones existentes. Depósitos para gastos, depósitos para ahorro y retiros se
mantienen como operaciones distintas. Moneda, aportante ("Tú"/"Ella") y periodo de los
retiros nunca se asumen: se resuelven solo con un archivo de decisiones del propietario
(`supabase/admin/control-decisiones.json.example`). Lo que no quede resuelto se carga
**pendiente de revisión** y se muestra así en la app, fuera de los totales.

## Procedimiento

Requisitos: migración `20261024100000_milfi_real_use.sql` aplicada en Supabase y
`.env.development.local` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.

1. **Vista previa (sin red).**
   `node scripts/historical-load.mjs fiorella ~/Downloads/MilFi_Fiorella_2026_octubre.xlsx --corte 2026-10-22`
   La terminal muestra conteos, conciliaciones y la *huella*. El detalle con importes
   queda en `supabase/.temp/carga-…json` (ignorado por Git, permisos 600) para revisarlo.
2. **Revisar** el detalle y, si todo es correcto, autorizar la carga.
3. **Cargar** con la misma orden más `--aplicar <huella>`. Inicia sesión quien
   administra el módulo (Fiorella para sus finanzas, Milton para Control) con contraseña
   oculta. El script verifica permiso, compara con lo ya guardado (bloquea copias), pide
   escribir `CARGAR` y hace **una sola transacción**. Repetirla falla sin escribir nada.
4. Borrar `supabase/.temp/carga-*.json` cuando ya no se necesite.

Los Excel, sus valores y el detalle nunca se suben a Git, fixtures, capturas, logs ni Vercel.
