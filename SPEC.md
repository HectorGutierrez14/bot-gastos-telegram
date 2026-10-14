# Bot de gastos por Telegram — Especificación v1

## Objetivo
Bot personal de un solo usuario. El usuario escribe sus gastos diarios por Telegram y el bot:
- los registra y los clasifica por categoría;
- permite corregir la categoría con botones y aprende de esas correcciones;
- genera informes semanales y mensuales a demanda, con comparativa contra el periodo anterior;
- envía automáticamente el informe del mes cerrado;
- alerta cuando el gasto total del mes se acerca o supera un tope configurable;
- exporta los gastos a CSV;
- registra con qué tarjeta de crédito se hizo cada compra y los pagos de cada tarjeta, sin contar doble (el pago de la tarjeta nunca es un gasto).

## Stack
- Runtime: Cloudflare Workers (TypeScript, plan gratuito), con handlers `fetch` (webhook) y `scheduled` (Cron Trigger)
- Base de datos: Cloudflare D1
- Mensajería: Telegram Bot API (webhook)
- IA: Gemini API, capa gratuita (el modelo se configura con la variable `GEMINI_MODEL`)
- Pruebas: Vitest + `@cloudflare/vitest-pool-workers`

## Variables de entorno
Secretos (`wrangler secret put`; en local `.dev.vars`, que debe estar en `.gitignore`):
- `TELEGRAM_BOT_TOKEN`: token entregado por @BotFather
- `TELEGRAM_WEBHOOK_SECRET`: cadena aleatoria de 32 a 64 caracteres, solo `A-Z a-z 0-9 _ -`
- `GEMINI_API_KEY`
- `ALLOWED_TELEGRAM_USER_ID`: ID numérico del usuario (no el @username). En chats privados también es el `chat_id` al que se envían los mensajes automáticos.

Variables no secretas (wrangler config):
- `GEMINI_MODEL`
- `TARJETAS_CREDITO`: lista separada por comas de los alias de tarjetas de crédito, en minúsculas. Valor inicial: `nu,rappi`.

Cron Trigger (wrangler config): `0 13 1 * *` (día 1 de cada mes, 13:00 UTC = 8:00 a. m. en Bogotá).

## Endpoints

### POST /webhook (updates de Telegram)
1. Validar el header `X-Telegram-Bot-Api-Secret-Token` contra `TELEGRAM_WEBHOOK_SECRET` con comparación de tiempo constante. Si falta o no coincide, responder 401.
2. Rechazar bodies de más de 64 KB.
3. Responder 200 de inmediato y procesar en `ctx.waitUntil()`, porque Telegram reintenta ante errores o demoras.
4. Tipos de update aceptados: `message` y `callback_query`. Ignorar cualquier otro.
5. En `message`: procesar solo texto y solo chats privados (`chat.type === "private"`). A los mensajes con foto, audio o documento responder: "Por ahora solo entiendo texto".
6. Lista blanca: si `String(from.id) !== ALLOWED_TELEGRAM_USER_ID` (tanto en `message` como en `callback_query`), ignorar en silencio, sin responder ni registrar el contenido.
7. Idempotencia por `update_id` (tabla `updates_procesados`).
8. Enrutar `message`: primero comandos y después el registro de gastos. Enrutar `callback_query` al manejador de botones.

Cualquier otra ruta o método: 404.

### Script de configuración (no es un endpoint)
Script `npm run set-webhook` que lee el token y el secreto de `.dev.vars` o de variables de entorno y llama a:
- `setWebhook` con `url = https://<worker>.workers.dev/webhook`, `secret_token`, `allowed_updates: ["message", "callback_query"]` y `drop_pending_updates: true`.
- `setMyCommands` con el menú de comandos (ver sección Comandos).

Script `npm run webhook-info` que llama a `getWebhookInfo` y muestra solo `url`, `pending_update_count`, `last_error_date` y `last_error_message`.

Ninguno de los dos scripts debe imprimir el token ni URLs que lo contengan, ni siquiera cuando hay un error.

## Registro de gastos

### Formato de entrada
- `[fecha] <monto> <concepto>` o `[fecha] <concepto> <monto>`
- Ejemplos: `35000 almuerzo`, `almuerzo 35.000`, `uber 18k`, `gasolina moto 20 mil`, `$45.500 regalo Lau`, `ayer 20000 taxi`, `12/10 35000 almuerzo`
- Varios gastos en un mismo mensaje: uno por línea. Cada línea se procesa de forma independiente y se confirma por separado.

### Medio de pago (opcional, en cualquier posición de la línea)
- `tc <alias>`, donde `<alias>` está en `TARJETAS_CREDITO` (ej. `tc nu`, `tc rappi`): compra con esa tarjeta de crédito. Sin distinguir mayúsculas.
- `tc` solo, o `tc` con un alias desconocido: se registra el gasto con `tarjeta = 'sin_definir'` y la confirmación muestra botones con cada tarjeta configurada para elegir cuál fue. Hasta que se elija, el gasto cuenta en informes y tope, pero no en los saldos de tarjetas.
- Sin `tc`: efectivo o débito (`tarjeta = NULL`).
- La palabra `tc` y el alias se quitan del concepto. Ejemplos: `35000 almuerzo tc nu`, `uber 18k tc rappi`, `ayer regalo Lau 80k tc nu`.
- La confirmación muestra la tarjeta: `✅ $35.000 · Comida · almuerzo · TC Nu`.
- Las compras con tarjeta son gastos normales: cuentan en informes, categorías y tope en la fecha de la compra. Las compras a cuotas se registran por el valor total en la fecha de compra.

### Fecha retroactiva (opcional, al inicio de la línea)
- Formatos aceptados: `hoy`, `ayer`, `anteayer`, `dd/mm` y `dd/mm/aaaa`.
- Sin fecha, se usa la fecha actual en Bogotá.
- `dd/mm` sin año: se usa el año actual; si la fecha resultante es futura, se usa el año anterior.
- Rechazar fechas futuras, fechas inválidas (ej. `31/02`) y fechas de hace más de 365 días, con un mensaje explicativo.
- La confirmación muestra la fecha cuando no es hoy: `✅ $20.000 · Transporte · taxi · 13/10`.

### Parser de monto (determinista, sin IA)
- Moneda: COP, solo enteros (sin decimales).
- Acepta `$` opcional, separadores de miles `.` y `,`, sufijo `k`/`K` (×1.000) y la palabra `mil` (×1.000).
- El token de fecha `dd/mm` nunca se interpreta como monto.
- Rango válido: mayor que 0 y hasta 50.000.000. Fuera de rango, responder con un error explicativo.
- Si una línea no tiene monto o tiene más de uno ambiguo, responder con el formato de ayuda y no registrar nada.
- El concepto es el texto restante, sin la fecha, el monto ni el medio de pago, con los espacios normalizados.

### Clasificación
Se evalúa en este orden y se detiene en el primer paso que asigne categoría:

**Paso 1, regla fija Lau/Moto (determinista, NO llama a Gemini):**
- Normalizar el texto: minúsculas y sin tildes.
- Si contiene la palabra completa `lau` → categoría **Lau**.
- Si contiene la palabra completa `moto` → categoría **Moto**.
- Coincidencia por palabra completa (límites de palabra): `Laura`, `motor`, `motos` y `motocicleta` NO coinciden.
- Si aparecen ambas palabras, gana la que aparezca primero en el texto.
- Esta regla tiene prioridad absoluta: lo aprendido nunca la sobrescribe.

**Paso 2, conceptos aprendidos (NO llama a Gemini):**
- Buscar el concepto normalizado (minúsculas, sin tildes, espacios colapsados) en la tabla `aprendizaje`, con coincidencia exacta.
- Si existe, usar esa categoría con `fuente_clasificacion = 'aprendida'`.

**Paso 3, Gemini:**
- Categorías permitidas (enum cerrado): Comida, Mercado, Transporte, Deporte, Facturas, Viajes, Salud, Hogar, Entretenimiento, Compras, Educación, Financieros, Otros.
- Financieros cubre intereses, cuota de manejo, comisiones y seguros de tarjetas o créditos.
- Lau y Moto NO están en el enum de Gemini; solo el Paso 1 las asigna.
- Enviar a Gemini SOLO el concepto, sin el monto, la fecha ni otros datos.
- Usar salida estructurada (JSON con schema y enum) y validar la respuesta. Si la categoría no está en el enum, usar Otros.
- Timeout de 8 s. Ante error, 429 o timeout: guardar como Otros con `fuente_clasificacion = 'fallback'` e indicarlo en la confirmación.

### Confirmación con botones (inline keyboard)
- Cada gasto registrado se confirma en su propio mensaje: `✅ $35.000 · Comida · almuerzo`, con un botón `✏️ Cambiar categoría`.
- Al tocar ese botón, se edita el mismo mensaje (`editMessageReplyMarkup`) para mostrar todas las categorías válidas, incluidas Lau y Moto, en filas de 3, más un botón `Cancelar`.
- Al elegir una categoría: actualizar el gasto, guardar `fuente_clasificacion = 'manual'`, editar el texto del mensaje con la nueva categoría y volver a mostrar solo el botón `✏️ Cambiar categoría`.
- Siempre responder el callback con `answerCallbackQuery`.
- `callback_data` (máximo 64 bytes): `cat:<gastoId>:<indiceCategoria>`, `edit:<gastoId>`, `cancel:<gastoId>`, `tc:<gastoId>:<indiceTarjeta>` (elegir tarjeta) y `aj:<pagoId>:<opcion>` (ajuste de pago, ver Tarjetas de crédito). Validar el formato; verificar que el gasto existe y que el índice es válido. Si el gasto ya no existe (por ejemplo, por `/deshacer`), responder "Este gasto ya no existe" y quitar los botones.

### Aprendizaje de correcciones
- Cada corrección manual (por botón o con `/cambiar`) hace un upsert en `aprendizaje` (concepto normalizado → categoría).
- Si la corrección es hacia Lau o Moto, también se aprende.
- No se aprende de conceptos cuya categoría viene de la regla Lau/Moto (el Paso 1 siempre gana).
- `/aprendido`: lista los conceptos aprendidos con su categoría (máximo 50, los más recientes).
- `/olvidar <concepto>`: elimina un concepto aprendido.

## Tope de gasto mensual y alertas
- `/tope <monto>`: define el tope de gasto total mensual (usa el mismo parser de montos). Se guarda en la tabla `config`.
- `/tope`: muestra el tope actual, lo gastado en el mes y el porcentaje usado.
- `/tope off`: desactiva el tope.
- El total incluye todas las categorías, incluidas Lau, Moto y Financieros, y las compras con tarjeta en la fecha de compra. Los pagos de tarjeta y los saldos iniciales NO cuentan.
- Después de registrar un gasto (o de corregir uno) cuya fecha cae en el mes actual, recalcular el total del mes:
  - al alcanzar el 80%: `⚠️ Llevas $X de $Y este mes (80%)`;
  - al alcanzar o superar el 100%: `🚨 Superaste tu tope mensual: $X de $Y`.
- Cada umbral se notifica una sola vez por mes (tabla `alertas_enviadas`). Si el tope cambia, se reinician las alertas del mes en curso y se evalúa de inmediato contra el nuevo valor.
- Los gastos retroactivos de meses anteriores no disparan alertas.

## Tarjetas de crédito
Principio: el gasto ocurre cuando se compra. El pago de la tarjeta salda una deuda y NUNCA se registra como gasto ni aparece en categorías, totales, comparativas ni tope.

### Saldo estimado por tarjeta
`saldo = saldo_inicial + compras con la tarjeta (incluidos ajustes) − pagos`, considerando todo el historial.

### Comandos
- `/saldotc <alias> <monto>`: define el saldo inicial (deuda existente antes de usar el bot). Reemplaza el valor anterior. No es un gasto. `/saldotc <alias> 0` lo pone en cero.
- `/pagotc <alias> <monto>`: registra un pago. Acepta fecha retroactiva opcional al final, con los mismos formatos y reglas de los gastos: `/pagotc nu 1200000 ayer` o `/pagotc nu 1200000 12/10`. Sin fecha, se usa hoy. Valida que el alias exista en `TARJETAS_CREDITO`.
- `/tarjeta`: muestra por tarjeta el saldo inicial, compras, pagos y saldo estimado; además cuántos gastos con `tc` siguen sin tarjeta definida.

### Ajuste cuando el pago supera lo registrado
Después de registrar un pago, si el saldo estimado de esa tarjeta queda negativo, el bot responde:
`El pago supera lo registrado en TC Nu por $X. ¿Qué fue esa diferencia?` con tres botones:
1. `Intereses / cuota de manejo`: crea un gasto por $X, categoría Financieros, tarjeta = esa tarjeta, fecha = fecha del pago, concepto `Intereses y cuota de manejo (ajuste)`, `fuente_clasificacion = 'ajuste'`. Deja el saldo en 0.
2. `Compra no registrada`: crea un gasto por $X, categoría Otros, mismas condiciones y concepto `Compra no registrada (ajuste)`. La confirmación incluye el botón `✏️ Cambiar categoría`.
3. `Saldo a favor`: no crea gasto; el saldo queda negativo.
- Tras elegir, se editan el mensaje y los botones para mostrar lo hecho. Los botones solo funcionan una vez por pago (guardar `ajuste_resuelto`).
- Los gastos de ajuste disparan la evaluación del tope como cualquier gasto.
- Un saldo positivo después de un pago es normal (compras a cuotas o pagos parciales) y no genera pregunta.

## Informes

### A demanda (comandos)
- `/informe semana` (semana actual, de lunes a domingo), `/informe semana pasada`
- `/informe mes`, `/informe mes pasado`, `/informe <mes> [año]` (ej. `/informe octubre`, `/informe septiembre 2026`)

### Automático mensual
- El handler `scheduled` (cron del día 1) envía al usuario el informe del mes que acaba de cerrar.
- Idempotencia: registrar el periodo en `informes_enviados` y no reenviarlo si ya existe.
- Si el mes no tuvo gastos, enviar igual un mensaje indicándolo.
- No hay informes semanales automáticos.

### Contenido del informe
- Encabezado con el periodo y las fechas exactas.
- Total gastado y número de gastos.
- Desglose por categoría ordenado de mayor a menor, con monto y porcentaje.
- Top 3 de gastos individuales más altos.
- Si hay tope activo y el informe es mensual: porcentaje del tope usado.
- Desglose por medio de pago: efectivo o débito, y cada tarjeta de crédito.
- Sección informativa "Tarjetas de crédito" (separada de los totales): por tarjeta, compras del periodo, pagos del periodo y saldo estimado actual.
- **Comparativa con el periodo anterior equivalente**:
  - Periodo cerrado: contra el periodo anterior completo (semana contra semana anterior, mes contra mes anterior).
  - Periodo en curso: contra el mismo corte del periodo anterior. Ejemplo: del 1 al 14 de octubre contra del 1 al 14 de septiembre; si el mes anterior es más corto, el corte se limita a su último día.
  - Mostrar la variación del total y por categoría en pesos y en porcentaje (`▲ +$120.000 (+15%)` / `▼ -$40.000 (-8%)`). Categorías nuevas o desaparecidas se marcan como "nueva" o "sin gastos". Si el periodo anterior no tiene gastos, no se muestra porcentaje.
- Montos en formato COP: `$1.234.567`.
- Texto plano, sin `parse_mode`, para evitar problemas de escape con el contenido escrito por el usuario.

### Zona horaria
Todas las fechas, rangos, cortes y el cron se calculan en America/Bogota (UTC-5, sin horario de verano).

## Exportar a CSV
- `/exportar` (mes actual), `/exportar mes pasado`, `/exportar <mes> [año]`, `/exportar todo`.
- Enviar con `sendDocument` (multipart/form-data). Nombre del archivo: `gastos_<periodo>.csv`.
- Formato compatible con Excel en español: UTF-8 con BOM, separador `;`.
- Columnas: `fecha;tipo;monto;categoria;concepto;medio_pago;fuente_clasificacion`. Fecha en formato `aaaa-mm-dd`. `tipo` es `gasto` o `pago_tarjeta`; en los pagos, `categoria` y `fuente_clasificacion` van vacías. `medio_pago` es `efectivo_debito`, `tc_<alias>` o `tc_sin_definir`.
- Seguridad (CSV injection): todo campo de texto que empiece por `=`, `+`, `-`, `@`, tabulador o retorno de carro se prefija con `'`. Los campos con `;`, comillas o saltos de línea se escapan entre comillas dobles.
- Si el periodo no tiene gastos, responder con texto y no enviar archivo.

## Otros comandos
- `/deshacer`: elimina el último movimiento registrado (gasto o pago de tarjeta, por `registrado_utc`) y confirma cuál fue. Si el pago tenía un gasto de ajuste, pregunta con botones si también se borra ese gasto.
- `/cambiar <categoría>`: cambia la categoría del último gasto (equivale a la corrección por botón, incluido el aprendizaje).
- `/categorias`: lista las categorías válidas.
- `/ayuda` y `/start`: formato de uso y comandos.

Los comandos no distinguen mayúsculas ni tildes y se aceptan con o sin "/".

## Modelo de datos (D1)
```sql
CREATE TABLE gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_update_id INTEGER NOT NULL,
  linea INTEGER NOT NULL DEFAULT 0,
  fecha_gasto TEXT NOT NULL,          -- 'YYYY-MM-DD' en America/Bogota
  registrado_utc TEXT NOT NULL,       -- ISO 8601
  monto INTEGER NOT NULL,             -- COP
  concepto TEXT NOT NULL,
  categoria TEXT NOT NULL,
  tarjeta TEXT,                       -- NULL = efectivo/débito | alias | 'sin_definir'
  pago_ajuste_id INTEGER,             -- pago que originó este gasto de ajuste, si aplica
  fuente_clasificacion TEXT NOT NULL, -- 'regla' | 'aprendida' | 'ia' | 'fallback' | 'manual' | 'ajuste'
  texto_original TEXT NOT NULL,
  UNIQUE (telegram_update_id, linea)
);
CREATE INDEX idx_gastos_fecha ON gastos (fecha_gasto);

CREATE TABLE pagos_tarjeta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_update_id INTEGER NOT NULL UNIQUE,
  tarjeta TEXT NOT NULL,
  monto INTEGER NOT NULL,             -- COP
  fecha_pago TEXT NOT NULL,           -- 'YYYY-MM-DD' en America/Bogota
  registrado_utc TEXT NOT NULL,
  ajuste_resuelto INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_pagos_fecha ON pagos_tarjeta (fecha_pago);

CREATE TABLE saldos_iniciales_tarjeta (
  tarjeta TEXT PRIMARY KEY,
  monto INTEGER NOT NULL,             -- COP, deuda al empezar a usar el bot
  actualizado_utc TEXT NOT NULL
);

CREATE TABLE aprendizaje (
  concepto_normalizado TEXT PRIMARY KEY,
  categoria TEXT NOT NULL,
  actualizado_utc TEXT NOT NULL
);

CREATE TABLE config (
  clave TEXT PRIMARY KEY,             -- ej. 'tope_mensual'
  valor TEXT NOT NULL
);

CREATE TABLE alertas_enviadas (
  periodo TEXT NOT NULL,              -- 'YYYY-MM'
  umbral INTEGER NOT NULL,            -- 80 | 100
  enviado_utc TEXT NOT NULL,
  PRIMARY KEY (periodo, umbral)
);

CREATE TABLE informes_enviados (
  periodo TEXT PRIMARY KEY,           -- 'YYYY-MM'
  enviado_utc TEXT NOT NULL
);

CREATE TABLE updates_procesados (
  update_id INTEGER PRIMARY KEY,
  recibido_utc TEXT NOT NULL
);
```
- Gestionar el esquema con migraciones de D1 (`wrangler d1 migrations`).
- Todas las queries deben ser parametrizadas (`prepare().bind()`), nunca con concatenación de strings.
- Limpieza: borrar los registros de `updates_procesados` con más de 30 días en la ejecución mensual del cron.

## Cliente de Telegram
Métodos usados: `sendMessage`, `editMessageText`, `editMessageReplyMarkup`, `answerCallbackQuery`, `sendDocument`, `setWebhook` y `setMyCommands`.
- Base URL: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/<método>`.
- Encapsular las llamadas en un cliente propio que NUNCA loguee la URL, porque contiene el token.
- Ante un error HTTP, loguear solo el método, el código de estado y la descripción de error de Telegram.

## Seguridad
- No loguear el token, los secretos ni el texto completo de los mensajes. Los logs deben ser mínimos (`update_id` y tipo de evento).
- Toda la configuración sensible debe venir de secretos de Wrangler, nunca hardcodeada ni en el repo.
- Validar y limitar la longitud del texto de entrada (máximo 1.000 caracteres por mensaje y 20 líneas).
- Validar estrictamente `callback_data`; nunca confiar en él sin verificarlo contra la base de datos.
- El bot no debe funcionar en grupos ni canales; además se desactiva `/setjoingroups` en @BotFather.

## Pruebas (TDD)
Unitarias:
- Parser de monto: tabla de casos con todos los formatos de ejemplo, casos inválidos, límites de rango y que `dd/mm` no se confunda con un monto.
- Parser de fecha retroactiva: `hoy`, `ayer`, `anteayer`, `dd/mm`, `dd/mm/aaaa`, cambio de año, fechas futuras, inválidas y de hace más de 365 días.
- Regla Lau/Moto: mayúsculas, tildes, palabra completa, falsos positivos (Laura, motor, motos), precedencia cuando aparecen ambas, y que lo aprendido no la sobrescriba.
- Orden de clasificación: regla → aprendida → Gemini.
- Rangos de fechas en America/Bogota: semana actual y pasada, mes actual y pasado, mes con nombre, cruces de año y gastos cerca de la medianoche.
- Comparativa: periodo cerrado, periodo en curso con mismo corte, mes anterior más corto (ej. 31 de marzo contra febrero), periodo anterior sin gastos, categorías nuevas y desaparecidas.
- Alertas de tope: cruce del 80% y del 100%, una sola vez por umbral y mes, cambio de tope, gasto retroactivo de un mes anterior que no alerta, tope desactivado.
- CSV: BOM, separador, escape de comillas y `;`, neutralización de CSV injection, columnas `tipo` y `medio_pago`.
- Medio de pago: `tc nu`, `tc rappi`, mayúsculas, posición en la línea, `tc` solo, alias desconocido, y que `tc` no quede en el concepto.
- Saldos de tarjeta: saldo inicial + compras − pagos; gastos `sin_definir` excluidos; tarjeta agregada a `TARJETAS_CREDITO`.
- Pagos: nunca suman en informes, categorías, comparativa ni tope.
- Ajuste: pago que deja saldo negativo → tres opciones; saldo positivo → sin pregunta; botón de ajuste usado dos veces → no duplica.
- Formato de informes y de montos COP.
- Parseo de comandos con y sin "/", y validación de `callback_data`.

Integración (Gemini y Telegram siempre mockeados; nunca llamadas reales en tests):
- Secret token inválido o ausente → 401.
- Usuario no autorizado en `message` y en `callback_query` → se ignora sin respuesta.
- Chat de grupo → se ignora.
- Update duplicado → se procesa una sola vez.
- Fallback cuando Gemini falla o devuelve una categoría inválida.
- Mensaje con varias líneas → un mensaje de confirmación por gasto.
- Flujo completo de botones: editar → elegir categoría → gasto actualizado y concepto aprendido; cancelar; gasto inexistente.
- Concepto aprendido → no se llama a Gemini.
- `/deshacer` (gasto, pago y pago con ajuste), `/cambiar`, `/tope`, `/aprendido`, `/olvidar`, `/exportar`, `/saldotc`, `/pagotc`, `/tarjeta`.
- Flujo de `tc` solo → botón de tarjeta → saldo actualizado.
- Flujo de pago mayor a lo registrado → botón Intereses → gasto Financieros creado y alerta de tope evaluada.
- Handler `scheduled`: envía el informe del mes cerrado una sola vez aunque se ejecute dos veces.
- Verificar que ningún log contiene el token.

## Repositorio público
El repositorio es público en GitHub. Requisitos:
- Conservar y fusionar el `.gitignore` y el `.claude/settings.json` existentes; no reemplazarlos. El `.gitignore` debe cubrir como mínimo: `.dev.vars`, `.dev.vars.*` (excepto `.dev.vars.example`), `.env*` (excepto `.env.example`), `.wrangler/`, `node_modules/`, `*.csv`, `*.sqlite*`, `*.db` y `.claude/settings.local.json`.
- `.dev.vars.example` con los cuatro nombres de secretos y valores placeholder evidentes (ej. `TELEGRAM_BOT_TOKEN=reemplazar_por_token_de_botfather`).
- `CLAUDE.md` con las reglas de seguridad del proyecto: no leer ni crear `.dev.vars` ni `.env`; no pedir secretos en el chat; no escribir valores reales en código, pruebas, documentación ni commits; mostrar `git status` antes de cada commit; no hacer `git push` sin confirmación.
- Escáner de secretos antes del primer commit de código:
  - hook de pre-commit con gitleaks que bloquee el commit si detecta secretos (documentar en el README cómo instalar gitleaks en Windows, macOS y Linux);
  - GitHub Action que ejecute gitleaks en cada push y pull request.
- `wrangler` config: puede incluir el nombre del Worker, el binding y el `database_id` de D1, `GEMINI_MODEL`, `TARJETAS_CREDITO` y el cron. No debe incluir `account_id` (en local lo resuelve `wrangler login`; en GitHub Actions viene del secreto `CLOUDFLARE_ACCOUNT_ID`) ni ningún secreto.
- Las pruebas usan valores falsos evidentes (ej. `test-bot-token`, `123456`), nunca valores con formato real de token o llave.
- README con descripción, arquitectura, configuración paso a paso usando placeholders y la lista de secretos requeridos (solo nombres). Sin capturas con datos reales.
- Licencia MIT.

## Despliegue continuo (GitHub Actions)
Objetivo: cada push a `main` ejecuta las pruebas y, si pasan, aplica las migraciones de D1 y despliega el Worker. Costo cero: repo público y runner estándar `ubuntu-latest` (no usar runners grandes).

### Secretos en GitHub
- Solo dos, guardados como secretos del Environment `production` (no como secretos del repositorio):
  - `CLOUDFLARE_API_TOKEN`: token de Cloudflare con permisos mínimos (Workers Scripts: Edit y D1: Edit, solo para la cuenta del usuario).
  - `CLOUDFLARE_ACCOUNT_ID`.
- El Environment `production` solo permite despliegues desde la rama `main` (deployment branches: selected branches → `main`).
- Los secretos del bot (Telegram, Gemini, ID permitido) NO van en GitHub: viven en Cloudflare y se conservan entre despliegues.

### Workflow `ci.yml`
- Se dispara en `pull_request` y en `push` a ramas distintas de `main`.
- Instala dependencias con `npm ci` y ejecuta typecheck y `npm test`.
- No usa ningún secreto ni Environment.

### Workflow `deploy.yml`
- Se dispara solo en `push` a `main` y en `workflow_dispatch` (ejecución manual).
- `permissions: contents: read` a nivel del workflow.
- `concurrency` con un grupo fijo (ej. `deploy-production`) y `cancel-in-progress: false`, para que nunca corran dos despliegues a la vez.
- Job `test`: `npm ci`, typecheck y `npm test`.
- Job `deploy` (`needs: test`, `environment: production`, `runs-on: ubuntu-latest`):
  1. `npm ci`.
  2. Aplicar migraciones: `wrangler d1 migrations apply bot-gastos-db --remote` en modo no interactivo.
  3. Desplegar: `wrangler deploy`.
  - Usar `cloudflare/wrangler-action` con `apiToken` y `accountId` tomados de los secretos del Environment.
- El despliegue no modifica los secretos del Worker ni ejecuta `set-webhook` (eso se hace una sola vez, a mano).

### Reglas de seguridad de los workflows
- Nunca usar `pull_request_target`.
- Fijar todas las acciones externas a un commit SHA completo (con un comentario con la versión), no a tags como `@v3`.
- No imprimir variables de entorno ni secretos (`env`, `printenv`, `set -x`) en ningún paso.
- Dependabot configurado (`.github/dependabot.yml`) para actualizar semanalmente las GitHub Actions y las dependencias de npm.

## Fuera de alcance v1
- Informes semanales automáticos.
- Presupuestos por categoría.
- Gastos recurrentes.
- Múltiples usuarios.
- Audios y fotos de recibos.
