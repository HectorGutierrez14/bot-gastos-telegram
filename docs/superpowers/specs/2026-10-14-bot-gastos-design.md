# Bot de gastos por Telegram — Diseño v1

Fecha: 2026-10-14
Fuente principal: [SPEC.md](../../../SPEC.md). Este documento NO la reemplaza: registra las decisiones tomadas al revisarla, los huecos resueltos y el orden de construcción. Donde este documento y SPEC.md difieran, manda este documento.

## Intención

Bot personal de un solo usuario para registrar gastos diarios por Telegram, clasificarlos, generar informes y controlar las tarjetas de crédito sin contar dos veces. Repositorio **público**: la seguridad de secretos es un requisito de primer nivel, no un detalle.

### Anti-objetivos (sería un fracaso aunque funcione)
- Que un secreto (token, llave, ID del usuario) termine en el repo, en un log, en un test o en un commit.
- Que el bot registre un gasto que el usuario no quiso registrar porque malinterpretó la línea.
- Que el pago de una tarjeta cuente como gasto.

## Decisiones del usuario (cambian o precisan SPEC.md)

1. **Comandos solo con "/"** (cambia SPEC.md, que decía "con o sin /"). Una línea que no empieza por `/` es siempre un intento de gasto. Los comandos no distinguen mayúsculas ni tildes (`/Informe`, `/categorías`). Se acepta el sufijo `@nombre_del_bot` (`/informe@mibot mes`).
2. **Monto con varios números: gana el monto marcado.** Un token es "candidato a monto" si tiene `$`, sufijo `k`/`K`, va seguido de `mil`, tiene separador de miles válido (`35.000`, `1,200,000`) o su valor es ≥ 1.000. Los números < 1.000 sin marca se quedan en el concepto.
   - Exactamente un candidato → ese es el monto (`2 cervezas 15000` → $15.000, concepto `2 cervezas`).
   - Ningún candidato pero un único número < 1.000 sin marca → ese es el monto (`almuerzo 500` → $500).
   - Dos o más candidatos, o varios números sin candidato → responder con la ayuda y no registrar.
   - El token de fecha `dd/mm` y los tokens `tc <alias>` se retiran antes de buscar montos.
3. **Hook de pre-commit en `.githooks/`**: script versionado `.githooks/pre-commit` que ejecuta `gitleaks git --staged` (o el subcomando equivalente de gitleaks 8.30) y bloquea el commit si detecta algo o si gitleaks no está instalado. Se activa con `git config core.hooksPath .githooks` desde el script `prepare` de npm. Sin husky ni pre-commit de Python.
4. **Ramas**: el primer commit va a `main` y contiene solo el blindaje del repo (gitleaks hook + workflow, `.gitignore`/`settings.json` fusionados, `CLAUDE.md`, `.dev.vars.example`, licencia). Todo el código va en la rama `feat/v1` con commits por tarea; al final, PR a `main`. Antes de cada commit se muestran `git status` y la lista de archivos; no se hace `git push` sin confirmación explícita.
5. **`GEMINI_MODEL = "gemini-3.5-flash-lite"`** en la config de wrangler.
6. **`npm run set-webhook` lee `WORKER_URL`** del entorno o de `.dev.vars` (el usuario la agrega). Debe empezar por `https://`; el script le añade `/webhook`. La URL no se versiona.
7. **`/deshacer` con ajustes** (cambia SPEC.md, que pedía preguntar con botones si borrar el ajuste): el gasto de ajuste es posterior a su pago, así que es el último movimiento. `/deshacer` sobre un gasto de ajuste lo borra, pone `ajuste_resuelto = 0` en su pago y envía de nuevo la pregunta de ajuste con sus tres botones (`aj:<pagoId>:<opcion>`), recalculando la diferencia con el saldo actual. Si tras borrar el ajuste el saldo ya no es negativo (por movimientos posteriores), no se vuelve a preguntar. Un segundo `/deshacer` borra el pago normalmente. No existen los botones `dh:`.
8. **`tc` con alias desconocido o sin alias**: solo se quitan del concepto `tc` y, si la palabra siguiente es un alias de `TARJETAS_CREDITO`, ese alias. Una palabra desconocida después de `tc` se queda en el concepto (`35000 tc almuerzo` → concepto `almuerzo`; `tc nuu almuerzo 35000` → `nuu almuerzo`). El gasto queda con `tarjeta = 'sin_definir'` y la confirmación muestra un botón por tarjeta configurada (`TC Nu`, `TC Rappi`, …) más un botón **`Corregir`** = "no fue con tarjeta": pone `tarjeta = NULL` (efectivo/débito). Tras elegir cualquiera, el mensaje se edita con el medio de pago final y queda solo `✏️ Cambiar categoría`. `callback_data` de Corregir: `tc:<gastoId>:x`.
9. **Concepto vacío**: si tras quitar fecha, monto y medio de pago el concepto queda vacío, no se registra y se responde con la ayuda.
10. **Nueva categoría fija `Apto`** (amplía SPEC.md): el Paso 1 pasa a ser la regla Lau/Moto/Apto. Si el texto normalizado contiene la palabra completa `apto` → categoría **Apto**. Mismas reglas que Lau y Moto: palabra completa (`aptos`, `apartamento`, `adapto` NO coinciden), si aparecen varias gana la primera en el texto, prioridad absoluta sobre lo aprendido, no está en el enum de Gemini, aparece en los botones de categoría y se aprende cuando la corrección es hacia ella. Todo lo que SPEC.md dice de "Lau y Moto" aplica también a Apto (tope, informes, tests de falsos positivos y de precedencia).

## Reglas de trabajo para el constructor (sesión de Claude)
- Nunca leer, editar, crear ni mostrar `.dev.vars` ni `.env*`. Si algo necesita que exista, pedírselo al usuario. Excepción: crear `.dev.vars.example` con placeholders.
- Nunca pedir secretos en el chat. Nunca escribir valores reales en código, tests, docs ni commits.
- Sin líneas `Co-Authored-By: Claude …` en commits ni firma "Generated with Claude Code" en PRs.
- `wrangler` se instala como devDependency y se usa vía `npx wrangler` / scripts npm (no está instalado globalmente).

## Decisiones menores tomadas por el diseñador (revisables)
- **Config de wrangler**: `wrangler.jsonc`. Worker `bot-gastos-telegram`, binding D1 `DB` (en vez del `bot_gastos_db` que sugiere wrangler), base `bot-gastos-db`, `database_id = "b041a184-08db-4763-9079-675cab6e21f5"` (ya creada por el usuario, región ENAM; no es secreto y SPEC.md permite versionarlo).
- **Node**: CI con Node 24 (LTS); `.nvmrc` con `24`.
- **`/informe <mes>` sin año**: misma regla que `dd/mm` — año actual; si el mes aún no empieza, año anterior. Mes en curso → se trata como "periodo en curso" (comparativa con mismo corte).
- **`/exportar <mes>` sin año**: misma regla.
- **Botón de tarjeta** (`tc:<gastoId>:<indice|x>`): solo actúa si el gasto sigue con `tarjeta = 'sin_definir'`; si no, responde "Este gasto ya tiene medio de pago" y quita los botones. El índice se resuelve contra `TARJETAS_CREDITO` actual.
- **Borrar un pago cuyo ajuste es "Saldo a favor"**: no hay gasto de ajuste; `/deshacer` borra el pago directamente.
- **Aprendizaje y gastos de ajuste**: corregir la categoría de un gasto con `pago_ajuste_id` no NULL no escribe en `aprendizaje` (su concepto es un texto fijo del bot).
- **Llave de Gemini** en el header `x-goog-api-key`, nunca en la URL.
- **Idempotencia**: al recibir un update se hace `INSERT OR IGNORE` en `updates_procesados`; si no insertó, se descarta. `UNIQUE (telegram_update_id, linea)` y `pagos_tarjeta.telegram_update_id UNIQUE` son la segunda barrera.
- **Errores en el procesamiento**: se capturan en `waitUntil`, se loguea solo `update_id`, tipo de evento y nombre del error; al usuario se le responde "Ocurrió un error, intenta de nuevo" si hay `chat_id`.
- **Orden de índices de categoría** para `cat:<id>:<i>`: Comida, Mercado, Transporte, Deporte, Facturas, Viajes, Salud, Hogar, Entretenimiento, Compras, Educación, Financieros, Otros, Lau, Moto, Apto (constante única en código; 16 categorías → 6 filas de botones).
- **`.gitignore`**: se conserva el actual y se añade `*.sqlite*` (cubre `-wal`/`-shm`). Nada se elimina.
- **`.claude/settings.json`**: se conserva y se amplía `deny` con `Write(./.dev.vars)`, `Edit(./.env)`, `Edit(./.env.*)`, `Write(./.env)`, `Write(./.env.*)`. No se toca `settings.local.json`.
- **Acción de gitleaks en CI**: ejecutar el binario oficial de gitleaks descargado con checksum verificado, o `gitleaks/gitleaks-action` fijado a SHA (gratuito para cuentas personales). Decide el constructor; en ambos casos `fetch-depth: 0` y SHA fijado.

## Todo lo demás
Tal como está en SPEC.md: endpoints, parser de fecha, clasificación (regla Lau/Moto → aprendida → Gemini), botones, tope y alertas, tarjetas y ajustes, informes y comparativas, CSV, modelo de datos, cliente de Telegram, seguridad, pruebas TDD, repositorio público y despliegue continuo.

## Pasos manuales del usuario (fuera del alcance del constructor)
1. ~~Crear la base D1~~ (hecho el 2026-10-14).
2. Crear `.dev.vars` con los cuatro secretos y `WORKER_URL`, y cargarlos en Cloudflare con `npx wrangler secret put …`.
3. En GitHub: Environment `production` restringido a `main`, con `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.
4. Tras el primer deploy: `npm run set-webhook`; en @BotFather desactivar `/setjoingroups`.

## Orden de construcción sugerido
1. Commit de blindaje en `main` (sin código).
2. Rama `feat/v1`: scaffold (package.json, tsconfig, wrangler.jsonc, vitest pool workers, migración inicial).
3. Utilidades puras con TDD: montos COP, fechas Bogotá, parser de línea (fecha/monto/tc/concepto), normalización, regla Lau/Moto, rangos de periodo, comparativa, CSV.
4. Cliente de Telegram y cliente de Gemini (mockeables).
5. Webhook (seguridad, idempotencia, enrutado) y registro de gastos con confirmación.
6. Botones, aprendizaje, `/cambiar`, `/deshacer`.
7. Tope y alertas. Tarjetas, pagos y ajustes.
8. Informes, `scheduled`, `/exportar`.
9. Scripts `set-webhook` / `webhook-info`, README, workflows `ci.yml`/`deploy.yml`, Dependabot.
