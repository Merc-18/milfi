# MilFi 2.0 — Fase 4.1: Autenticación, base de datos y seguridad

Entrega local en `MILFI-Desarrollo`, rama `feat/milfi-v1-mejoras`, sobre la Fase 3.2
(`9e518a5`). No se creó ningún proyecto ni servicio externo, no se importaron
datos reales y no se modificó Vercel. Los formularios siguen en memoria: su
conexión a la base de datos corresponde a la Fase 4.2.

## Cierre de la Fase 3.2

`docs/FASE_3_2.md` contiene pruebas, ESLint, build, Chromium, commits y estado Git.
Solo faltaba el SHA de su propio commit documental (`9e518a5`), añadido aquí. No
había errores funcionales pendientes.

## 1. Arquitectura implementada

Autenticación, permisos, persistencia y lógica financiera están separados:

| Capa | Ubicación | Responsabilidad |
| --- | --- | --- |
| Esquema y seguridad | `supabase/migrations/*.sql` | Tablas, restricciones, triggers, auditoría, grants y RLS |
| Autorización efectiva | `public.module_permissions` + `private.has_module_access()` | Única fuente de permisos, evaluada por RLS con `auth.uid()` |
| Configuración pública | `src/infrastructure/supabase/config.js` | URL + clave publicable/anon; rechaza claves privilegiadas y URL inseguras |
| Autenticación | `src/infrastructure/supabase/authGateway.js` | Adaptador de `supabase-js` (cargado bajo demanda); errores como códigos, sin registros |
| Sesión | `src/store/sessionStore.js` | Recuperación, inicio/cierre, expiración, carga de permisos desde la base |
| Permisos en la interfaz | `src/domain/access.js`, `src/presentation/moduleAccess.js`, `src/components/auth/AccessGuards.jsx` | Reflejo visual de los permisos; no es el control de seguridad |
| Persistencia futura | `src/infrastructure/supabase/repositories.js` | Mapeo dominio ↔ filas y repositorios con control de revisión |
| Lógica financiera | `src/domain/*`, `src/application/*` | Sin cambios: reglas, simulador, metas, contratos, duplicados, evidencias, lector |

Sin configuración de Supabase la aplicación funciona en **modo demostración local**,
lo indica en todas las pantallas y en `/acceso`, y no simula ningún inicio de sesión.
Con configuración, todas las rutas de módulos exigen sesión y permisos.

## 2. Modelo de datos

| Tabla | Contenido | Claves y restricciones principales |
| --- | --- | --- |
| `households` | Hogar M&F | — |
| `profiles` | Usuario → hogar e identidad (`milton`/`fiorella`) | FK a `auth.users`; identidad única por hogar |
| `module_permissions` | Acceso `read`/`manage` por módulo | PK hogar+usuario+módulo; solo escribible por `private.assign_member` |
| `fiorella_monthly_plans` | Ingreso y GF aplicado | Único por hogar+periodo; GF ≤ 1500; `rules_version = fiorella-official-v1` |
| `fiorella_fixed_budgets` | Presupuesto/ejecución por subcategoría | Las 19 subcategorías oficiales; único por hogar+periodo+subcategoría |
| `fiorella_variable_expenses` | Gastos Salud/Ocio | Fecha dentro del periodo; motivo explícito para coincidencias |
| `fiorella_savings_goals` | Metas hipotéticas de pareja | Objetivo > 0, meses > 0, origen simulado |
| `control_import_batches` | Archivos preimportados | SHA-256 único por hogar |
| `control_movements` | Depósitos y retiros | Moneda ISO o nula; procedencia JSON; identidad única SHA-256 + hoja (sin mayúsculas) + celda |
| `control_movement_reviews` | Revisiones de evidencia, resoluciones, decisiones, demo | Solo inserción; vinculadas al movimiento y a su `binding` |
| `audit_events` | Historial de cambios con antes/después | Escrito solo por triggers |

Integridad y trazabilidad:

- Importes `NUMERIC` sin escala (exactos). Los repositorios los leen como `::text`
  porque PostgREST serializaría `NUMERIC` como número JSON con pérdida.
- Un movimiento confirmado exige importe, moneda, periodo y destino; un depósito,
  aportante; un retiro, fecha. No admite fracciones de céntimo, retiros para gastos
  ni origen simulado, mientras esas políticas sigan pendientes.
- Concurrencia optimista: cada actualización debe fijar `revision = anterior + 1`
  (`STALE_REVISION` en otro caso). Los repositorios actualizan con
  `where revision = esperada` y distinguen revisión obsoleta de acceso denegado.
- `id`, `household_id`, `created_by` y `created_at` son inmutables; autoría y fechas
  las fija el servidor con `auth.uid()`, no el cliente.
- Las revisiones conservan su `binding`: un cambio posterior las deja desactualizadas
  sin borrarlas. Los estados de duplicados, evidencias del Excel y procedencia se
  guardan íntegros en `provenance` y en `control_movement_reviews`.

## 3. Políticas RLS y matriz de permisos

Todas las tablas de `public` tienen RLS. La migración revoca primero todos los
privilegios por defecto de Supabase a `anon`, `authenticated` y `public`, y concede
solo lo necesario a `authenticated`. `anon` no recibe ningún privilegio.

| Recurso | Fiorella | Milton | Tercero sin perfil | Miembro de otro hogar | Anónimo |
| --- | --- | --- | --- | --- | --- |
| Finanzas de Fiorella (4 tablas) | Consultar, crear, editar, eliminar | Solo consultar | Nada | Nada | Denegado |
| `control_movements` | Solo consultar | Consultar, crear, editar, eliminar | Nada | Nada | Denegado |
| Revisiones y lotes de Control | Solo consultar | Consultar y añadir (no editar ni borrar) | Nada | Nada | Denegado |
| Historial de auditoría | Consultar sus módulos | Consultar sus módulos | Nada | Nada | Denegado |
| Hogar, perfiles y permisos | Consultar su hogar | Consultar su hogar | Nada | Solo su hogar | Denegado |
| Asignar roles (`private.assign_member`) | No | No | No | No | No |

- Los permisos dependen de `auth.uid()` y de filas que solo escribe una función
  administrativa con la matriz aprobada. No se leen `user_metadata`, `app_metadata`
  ni ningún valor editable por el usuario.
- Las funciones `SECURITY DEFINER` fijan `search_path = ''`.
- El registro público queda deshabilitado (`supabase/config.toml` y panel del
  proyecto). Aun si alguien se registrara, sin perfil asignado no vería nada.
- Ocultar botones en la interfaz es solo una ayuda: Milton no ve formularios de
  Fiorella y Fiorella no ve los de Control, pero la denegación real ocurre en la base.

## 4. Pruebas

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 211/211: las 186 anteriores y 25 nuevas (14 de base de datos/RLS, 8 de autenticación y pantallas, 3 de repositorios) |
| `npm run lint` | Sin errores |
| `npm run build` | Correcto; `supabase-js` queda en un fragmento cargado solo si hay configuración |
| `npm run test:browser` | 22/22 recorridos Chromium (23 pruebas con el contenedor): los 21 anteriores y la página de acceso |
| `npm audit` | 16 avisos, **los mismos antes y después** de las nuevas dependencias (todos heredados) |

### Verificado con PostgreSQL real y autenticación simulada

Las migraciones se ejecutan sobre **PGlite** (PostgreSQL 18.6 compilado a WASM, solo
como dependencia de desarrollo, en memoria, sin datos reales). Cada petición corre
como en PostgREST: sesión `authenticator` sin privilegios, `SET LOCAL ROLE
anon/authenticated` y claims JWT, con `auth.uid()` emulado igual que Supabase
(`tests/sql/supabase-emulation.sql`, que también reproduce los grants por defecto
de Supabase para comprobar su revocación).

- SELECT, INSERT, UPDATE y DELETE en las 5 tablas financieras para Milton, Fiorella,
  un tercero sin perfil, un miembro de otro hogar y un anónimo.
- Revisiones y lotes solo de inserción, con autor forzado; auditoría no escribible.
- Escalamiento: insertar/editar permisos, cambiar la identidad propia, crear hogares,
  invocar `assign_member`, `SET ROLE postgres`, claims con roles o metadatos falsos,
  mover filas a otro hogar, insertar en otro hogar o falsificar la autoría.
- Integridad (categorías, tope GF, fechas, confirmaciones incompletas, monedas,
  duplicados de celda de origen), concurrencia, exactitud decimal y auditoría.
- Coherencia del SQL con el dominio: catálogo GF, tope y versión de reglas, y matriz
  de permisos de `assign_member` igual a `APPROVED_ACCESS`.
- Interfaz: sesión, expiración, errores, usuarios sin permisos, configuración con
  clave privilegiada rechazada y pantallas según permisos (SSR con vista de sesión).

### Pendiente en un proyecto Supabase real

**La autenticación usada en estas pruebas es simulada. La validación definitiva de
RLS debe repetirse en Supabase** cuando se configure el proyecto:

1. Aplicar las migraciones con la CLI y confirmar que no fallan en Postgres 17 de Supabase.
2. Crear dos usuarios invitados y un tercero; asignar con `supabase/admin/assign_members.sql.example`.
3. Repetir la matriz anterior por la API REST con sus JWT reales y con la clave anon.
4. Confirmar que el registro público está deshabilitado y que un usuario recién
   creado sin asignación no ve datos.
5. Probar en la app real: inicio, cierre, recuperación al recargar, expiración y
   revocación de sesión, y limitación de intentos.
6. Verificar en el *Security Advisor* de Supabase que no hay tablas sin RLS.

Limitaciones conocidas del arnés: PGlite inicia sesión siempre como superusuario,
así que `SET SESSION AUTHORIZATION` no puede probarse (en Supabase PostgREST usa un
`authenticator` sin privilegios); los flujos de `supabase-js` se prueban con un
adaptador falso, no contra un servidor. Safari, Firefox e iPhone siguen sin probarse.

## 5. Configuración necesaria de Supabase (sin secretos)

1. Crear el proyecto (requiere autorización expresa; no se hizo en esta fase).
2. Authentication → Providers → Email: deshabilitar *Allow new users to sign up*;
   mantener deshabilitados los inicios anónimos.
3. Aplicar `supabase/migrations/` (`supabase db push` o el editor SQL, en orden).
4. Invitar a los dos usuarios y ejecutar la plantilla `supabase/admin/assign_members.sql.example`
   con sus UUID reales, **sin guardarlos en Git**.
5. Copiar `.env.example` a `.env.local` (ignorado por Git) con `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_PUBLISHABLE_KEY` (clave publicable o anon). Nunca la clave
   `service_role`/secreta: la aplicación se niega a arrancar con ella.
6. En Vercel, definir esas dos variables públicas cuando se autorice el despliegue.
   La protección de Vercel no sustituye este inicio de sesión.

El token de sesión de Supabase se guarda en el `localStorage` del navegador (comportamiento
estándar de `supabase-js`). Es un token de autenticación, no información financiera.

## 6. Commits locales y estado Git

- `13db50e`: esquema, migraciones, RLS, PGlite (desarrollo), `supabase-js` y 14 pruebas.
- `6ae482f`: autenticación, sesión, pantallas por permisos, repositorios y 11 pruebas.
- Commit documental posterior: este informe, README y SHA de la Fase 3.2.

`main` y `origin/main` siguen en `084eeb1`. Sin push, merge, despliegue ni reescritura
de historial. Excel originales intactos. Dependencias añadidas, fijadas a versión
exacta y aprobadas para esta fase: `@supabase/supabase-js@2.118.0` (ejecución) y
`@electric-sql/pglite@0.5.11` (solo desarrollo; no entra en el frontend).

## 7. Bloqueos concretos para comenzar la Fase 4.2

1. **Proyecto Supabase**: crearlo y configurarlo requiere autorización y credenciales
   que no deben entrar en Git.
2. **Validación de RLS en Supabase real** (sección 4) antes de guardar datos reales.
3. **Usuarios reales**: invitación de Milton y Fiorella y asignación con la plantilla.
4. **Decisiones financieras aún abiertas** que el esquema mantiene bloqueadas para
   confirmar movimientos: moneda del Excel de Control, aportantes por columna,
   imputación de retiros, importes cero y en texto, redondeo, retiros para gastos,
   sobregiros, saldos iniciales y conciliación entre versiones.
5. **Dependencias con avisos heredados** de `npm audit` (16, entre ellos `react-router-dom`
   y `vite`): conviene revisarlas antes de exponer la aplicación con datos reales.
6. **Política de sesión**: confirmar si el token debe persistir en `localStorage`
   (recuperación al reabrir) o limitarse a la pestaña.
