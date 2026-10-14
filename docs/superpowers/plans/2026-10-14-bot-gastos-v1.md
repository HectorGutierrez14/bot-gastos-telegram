# Bot de gastos por Telegram v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el bot personal de gastos (Cloudflare Worker + D1 + Telegram + Gemini) descrito en SPEC.md y en el documento de diseño, con repo público blindado y despliegue continuo.

**Architecture:** Un Worker con handler `fetch` (webhook de Telegram) y `scheduled` (informe mensual). Toda la lógica de negocio vive en funciones puras (parsers, periodos, informes, CSV) más una capa fina de repositorios D1; los handlers reciben un objeto `Deps` (DB, cliente Telegram, clasificador IA, reloj) para poder probarse sin red. Los scripts de webhook son Node puro (`.mjs`) fuera del Worker.

**Tech Stack:** TypeScript, Cloudflare Workers, D1, wrangler 4.151 (devDependency, usar `npx wrangler`), Vitest + `@cloudflare/vitest-pool-workers`, `@cloudflare/workers-types`, Node 24 en CI, gitleaks 8.30.

**Spec:** [SPEC.md](../../../SPEC.md) + [docs/superpowers/specs/2026-10-14-bot-gastos-design.md](../specs/2026-10-14-bot-gastos-design.md). Donde difieran, manda el documento de diseño. Lee ambos antes de empezar.

## Global Constraints

- Repo PÚBLICO. Nunca leer, editar, crear ni mostrar `.dev.vars` ni `.env*` (sí se crea `.dev.vars.example`). Nunca pedir secretos al usuario. Nunca escribir valores reales de secretos en código, tests, docs ni commits.
- Valores de prueba evidentes: `TELEGRAM_BOT_TOKEN=test-bot-token`, `TELEGRAM_WEBHOOK_SECRET=test-webhook-secret`, `GEMINI_API_KEY=test-gemini-key`, `ALLOWED_TELEGRAM_USER_ID=123456`.
- Antes de CADA commit: ejecutar `git status` y `git diff --cached --name-only`, mostrar la salida al usuario y luego commitear. Nunca `git push` sin confirmación explícita del usuario.
- Mensajes de commit SIN líneas `Co-Authored-By: Claude …`; PRs SIN firma "Generated with Claude Code".
- Tarea 0 se commitea en `main`; todas las demás en la rama `feat/v1`.
- Comandos solo con `/` (sin distinguir mayúsculas ni tildes; acepta `@nombre_bot`). Toda línea sin `/` inicial es un intento de gasto.
- Categorías (orden fijo, índice para `callback_data`): `Comida, Mercado, Transporte, Deporte, Facturas, Viajes, Salud, Hogar, Entretenimiento, Compras, Educación, Financieros, Otros, Lau, Moto, Apto`. Las tres últimas son "fijas" (solo regla, nunca Gemini).
- Zona horaria America/Bogota = UTC−5 fijo. Fechas como `'YYYY-MM-DD'`, periodos de mes como `'YYYY-MM'`.
- Montos COP enteros, rango 1..50.000.000, formato `$1.234.567`.
- Mensajes de Telegram en texto plano (nunca `parse_mode`).
- Queries D1 siempre con `prepare().bind()`.
- Logs: solo JSON con `evento`, `update_id`, `tipo`, y en errores `metodo`/`status`/`descripcion`/nombre del error. Nunca texto de mensajes, token ni URLs de Telegram.
- `GEMINI_MODEL = "gemini-3.5-flash-lite"`, `TARJETAS_CREDITO = "nu,rappi"`, cron `0 13 1 * *`, D1 `bot-gastos-db`, binding `DB`, `database_id = "b041a184-08db-4763-9079-675cab6e21f5"`, Worker `bot-gastos-telegram`.

## Review Focus

1. **Gasto registrado entre 00:00 y 05:00 UTC** (19:00–24:00 en Bogotá): debe quedar con la fecha de Bogotá (día anterior en UTC). Test en Tarea 2 (`hoyBogota`) y Tarea 11 (gasto a las 03:00 UTC).
2. **Mensaje de varias líneas donde una falla**: las válidas se registran y confirman; la inválida responde su error con prefijo `Línea N:`. Test en Tarea 11.
3. **Texto del usuario con caracteres especiales** (`*_[]<>&`, emojis, comillas): se guarda y se confirma tal cual, sin `parse_mode`. Test en Tarea 11.
4. **`TARJETAS_CREDITO` con espacios o mayúsculas** (`" Nu , RAPPI "`): se normaliza a `["nu","rappi"]`. Test en Tarea 6.
5. **Gemini responde algo mal formado** (JSON inválido, sin `candidates`, envuelto en ```json): se trata como fallo → `Otros`/`fallback`, nunca excepción. Test en Tarea 8.

---

## File Structure

```
.githooks/pre-commit              hook gitleaks (Tarea 0)
.github/workflows/gitleaks.yml    gitleaks en push/PR (Tarea 0)
.github/workflows/ci.yml          tests en PR y ramas ≠ main (Tarea 21)
.github/workflows/deploy.yml      test + migraciones + deploy en main (Tarea 21)
.github/dependabot.yml            (Tarea 21)
CLAUDE.md, LICENSE, .dev.vars.example, README.md
wrangler.jsonc, tsconfig.json, vitest.config.ts, package.json, .nvmrc
migrations/0001_inicial.sql
scripts/env.mjs                   carga variables (process.env > .dev.vars) y redacción
scripts/set-webhook.mjs, scripts/webhook-info.mjs, scripts/env.test.mjs
src/index.ts                      export default { fetch, scheduled }
src/env.ts                        interface Env
src/deps.ts                       interface Deps + crearDeps()
src/tipos.ts                      Gasto, PagoTarjeta, Fuente, Resultado<T>
src/log.ts                        log()
src/util/texto.ts                 normalizar(), contienePalabra()
src/util/cop.ts                   formatCOP(), formatVariacion()
src/util/fechas.ts                hoyBogota(), sumarDias(), ...
src/parse/fecha.ts                parseFechaToken()
src/parse/monto.ts                interpretarNumero(), parseMonto()
src/parse/linea.ts                parseLinea()
src/parse/comando.ts              parseComando()
src/parse/callback.ts             parseCallback()
src/categorias.ts                 CATEGORIAS, reglaFija(), buscarCategoria()
src/tarjetas.ts                   parseTarjetas(), nombreTarjeta(), calcularSaldo()
src/clasificar.ts                 clasificar()
src/gemini.ts                     crearClasificadorGemini()
src/telegram.ts                   TelegramApi, TelegramClient, tipos Tg*
src/db/*.ts                       repositorios (Tarea 10)
src/mensajes.ts                   textos fijos y textoConfirmacion()
src/teclados.ts                   inline keyboards
src/bot.ts                        procesarUpdate() (enrutado)
src/handlers/gastos.ts            registrarGastos()
src/handlers/callbacks.ts         procesarCallback()
src/handlers/comandos.ts          ejecutarComando() + comandos simples
src/handlers/tarjetas.ts          /saldotc /pagotc /tarjeta, ajuste
src/tope.ts                       evaluarTope(), /tope
src/periodos.ts                   rangos y comparación
src/informe.ts                    resumen, comparativa, formato, /informe
src/scheduled.ts                  ejecutarCron()
src/csv.ts                        generarCSV(), /exportar
test/helpers.ts                   FakeTelegram, crearDepsPrueba(), limpiarDB(), update builders
test/setup.ts                     aplica migraciones
test/**/*.test.ts
```

---

### Task 0: Blindaje del repo (en `main`)

**Files:**
- Create: `.githooks/pre-commit`, `.github/workflows/gitleaks.yml`, `CLAUDE.md`, `.dev.vars.example`, `LICENSE`
- Modify: `.gitignore` (agregar), `.claude/settings.json` (agregar), `package.json` (solo `"prepare"`)
- Commit también: `docs/superpowers/specs/2026-10-14-bot-gastos-design.md`, este plan, `package-lock.json`

- [ ] **Step 1:** `.gitignore`: conservar todo y añadir la línea `*.sqlite*` en la sección de datos. No quitar nada.
- [ ] **Step 2:** `.claude/settings.json`: conservar el `deny` actual y añadir `"Write(./.dev.vars)"`, `"Edit(./.env)"`, `"Edit(./.env.*)"`, `"Write(./.env)"`, `"Write(./.env.*)"`.
- [ ] **Step 3:** `.dev.vars.example`:
```
TELEGRAM_BOT_TOKEN=reemplazar_por_token_de_botfather
TELEGRAM_WEBHOOK_SECRET=reemplazar_por_secreto_aleatorio
GEMINI_API_KEY=reemplazar_por_llave_de_ai_studio
ALLOWED_TELEGRAM_USER_ID=reemplazar_por_tu_id_numerico
WORKER_URL=https://bot-gastos-telegram.reemplazar-subdominio.workers.dev
```
- [ ] **Step 4:** `CLAUDE.md` con: las reglas de seguridad de Global Constraints (no leer/crear `.dev.vars`/`.env`, no pedir secretos, no escribir valores reales, mostrar `git status` antes de cada commit, no `git push` sin confirmación, sin coautoría de Claude), comandos del proyecto (`npm test`, `npm run typecheck`, `npx wrangler …`) y punteros a SPEC.md y al documento de diseño.
- [ ] **Step 5:** `LICENSE` MIT, año 2026, titular "Hector David Gutierrez".
- [ ] **Step 6:** `.githooks/pre-commit` (ejecutable, `chmod +x`):
```sh
#!/bin/sh
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks no está instalado. Instálalo (ver README) antes de commitear." >&2
  exit 1
fi
exec gitleaks git --pre-commit --staged --redact --no-banner
```
- [ ] **Step 7:** `package.json`: añadir `"prepare": "git config core.hooksPath .githooks"` en `scripts` (el resto del archivo se reescribe en Tarea 1). Ejecutar `git config core.hooksPath .githooks`.
- [ ] **Step 8:** `.github/workflows/gitleaks.yml`: `on: [push, pull_request]`, `permissions: contents: read`, job en `ubuntu-latest`: `actions/checkout` con `fetch-depth: 0` y `gitleaks/gitleaks-action` con `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. Ambas acciones fijadas a SHA completo con comentario de versión. Obtener SHA con `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha` (p. ej. `gh api repos/actions/checkout/commits/v5 --jq .sha`, usando el último tag mayor publicado).
- [ ] **Step 9: Verificar que el hook bloquea.** Crear `tmp-leak.txt` con `ghp_` seguido de 36 caracteres alfanuméricos aleatorios (generados con `openssl rand -hex 18`), `git add tmp-leak.txt`, ejecutar `.githooks/pre-commit`. Esperado: exit ≠ 0 y hallazgo `github-pat`. Luego `git restore --staged tmp-leak.txt && rm tmp-leak.txt`.
- [ ] **Step 10:** `git add` de los archivos de esta tarea; `gitleaks git --pre-commit --staged --redact` → sin hallazgos. Mostrar `git status` + `git diff --cached --name-only` al usuario.
- [ ] **Step 11: Commit en `main`:** `chore: blindaje del repo público (gitleaks, CLAUDE.md, licencia) y diseño v1`. Luego `git switch -c feat/v1`.

---

### Task 1: Scaffold del Worker y pruebas

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`, `wrangler.jsonc`, `vitest.config.ts`, `.nvmrc`, `migrations/0001_inicial.sql`, `src/env.ts`, `src/index.ts`, `test/setup.ts`, `test/env.d.ts`, `test/smoke.test.ts`

**Interfaces:**
- Produces: `interface Env { DB: D1Database; TELEGRAM_BOT_TOKEN: string; TELEGRAM_WEBHOOK_SECRET: string; GEMINI_API_KEY: string; ALLOWED_TELEGRAM_USER_ID: string; GEMINI_MODEL: string; TARJETAS_CREDITO: string }` en `src/env.ts`. `default export { fetch(req, env, ctx): Promise<Response>, scheduled(controller, env, ctx): Promise<void> }` en `src/index.ts`. Scripts npm: `test` (`vitest run && node --test scripts/`), `typecheck` (`tsc --noEmit`), `deploy`, `set-webhook`, `webhook-info`, `prepare`.

- [ ] **Step 1:** `package.json`: `"type": "module"`, quitar `"main"`, `"private": true`, `"license": "MIT"`, conservar `wrangler` y `prepare`. Instalar devDependencies: `npm i -D typescript vitest @cloudflare/vitest-pool-workers @cloudflare/workers-types` (versión de vitest = la que pida como peer `@cloudflare/vitest-pool-workers`). `.nvmrc` = `24`.
- [ ] **Step 2:** `wrangler.jsonc` con `name`, `main: "src/index.ts"`, `compatibility_date` (la más reciente aceptada por wrangler 4.151, p. ej. `2026-10-01`), `d1_databases: [{ binding: "DB", database_name: "bot-gastos-db", database_id: "b041a184-08db-4763-9079-675cab6e21f5", migrations_dir: "migrations" }]`, `vars: { GEMINI_MODEL: "gemini-3.5-flash-lite", TARJETAS_CREDITO: "nu,rappi" }`, `triggers: { crons: ["0 13 1 * *"] }`. SIN `account_id`.
- [ ] **Step 3:** `migrations/0001_inicial.sql`: el SQL del "Modelo de datos (D1)" de SPEC.md, copiado literal.
- [ ] **Step 4:** `vitest.config.ts` con la API de configuración de la versión instalada de `@cloudflare/vitest-pool-workers` (seguir su README): wrangler config `./wrangler.jsonc`; miniflare `bindings` con los cuatro valores de prueba de Global Constraints y `TEST_MIGRATIONS` (de `readD1Migrations("migrations")`); `setupFiles: ["./test/setup.ts"]`. `test/setup.ts` aplica `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)`.
- [ ] **Step 5: Test que falla** `test/smoke.test.ts`:
```ts
it("usa secretos de prueba, nunca los de .dev.vars", () => {
  expect(env.TELEGRAM_BOT_TOKEN).toBe("test-bot-token");
  expect(env.ALLOWED_TELEGRAM_USER_ID).toBe("123456");
  expect(env.GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
});
it("aplica migraciones", async () => {
  const r = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gastos'").first();
  expect(r).not.toBeNull();
});
it("GET / responde 404", async () => {
  const res = await worker.fetch(new Request("https://x/"), env, createExecutionContext());
  expect(res.status).toBe(404);
});
```
- [ ] **Step 6:** `npm test` → FAIL (falta `src/index.ts`).
- [ ] **Step 7:** `src/env.ts` y `src/index.ts` mínimo (`fetch` → 404, `scheduled` vacío). `tsconfig.json`: `strict`, `target/module ES2022`, `moduleResolution bundler`, `types: ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"]`, `noEmit`.
- [ ] **Step 8:** `npm test` y `npm run typecheck` → PASS. Si el binding de prueba no es `test-bot-token`, PARAR: significa que se está leyendo `.dev.vars`; corregir la config (bindings explícitos) sin abrir `.dev.vars`.
- [ ] **Step 9:** Mostrar status/archivos. Commit `chore: scaffold del worker, D1 y vitest`.

---

### Task 2: Utilidades de texto, COP y fechas

**Files:**
- Create: `src/util/texto.ts`, `src/util/cop.ts`, `src/util/fechas.ts`, `src/tipos.ts`, `test/util/*.test.ts`

**Interfaces:**
- Produces:
  - `normalizar(s: string): string` — minúsculas, sin tildes (NFD y quitar `\p{M}`), espacios colapsados, trim.
  - `contienePalabra(normalizado: string, palabra: string): number` — índice de la primera coincidencia como palabra completa (límite = inicio/fin o carácter fuera de `[a-z0-9]`), o `-1`.
  - `formatCOP(n: number): string` — `1234567 → "$1.234.567"`, `-40000 → "-$40.000"`, `0 → "$0"`.
  - `formatVariacion(actual: number, anterior: number): string` — ver tests.
  - `hoyBogota(ahora: Date): string`, `sumarDias(f: string, n: number): string`, `diaSemana(f: string): number` (1=lunes…7=domingo), `ultimoDiaMes(anio: number, mes: number): number`, `fechaCorta(f): string` (`"13/10"`), `fechaLarga(f): string` (`"13/10/2026"`), `mesDe(f): string` (`"2026-10"`), `diferenciaDias(a: string, b: string): number` (b − a).
  - `src/tipos.ts`: `type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }`; `type Fuente = 'regla'|'aprendida'|'ia'|'fallback'|'manual'|'ajuste'`; `interface Gasto` (columnas de la tabla `gastos`, `tarjeta: string | null`, `pago_ajuste_id: number | null`); `interface PagoTarjeta` (columnas de `pagos_tarjeta`).

- [ ] **Step 1: Tests que fallan:**
```ts
expect(normalizar("  Almuerzo   CON  Láu ")).toBe("almuerzo con lau");
expect(contienePalabra("regalo lau", "lau")).toBe(7);
expect(contienePalabra("laura", "lau")).toBe(-1);
expect(contienePalabra("motor", "moto")).toBe(-1);
expect(formatCOP(1234567)).toBe("$1.234.567");
expect(formatCOP(-40000)).toBe("-$40.000");
expect(formatVariacion(920000, 800000)).toBe("▲ +$120.000 (+15%)");
expect(formatVariacion(460000, 500000)).toBe("▼ -$40.000 (-8%)");
expect(formatVariacion(50000, 0)).toBe("▲ +$50.000");          // sin % si anterior = 0
expect(formatVariacion(1000, 1000)).toBe("= $0 (0%)");
expect(hoyBogota(new Date("2026-10-14T03:00:00Z"))).toBe("2026-10-13"); // 22:00 del 13 en Bogotá
expect(hoyBogota(new Date("2026-10-14T05:00:00Z"))).toBe("2026-10-14");
expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
expect(diaSemana("2026-10-14")).toBe(3);
expect(ultimoDiaMes(2028, 2)).toBe(29);
expect(diferenciaDias("2025-10-14", "2026-10-14")).toBe(365);
```
- [ ] **Step 2:** `npx vitest run test/util` → FAIL.
- [ ] **Step 3:** Implementar. Porcentaje con `Math.round`. Fechas con aritmética UTC sobre `Date.UTC` (sin librerías).
- [ ] **Step 4:** → PASS. **Step 5:** status/archivos; commit `feat: utilidades de texto, COP y fechas Bogotá`.

---

### Task 3: Parser de fecha retroactiva

**Files:** Create `src/parse/fecha.ts`, `test/parse/fecha.test.ts`

**Interfaces:**
- Produces: `parseFechaToken(token: string, hoy: string): Resultado<string> | null` — `null` si el token no tiene forma de fecha (`hoy|ayer|anteayer|\d{1,2}/\d{1,2}(/\d{4})?`, sin distinguir mayúsculas/tildes); si la tiene, `ok` con `'YYYY-MM-DD'` o `error` con el texto exacto.

Textos de error exactos:
- inválida: `La fecha 31/02 no existe.` (repite el token tal como lo escribió el usuario)
- futura: `No puedo registrar fechas futuras (15/10/2026).`
- antigua: `Solo puedo registrar fechas de los últimos 365 días.`

- [ ] **Step 1: Tests que fallan** (hoy = `"2026-10-14"`):

| token | resultado |
|---|---|
| `hoy` / `Ayer` / `anteayer` | `2026-10-14` / `2026-10-13` / `2026-10-12` |
| `12/10` | `2026-10-12` |
| `20/12` (futuro este año → año anterior) | `2025-12-20` |
| `1/1` con hoy `2027-01-05` | `2027-01-01` |
| `31/12` con hoy `2027-01-05` | `2026-12-31` |
| `05/10/2026` | `2026-10-05` |
| `31/02` | error "La fecha 31/02 no existe." |
| `15/10/2026` | error futura |
| `14/10/2025` (365 días) | `2025-10-14` |
| `13/10/2025` (366 días) | error antigua |
| `almuerzo`, `35000`, `12/10/26` | `null` |

- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS. **Step 5:** commit `feat: parser de fecha retroactiva`.

---

### Task 4: Parser de monto

**Files:** Create `src/parse/monto.ts`, `test/parse/monto.test.ts`

**Interfaces:**
- Produces:
  - `interpretarNumero(token: string): { valor: number; marcado: boolean } | null` — acepta `$` opcional, dígitos simples, separadores de miles válidos (`^\d{1,3}([.,]\d{3})+$`), sufijo `k`/`K` (×1000). `marcado = true` si tiene `$`, `k`, separador, o valor ≥ 1000. Cualquier otra cosa (`1.5k`, `12/10`, `2.5`, `abc`) → `null`.
  - `parseMonto(texto: string): Resultado<number>` — para comandos: un único monto (`"500000"`, `"$2.000.000"`, `"20 mil"`, `"18k"`); valida rango.
  - `MONTO_MAX = 50_000_000`; `validarRango(n): Resultado<number>` con error exacto `El monto debe ser mayor que $0 y máximo $50.000.000.`

- [ ] **Step 1: Tests que fallan:**

| entrada `interpretarNumero` | salida |
|---|---|
| `35000` | `{35000, true}` |
| `35.000` / `35,000` | `{35000, true}` |
| `$45.500` | `{45500, true}` |
| `18k` / `18K` | `{18000, true}` |
| `2` | `{2, false}` |
| `500` | `{500, false}` |
| `1.5k`, `12/10`, `3.50`, `$`, `k` | `null` |

`parseMonto`: `"20 mil"`→20000, `"2.000.000"`→2000000, `"0"`→error rango, `"50000001"`→error rango, `"50.000.000"`→50000000, `"abc"`→error `No entendí el monto.`

- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat: parser de montos COP`.

---

### Task 5: Parser de línea de gasto

**Files:** Create `src/parse/linea.ts`, `test/parse/linea.test.ts`

**Interfaces:**
- Consumes: `parseFechaToken` (T3), `interpretarNumero`, `validarRango` (T4), `normalizar` (T2).
- Produces: `interface LineaGasto { fecha: string; monto: number; concepto: string; tarjeta: string | null }` y `parseLinea(linea: string, hoy: string, tarjetas: string[]): Resultado<LineaGasto>`; `error === "ayuda"` significa "responder con TEXTO_AYUDA"; cualquier otro error es el texto a mostrar.

Algoritmo (en este orden, sobre tokens separados por espacios):
1. Si el primer token da `parseFechaToken` ≠ null: si es error → devolver ese error; si ok → fecha y se consume. Si no, fecha = hoy.
2. Medio de pago: tokens cuyo `normalizar` es `tc`. Más de uno → `ayuda`. Uno: si el siguiente token normalizado ∈ `tarjetas` → tarjeta = alias y se consumen ambos; si no → tarjeta = `'sin_definir'` y solo se consume `tc`. Ninguno → `null`.
3. Monto: recorrer los tokens restantes; un token numérico seguido de `mil` (normalizado) vale ×1000, es `marcado` y consume ambos. Tokens con forma `dd/mm` nunca son monto. Candidatos = numéricos `marcado`. Exactamente 1 candidato → monto. 0 candidatos y exactamente 1 numérico no marcado → ese. Cualquier otro caso → `ayuda`. Validar rango (error de rango tal cual).
4. Concepto = tokens restantes unidos por un espacio, con su capitalización original. Vacío → `ayuda`.

- [ ] **Step 1: Tests que fallan** (hoy `2026-10-14`, tarjetas `["nu","rappi"]`):

| línea | fecha | monto | concepto | tarjeta |
|---|---|---|---|---|
| `35000 almuerzo` | 2026-10-14 | 35000 | `almuerzo` | null |
| `almuerzo 35.000` | | 35000 | `almuerzo` | |
| `uber 18k` | | 18000 | `uber` | |
| `gasolina moto 20 mil` | | 20000 | `gasolina moto` | |
| `$45.500 regalo Lau` | | 45500 | `regalo Lau` | |
| `ayer 20000 taxi` | 2026-10-13 | 20000 | `taxi` | |
| `12/10 35000 almuerzo` | 2026-10-12 | 35000 | `almuerzo` | |
| `2 cervezas 15000` | | 15000 | `2 cervezas` | |
| `almuerzo 500` | | 500 | `almuerzo` | |
| `35000 almuerzo tc nu` | | 35000 | `almuerzo` | `nu` |
| `uber 18k TC Rappi` | | 18000 | `uber` | `rappi` |
| `ayer regalo Lau 80k tc nu` | 2026-10-13 | 80000 | `regalo Lau` | `nu` |
| `tc nu 35000 almuerzo` | | 35000 | `almuerzo` | `nu` |
| `35000 almuerzo tc` | | 35000 | `almuerzo` | `sin_definir` |
| `35000 tc almuerzo` | | 35000 | `almuerzo` | `sin_definir` |
| `tc nuu almuerzo 35000` | | 35000 | `nuu almuerzo` | `sin_definir` |

Errores: `almuerzo` → ayuda; `35000 15000 almuerzo` → ayuda; `35000` → ayuda (concepto vacío); `35000 tc nu` → ayuda; `0 almuerzo` → error de rango; `60000000 carro` → error de rango; `31/02 35000 x` → "La fecha 31/02 no existe."; `tc tc 35000 x` → ayuda.

- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat: parser de línea de gasto (fecha, monto, tarjeta, concepto)`.

---

### Task 6: Categorías, regla fija y tarjetas (puro)

**Files:** Create `src/categorias.ts`, `src/tarjetas.ts` (solo funciones puras aquí), tests.

**Interfaces:**
- Produces:
  - `CATEGORIAS_IA` (13, `as const`), `CATEGORIAS_FIJAS = ["Lau","Moto","Apto"] as const`, `CATEGORIAS = [...CATEGORIAS_IA, ...CATEGORIAS_FIJAS]`, `type Categoria`, `type CategoriaIA`.
  - `reglaFija(concepto: string): "Lau"|"Moto"|"Apto"|null` — sobre `normalizar(concepto)`; palabras `lau`, `moto`, `apto`; gana la de menor índice con `contienePalabra`.
  - `buscarCategoria(texto: string): Categoria | null` — compara `normalizar` (`"educacion"` → `"Educación"`).
  - `parseTarjetas(raw: string): string[]` — split `,`, trim, minúsculas, sin vacíos.
  - `nombreTarjeta(alias: string): string` — `"nu"` → `"TC Nu"`, `"sin_definir"` → `"TC por definir"`.

- [ ] **Step 1: Tests que fallan:** `reglaFija`: `"regalo Lau"`→Lau, `"LÁU cena"`→Lau, `"gasolina moto"`→Moto, `"arriendo apto"`→Apto, `"Apto 302 admin"`→Apto, `"Laura"`/`"motor"`/`"motos"`/`"motocicleta"`/`"aptos"`/`"apartamento"`/`"adapto"`→null, `"moto de lau"`→Moto, `"lau moto"`→Lau, `"apto lau"`→Apto. `buscarCategoria("educacion")`→`"Educación"`, `("APTO")`→`"Apto"`, `("xyz")`→null. `CATEGORIAS.length === 16`, `CATEGORIAS[13] === "Lau"`. `parseTarjetas(" Nu , RAPPI ,")` → `["nu","rappi"]`. `nombreTarjeta("rappi")` → `"TC Rappi"`.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** commit `feat: categorías, regla Lau/Moto/Apto y alias de tarjetas`.

---

### Task 7: Orden de clasificación

**Files:** Create `src/clasificar.ts`, `test/clasificar.test.ts`

**Interfaces:**
- Consumes: `reglaFija`, `normalizar`.
- Produces: `interface Clasificacion { categoria: Categoria; fuente: "regla"|"aprendida"|"ia"|"fallback" }`;
  `clasificar(concepto: string, deps: { buscarAprendido(norm: string): Promise<Categoria | null>; clasificarIA(concepto: string): Promise<CategoriaIA | null> }): Promise<Clasificacion>`. `clasificarIA` devuelve `null` ante cualquier fallo → `{ "Otros", "fallback" }`.

- [ ] **Step 1: Tests que fallan** (con `vi.fn`): regla gana y no llama a nadie; aprendido `"lau"`→`Comida` no sobrescribe la regla (`"regalo Lau"` sigue Lau); aprendido existe → fuente `aprendida` y `clasificarIA` no llamado; `buscarAprendido` recibe `"almuerzo con jefe"` para `"Almuerzo  con Jefe"`; IA devuelve `"Transporte"` → `ia`; IA devuelve `null` → `Otros/fallback`; `clasificarIA` recibe SOLO el concepto.
- [ ] **Step 2–4.** **Step 5:** commit `feat: orden de clasificación regla → aprendida → IA`.

---

### Task 8: Cliente Gemini

**Files:** Create `src/gemini.ts`, `test/gemini.test.ts`

**Interfaces:**
- Produces: `crearClasificadorGemini(opts: { apiKey: string; model: string; fetchFn?: typeof fetch; timeoutMs?: number }): (concepto: string) => Promise<CategoriaIA | null>`.

Detalles fijos: `POST https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, header `x-goog-api-key` (nunca en la URL), `AbortSignal.timeout(timeoutMs ?? 8000)`. Body: `systemInstruction` con el texto "Clasifica el concepto de un gasto personal en Colombia en exactamente una categoría. Financieros cubre intereses, cuota de manejo, comisiones y seguros de tarjetas o créditos."; `contents: [{ role: "user", parts: [{ text: concepto }] }]`; `generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { categoria: { type: "STRING", enum: CATEGORIAS_IA } }, required: ["categoria"] } }`. Lee `candidates[0].content.parts[0].text`, `JSON.parse`, valida contra `CATEGORIAS_IA`. Cualquier fallo (red, abort, status ≠ 2xx incluido 429, JSON inválido, forma inesperada, categoría fuera del enum) → `null`. Log solo `{evento:"gemini_error", status|error}`.

- [ ] **Step 1: Tests que fallan** con `fetchFn` falso: respuesta válida `{"categoria":"Comida"}` → `"Comida"`; la URL no contiene la llave y el header sí; el body enviado contiene el concepto y NO otro dato; `"Lau"` → null; 429 → null; texto `` ```json {"categoria":"Comida"}``` `` → null; body `{}` → null; `fetchFn` que nunca resuelve con `timeoutMs: 20` → null; `fetchFn` que lanza → null.
- [ ] **Step 2–4.** **Step 5:** commit `feat: clasificador Gemini con salida estructurada y fallback`.

---

### Task 9: Cliente de Telegram y logging

**Files:** Create `src/telegram.ts`, `src/log.ts`, `test/telegram.test.ts`

**Interfaces:**
- Produces:
  - `log(evento: string, datos?: Record<string, string | number>): void` — `console.log(JSON.stringify({evento, ...datos}))`.
  - Tipos: `TgUpdate { update_id; message?: TgMessage; callback_query?: TgCallbackQuery; [k: string]: unknown }`, `TgMessage { message_id; from?: {id:number}; chat: {id:number; type:string}; text?: string; photo?; voice?; audio?; document?; video? }`, `TgCallbackQuery { id: string; from: {id:number}; message?: { message_id; chat: {id:number} }; data?: string }`, `InlineKeyboard = { inline_keyboard: { text: string; callback_data: string }[][] }`.
  - `interface TelegramApi { sendMessage(chatId: number|string, text: string, teclado?: InlineKeyboard): Promise<number | null>` (devuelve `message_id`)`; editMessageText(chatId, messageId: number, text: string, teclado?: InlineKeyboard): Promise<boolean>; editMessageReplyMarkup(chatId, messageId: number, teclado?: InlineKeyboard): Promise<boolean>; answerCallbackQuery(id: string, text?: string): Promise<boolean>; sendDocument(chatId, nombre: string, contenido: Uint8Array, caption?: string): Promise<boolean> }`.
  - `class TelegramClient implements TelegramApi { constructor(token: string, fetchFn?: typeof fetch) }`. `editMessageReplyMarkup` sin teclado envía `reply_markup: { inline_keyboard: [] }`. `sendDocument` usa `FormData` + `Blob` (`text/csv`).
  - Errores: nunca lanza; status ≠ 2xx → `log("telegram_error", { metodo, status, descripcion })` (descripción = `description` del JSON de Telegram); excepción de red → `log("telegram_error", { metodo, error: e.name })`.

- [ ] **Step 1: Tests que fallan:** la URL llamada es `https://api.telegram.org/bottest-bot-token/sendMessage`; el body no incluye `parse_mode`; respuesta 400 `{"ok":false,"description":"Bad Request: chat not found"}` → `null` y lo logueado (espiar `console.log`/`console.error`) contiene `sendMessage`, `400`, `chat not found` y NO contiene `test-bot-token` ni `api.telegram.org`; `fetchFn` que lanza `new TypeError("fetch failed https://api.telegram.org/bottest-bot-token/x")` → logs sin el token; `sendDocument` envía `multipart/form-data` con el nombre de archivo.
- [ ] **Step 2–4.** **Step 5:** commit `feat: cliente de Telegram que nunca loguea el token`.

---

### Task 10: Repositorios D1

**Files:** Create `src/db/gastos.ts`, `src/db/pagos.ts`, `src/db/aprendizaje.ts`, `src/db/config.ts`, `src/db/control.ts` (alertas, informes enviados, updates), `test/helpers.ts` (solo `limpiarDB(db)` por ahora), `test/db/*.test.ts`

**Interfaces** (todas reciben `db: D1Database` primero):
- gastos: `insertarGasto(db, g: Omit<Gasto,"id">): Promise<number | null>` (`INSERT OR IGNORE … RETURNING id`; `null` si duplicado), `obtenerGasto(db, id)`, `actualizarCategoria(db, id, categoria, fuente)`, `actualizarTarjeta(db, id, tarjeta: string|null)`, `borrarGasto(db, id)`, `gastosEntre(db, desde, hasta): Promise<Gasto[]>` (fechas inclusivas, orden `fecha_gasto, id`), `totalEntre(db, desde, hasta): Promise<number>`, `ultimoGasto(db): Promise<Gasto|null>` (por `registrado_utc DESC, id DESC`), `contarSinDefinir(db): Promise<number>`, `comprasTarjeta(db, alias, desde?, hasta?): Promise<number>`, `gastoDeAjuste(db, pagoId): Promise<Gasto|null>`.
- pagos: `insertarPago(db, p: Omit<PagoTarjeta,"id"|"ajuste_resuelto">): Promise<number|null>`, `obtenerPago`, `borrarPago`, `pagosEntre(db, desde, hasta)`, `totalPagos(db, alias, desde?, hasta?)`, `marcarAjusteResuelto(db, id): Promise<boolean>` (`UPDATE … SET ajuste_resuelto=1 WHERE id=? AND ajuste_resuelto=0`; `true` si cambió una fila), `reabrirAjuste(db, id)`, `ultimoPago(db)`, `getSaldoInicial(db, alias): Promise<number>` (0 si no hay), `setSaldoInicial(db, alias, monto, utc)`.
- `ultimoMovimiento(db): Promise<{ tipo: "gasto"; gasto: Gasto } | { tipo: "pago"; pago: PagoTarjeta } | null>` en `src/db/pagos.ts` — compara `registrado_utc`; empate → gasto.
- aprendizaje: `buscarAprendido(db, norm): Promise<Categoria|null>`, `aprender(db, norm, categoria, utc)` (upsert), `listarAprendidos(db, limite = 50)` (más recientes primero), `olvidar(db, norm): Promise<boolean>`.
- config: `getTope(db): Promise<number|null>`, `setTope(db, monto)`, `borrarTope(db)` (clave `tope_mensual`).
- control: `registrarAlerta(db, periodo, umbral: 80|100, utc): Promise<boolean>` (true si insertó), `borrarAlertas(db, periodo)`, `marcarInformeEnviado(db, periodo, utc): Promise<boolean>`, `marcarUpdate(db, updateId, utc): Promise<boolean>`, `limpiarUpdates(db, antesDeUtc: string)`.

- [ ] **Step 1: Tests que fallan** (cada archivo con `beforeEach(limpiarDB)`): insertar mismo `(update_id, linea)` dos veces → segunda `null`; `gastosEntre` incluye extremos; `marcarAjusteResuelto` dos veces → `true` luego `false`; `marcarUpdate` dos veces → `true`, `false`; `ultimoMovimiento` con gasto en `…T10:00:00.000Z` y pago en `…T10:00:01.000Z` → pago; `aprender` dos veces mismo concepto → una fila con la última categoría; `listarAprendidos` respeta límite y orden; `getSaldoInicial("nu")` sin fila → 0; `limpiarUpdates` borra solo los anteriores al corte.
- [ ] **Step 2–4.** **Step 5:** commit `feat: repositorios D1 parametrizados`.

---

### Task 11: Webhook, enrutado y registro de gastos

**Files:** Create `src/deps.ts`, `src/bot.ts`, `src/mensajes.ts`, `src/teclados.ts`, `src/handlers/gastos.ts`, `src/tope.ts` (solo stub `evaluarTope` que no hace nada; se completa en Tarea 14), `src/handlers/comandos.ts` (stub: `ejecutarComando` responde `Comando no reconocido. Escribe /ayuda`), `src/handlers/callbacks.ts` (stub: solo `answerCallbackQuery`); Modify `src/index.ts`; Tests `test/helpers.ts` (ampliar), `test/webhook.test.ts`, `test/gastos.test.ts`

**Interfaces:**
- Produces:
  - `interface Deps { db: D1Database; tg: TelegramApi; clasificarIA: (c: string) => Promise<CategoriaIA|null>; ahora: () => Date; tarjetas: string[]; chatId: string }`; `crearDeps(env: Env, fetchFn: typeof fetch = fetch): Deps`.
  - `procesarUpdate(update: TgUpdate, deps: Deps, allowedUserId: string): Promise<void>` en `src/bot.ts`.
  - `registrarGastos(msg: TgMessage, updateId: number, deps: Deps): Promise<void>`.
  - `textoConfirmacion(g: Gasto, hoy: string): string`; `TEXTO_AYUDA`, `SOLO_TEXTO = "Por ahora solo entiendo texto"`, `MENSAJE_LARGO = "El mensaje es muy largo: máximo 1.000 caracteres y 20 líneas."`, `NOTA_FALLBACK = "⚠️ No pude clasificarlo automáticamente: quedó en Otros."`.
  - `tecladoConfirmacion(g: Gasto, tarjetas: string[]): InlineKeyboard` — si `tarjeta === "sin_definir"`: fila con un botón por tarjeta (`nombreTarjeta`, `tc:<id>:<i>`) + `Corregir` (`tc:<id>:x`), y otra fila con `✏️ Cambiar categoría` (`edit:<id>`); si no, solo `✏️ Cambiar categoría`.
  - `evaluarTope(deps: Deps, fechaGasto: string): Promise<void>` (stub).
  - test/helpers: `class FakeTelegram implements TelegramApi { llamadas: { metodo: string; args: unknown[] }[] }` (message_id incremental desde 1000), `crearDepsPrueba(over?: Partial<Deps>): Deps & { tg: FakeTelegram }` (reloj que empieza en `2026-10-14T15:00:00.000Z` y avanza 1 s por llamada, `tarjetas ["nu","rappi"]`, `chatId "123456"`, `clasificarIA` = `vi.fn` que devuelve `"Comida"`), `mensaje(text, opts?)`, `callback(data, opts?)` builders con `from.id = 123456`, `chat.type = "private"`.

`index.ts` `fetch`: solo `POST /webhook`; validar header `X-Telegram-Bot-Api-Secret-Token` con SHA-256 de ambos lados + `crypto.subtle.timingSafeEqual` (falta o distinto → 401); `Content-Length` > 65536 o cuerpo leído > 65536 bytes → 413; JSON inválido → 200 sin procesar; si no, `ctx.waitUntil(procesarUpdate(...).catch(e => log("error_proceso", { update_id, error: e.name })))` y 200. Todo lo demás → 404.

`procesarUpdate`, en este orden: tipo (`message`/`callback_query`, otro → return) → `String(from.id) !== allowedUserId` → return en silencio → `message` de chat no privado → return → `marcarUpdate` false → return → `log("update", { update_id, tipo })` → `message` sin `text` (foto, audio, voz, documento, video, etc.) → `SOLO_TEXTO` → texto que empieza por `/` → `ejecutarComando` → si no `registrarGastos`; `callback_query` → `procesarCallback`.

`registrarGastos`: texto > 1000 caracteres o > 20 líneas no vacías → `MENSAJE_LARGO`. Por cada línea no vacía (`linea` = índice entre las no vacías, desde 0): `parseLinea` → error `ayuda` → `TEXTO_AYUDA`; otro error → ese texto (con prefijo `Línea N: `, N desde 1, si hay más de una línea); ok → `clasificar` (con `buscarAprendido` del repo) → `insertarGasto` (`registrado_utc = ahora().toISOString()`, `texto_original` = la línea) → si `null` saltar → `sendMessage(textoConfirmacion + (fallback ? "\n" + NOTA_FALLBACK : ""), tecladoConfirmacion)` → `evaluarTope(deps, fecha)`.

`textoConfirmacion`: `✅ ${formatCOP(monto)} · ${categoria} · ${concepto}` + (tarjeta ? ` · ${nombreTarjeta(tarjeta)}`) + (fecha ≠ hoy ? ` · ${fechaCorta(fecha)}`).

- [ ] **Step 1: Tests que fallan** — `test/webhook.test.ts` (vía `worker.fetch` con `createExecutionContext`/`waitOnExecutionContext`, `vi.stubGlobal("fetch", …)` para Telegram/Gemini): sin header → 401; header incorrecto → 401; header correcto → 200; body de 70 KB → 413; `GET /webhook` → 404; `POST /otra` → 404. `test/gastos.test.ts` (vía `procesarUpdate` con `crearDepsPrueba`): usuario `999` en `message` y en `callback_query` → cero llamadas a Telegram y cero filas; chat `group` → ignorado; mismo `update_id` dos veces → una fila y una confirmación; foto → `SOLO_TEXTO`; `"35000 almuerzo\nuber 18k tc nu"` → 2 filas, 2 `sendMessage` con `"✅ $35.000 · Comida · almuerzo"` y `"✅ $18.000 · Comida · uber · TC Nu"`; `"35000 almuerzo\nxx\n31/02 5000 taxi"` → 1 fila, respuestas `Línea 2:`+ayuda y `Línea 3: La fecha 31/02 no existe.`; `"ayer 20000 taxi"` → texto termina en ` · 13/10`; con reloj `2026-10-14T03:00:00Z` → `fecha_gasto = "2026-10-13"` y sin ` · 13/10`; `clasificarIA` → null → `fallback`, `Otros` y `NOTA_FALLBACK`; concepto aprendido → `clasificarIA` no llamado; `"35000 a*b_[c]<d>&"` → concepto guardado y confirmado idéntico, ninguna llamada con `parse_mode`; `"35000 tc almuerzo"` → teclado con `TC Nu`, `TC Rappi`, `Corregir`, `✏️ Cambiar categoría`; texto de 1001 caracteres → `MENSAJE_LARGO` y cero filas.
- [ ] **Step 2–4.** **Step 5:** commit `feat: webhook seguro, enrutado y registro de gastos`.

---

### Task 12: Botones de categoría y tarjeta, aprendizaje

**Files:** Create `src/parse/callback.ts`, `test/parse/callback.test.ts`, `test/callbacks.test.ts`; Modify `src/handlers/callbacks.ts`, `src/teclados.ts`

**Interfaces:**
- Produces:
  - `type Callback = { t: "edit"; gastoId: number } | { t: "cancel"; gastoId: number } | { t: "cat"; gastoId: number; indice: number } | { t: "tc"; gastoId: number; indice: number | "x" } | { t: "aj"; pagoId: number; opcion: "int" | "compra" | "favor" }`; `parseCallback(data: string | undefined): Callback | null` — regex estrictas ancladas (`^edit:(\d{1,10})$`, `^cat:(\d{1,10}):(\d{1,2})$`, `^tc:(\d{1,10}):(\d{1,2}|x)$`, `^aj:(\d{1,10}):(int|compra|favor)$`, …), > 64 bytes → null.
  - `tecladoCategorias(gastoId): InlineKeyboard` — 16 botones en filas de 3 (`cat:<id>:<i>`) + fila `Cancelar` (`cancel:<id>`).
  - `procesarCallback(cq: TgCallbackQuery, updateId: number, deps: Deps): Promise<void>`.
  - `aplicarCorreccion(deps: Deps, g: Gasto, categoria: Categoria): Promise<Gasto>` en `src/handlers/callbacks.ts` — actualiza con fuente `manual`; aprende `normalizar(concepto) → categoria` salvo si `reglaFija(concepto) !== null` o `pago_ajuste_id !== null`; luego `evaluarTope`. Reutilizada por `/cambiar`.

Comportamiento: siempre `answerCallbackQuery` exactamente una vez. `parseCallback` null → answer `"Botón no válido"`. Gasto/pago inexistente → answer `"Este gasto ya no existe"` + `editMessageReplyMarkup` sin teclado. `edit` → `editMessageReplyMarkup(tecladoCategorias)`. `cancel` → `editMessageReplyMarkup(tecladoConfirmacion(g))`. `cat` con índice ≥ 16 → `"Botón no válido"`; válido → `aplicarCorreccion` → `editMessageText(textoConfirmacion(nuevo), tecladoConfirmacion(nuevo))`. `tc`: si el gasto no está `sin_definir` → answer `"Este gasto ya tiene medio de pago"` + quitar teclado; índice fuera de `tarjetas` → `"Botón no válido"`; `x` → `tarjeta = null`; si no → alias; editar texto y teclado (`✏️` solo). `aj` → `procesarAjuste` (Tarea 15; en esta tarea, answer `"Botón no válido"`).

- [ ] **Step 1: Tests que fallan:** `parseCallback`: los 5 formatos válidos; `cat:1:2:3`, `cat:-1:2`, `edit:abc`, `cat:1:999`, `aj:1:otro`, `undefined`, cadena de 65 bytes → null. Flujo: registrar `"35000 almuerzo"` → `edit:<id>` → teclado de 7 filas (5 de 3 categorías, 1 con `Apto`, 1 con `Cancelar`) → `cat:<id>:2` → gasto `Transporte/manual`, `aprendizaje["almuerzo"] = Transporte`, mensaje editado `"✅ $35.000 · Transporte · almuerzo"`; luego `"20000 almuerzo"` → `Transporte/aprendida` sin llamar IA. `cancel` → vuelve a `✏️`. `cat` hacia `Apto` → se aprende. Corregir `"regalo Lau"` a Comida → NO aprende. Gasto borrado → `"Este gasto ya no existe"`. `tc:<id>:0` sobre `sin_definir` → `tarjeta "nu"`, texto con `TC Nu`; `tc:<id>:x` → `null`, sin `TC`; repetir `tc` → `"Este gasto ya tiene medio de pago"`.
- [ ] **Step 2–4.** **Step 5:** commit `feat: botones de categoría y tarjeta con aprendizaje`.

---

### Task 13: Comandos básicos

**Files:** Create `src/parse/comando.ts`, tests; Modify `src/handlers/comandos.ts`, `src/mensajes.ts`

**Interfaces:**
- Produces: `parseComando(texto: string): { nombre: string; args: string } | null` — solo si empieza por `/`; `nombre` = primer token sin `/` ni `@…`, `normalizar`; `args` = resto con trim (texto original). `ejecutarComando(msg: TgMessage, updateId: number, deps: Deps): Promise<void>` despacha: `start`, `ayuda` → `TEXTO_AYUDA`; `categorias` → lista de 16 nombres, uno por línea; `cambiar`; `aprendido`; `olvidar`; `deshacer`; `tope`, `saldotc`, `pagotc`, `tarjeta`, `informe`, `exportar` (se conectan en tareas siguientes; hasta entonces caen en "no reconocido"); desconocido → `Comando no reconocido. Escribe /ayuda`.

`TEXTO_AYUDA` (copia exacta):
```
Registra un gasto por línea:
35000 almuerzo
uber 18k tc nu
ayer 20000 taxi
12/10 35.000 almuerzo

Fecha opcional al inicio: hoy, ayer, anteayer, dd/mm o dd/mm/aaaa.
Tarjeta opcional: tc <tarjeta> (ej. tc nu).

Comandos:
/informe semana | semana pasada | mes | mes pasado | <mes> [año]
/exportar [mes pasado | <mes> [año] | todo]
/tope [monto | off]
/pagotc <tarjeta> <monto> [fecha]
/saldotc <tarjeta> <monto>
/tarjeta
/cambiar <categoría>
/deshacer
/categorias
/aprendido
/olvidar <concepto>
```

- `/cambiar <cat>`: `buscarCategoria`; inválida o vacía → `"Categoría no válida. Opciones:\n"` + lista; sin gastos → `"No hay gastos para cambiar."`; si no → `aplicarCorreccion(ultimoGasto)` y responde `"Cambiado: " + textoConfirmacion`.
- `/aprendido`: `"Conceptos aprendidos:\n"` + líneas `"• <concepto> → <categoría>"`; vacío → `"Aún no he aprendido ningún concepto."`.
- `/olvidar <concepto>`: `olvidar(normalizar(args))` → `"Olvidé \"<args>\"."` o `"No tenía aprendido \"<args>\"."`; sin args → `"Uso: /olvidar <concepto>"`.
- `/deshacer` (parte de gastos; pagos y ajustes en Tarea 15): `ultimoMovimiento`; null → `"No hay nada que deshacer."`; gasto sin `pago_ajuste_id` → borrar y `"🗑️ Eliminado: " + textoConfirmacion(g)` sin `✅ ` inicial.

- [ ] **Step 1: Tests que fallan:** `parseComando("/Categorías")` → `categorias`; `("/informe@MiBot mes pasado")` → `{informe, "mes pasado"}`; `("informe mes")` → null. Integración: `"cambiar aceite moto 80k"` (sin `/`) → se registra como gasto `Moto`; `/cambiar transporte` cambia el último gasto y aprende; `/cambiar xyz` → lista; `/aprendido`; `/olvidar almuerzo`; `/deshacer` dos veces sobre dos gastos → borra el más reciente primero; `/deshacer` sin datos; `/foo` → no reconocido.
- [ ] **Step 2–4.** **Step 5:** commit `feat: comandos /ayuda /categorias /cambiar /aprendido /olvidar /deshacer`.

---

### Task 14: Tope mensual y alertas

**Files:** Modify `src/tope.ts`, `src/handlers/comandos.ts`; Test `test/tope.test.ts`

**Interfaces:**
- Produces: `evaluarTope(deps: Deps, fechaGasto: string): Promise<void>`; `comandoTope(args: string, deps: Deps): Promise<void>`.

Reglas: si `mesDe(fechaGasto) !== mesDe(hoyBogota(ahora))` → nada. Tope null → nada. `total = totalEntre(primer día del mes, último día)` (solo tabla `gastos`, nunca pagos ni saldos iniciales). `pct = Math.floor(total*100/tope)`. Si `total >= tope`: `registrarAlerta(100)` → si insertó, enviar `🚨 Superaste tu tope mensual: ${formatCOP(total)} de ${formatCOP(tope)}`; además `registrarAlerta(80)` en silencio. Si no y `total*100 >= tope*80`: `registrarAlerta(80)` → si insertó, `⚠️ Llevas ${formatCOP(total)} de ${formatCOP(tope)} este mes (${pct}%)`.

`/tope`: sin args → `"Tope mensual: $Y\nGastado este mes: $X (P%)"` o `"No tienes tope mensual. Defínelo con /tope 2000000"`; `off` → `borrarTope` + `"Tope desactivado."`; monto → `parseMonto` (error tal cual) → `setTope`, `borrarAlertas(mes actual)`, responder `"Tope mensual: $Y"` y `evaluarTope(deps, hoy)`.

- [ ] **Step 1: Tests que fallan:** tope 100.000; gasto 70.000 → nada; gasto 15.000 → ⚠️ `(85%)`; gasto 1.000 → nada (ya enviada); gasto 20.000 → 🚨 `$106.000 de $100.000`; otro → nada. Gasto directo a 120% → solo 🚨. `/tope 200000` tras 🚨 → reinicia y evalúa: 106.000/200.000 = 53% → nada; `/tope 120000` → ⚠️ inmediato. Gasto `"12/09 500000 x"` → sin alerta. `/tope off` → sin alertas. Pago de tarjeta de 1.000.000 (insertado vía repo) no cuenta en el total. `/tope` muestra porcentaje.
- [ ] **Step 2–4.** **Step 5:** commit `feat: tope mensual con alertas 80% y 100%`.

---

### Task 15: Tarjetas, pagos, ajustes y deshacer pagos

**Files:** Create `src/handlers/tarjetas.ts`, `test/tarjetas.test.ts`; Modify `src/tarjetas.ts` (añadir `calcularSaldo`), `src/handlers/callbacks.ts`, `src/handlers/comandos.ts`, `src/teclados.ts`

**Interfaces:**
- Produces:
  - `calcularSaldo(db, alias): Promise<{ inicial: number; compras: number; pagos: number; saldo: number }>` — compras = gastos con `tarjeta = alias` (incluye ajustes), todo el historial; `sin_definir` nunca cuenta.
  - `comandoSaldoTc(args, deps)`, `comandoPagoTc(args, updateId, deps)`, `comandoTarjeta(deps)`, `procesarAjuste(cq, cb: {pagoId, opcion}, updateId, deps)`, `preguntarAjuste(deps, pago: PagoTarjeta): Promise<void>` (si saldo < 0 envía la pregunta; si no, nada), `tecladoAjuste(pagoId)` = filas `Intereses / cuota de manejo` (`aj:<id>:int`), `Compra no registrada` (`aj:<id>:compra`), `Saldo a favor` (`aj:<id>:favor`).

Textos:
- alias desconocido: `No conozco la tarjeta "x". Tarjetas configuradas: nu, rappi`
- uso: `Uso: /saldotc <tarjeta> <monto>` / `Uso: /pagotc <tarjeta> <monto> [fecha]`
- saldo inicial: `Saldo inicial de TC Nu: $X` (acepta `0`; si no, `parseMonto`).
- pago: `💳 Pago registrado: $X a TC Nu` + (fecha ≠ hoy ? ` · dd/mm`) + `\nSaldo estimado: $S`.
- pregunta: `El pago supera lo registrado en TC Nu por $X. ¿Qué fue esa diferencia?`
- `/tarjeta`: por tarjeta `TC Nu\nSaldo inicial: $…\nCompras: $…\nPagos: $…\nSaldo estimado: $…`, bloques separados por línea en blanco, encabezado `💳 Tarjetas de crédito`, y al final `Gastos con tc sin tarjeta definida: N`.

`/pagotc`: tokens = `[alias, ...monto, fecha?]`; si el último token da `parseFechaToken` ≠ null se usa como fecha (error → responder error); monto = `parseMonto` del resto. `insertarPago` con `telegram_update_id = updateId` (duplicado → nada). Luego `preguntarAjuste`.

`procesarAjuste`: pago inexistente → `"Este pago ya no existe"`; `marcarAjusteResuelto` false → answer `"Este ajuste ya fue resuelto"` + quitar teclado. Recalcular `X = -saldo`; si `X <= 0` → editar `"Ya no hay diferencia por ajustar."`. `int` → gasto `{ monto X, categoria "Financieros", tarjeta alias, fecha_gasto = fecha_pago, concepto "Intereses y cuota de manejo (ajuste)", fuente "ajuste", pago_ajuste_id, telegram_update_id = updateId, linea 0, texto_original = concepto }`; editar mensaje a `"Registrado: " + textoConfirmacion` sin teclado. `compra` → igual con `Otros` y `"Compra no registrada (ajuste)"`; editar el mensaje de la pregunta a `"Registrado como compra no registrada."` sin teclado y enviar una confirmación nueva con `tecladoConfirmacion`. `favor` → editar a `"Queda saldo a favor de $X en TC Nu."`. En `int` y `compra`, `evaluarTope(deps, fecha_pago)`.

`/deshacer` (completar): gasto con `pago_ajuste_id` → borrar gasto, `reabrirAjuste(pago)`, responder `🗑️ Eliminado: …` y `preguntarAjuste(pago)`. Pago → `borrarPago` y `"🗑️ Eliminado: pago de $X a TC Nu (dd/mm)"`.

- [ ] **Step 1: Tests que fallan:** `/saldotc nu 500000` → saldo inicial 500.000; `/saldotc nu 0`; `/saldotc visa 1` → alias desconocido; compra `"100000 x tc nu"` + `/pagotc nu 50000` → saldo 550.000, sin pregunta; `/pagotc nu 1200000 ayer` con saldo 600.000 → `fecha_pago 2026-10-13`, pregunta por `$600.000`; `aj int` → gasto Financieros 600.000 con `tarjeta nu` y `fecha 2026-10-13`, saldo 0; repetir `aj int` → `"Este ajuste ya fue resuelto"` y sigue habiendo un solo gasto de ajuste; `aj compra` → `Otros` + confirmación con `✏️`; `aj favor` → sin gasto, saldo −600.000; `aj int` con tope 500.000 → 🚨. Pagos no suman en `totalEntre`. Gasto `sin_definir` excluido del saldo y contado en `/tarjeta`. `deps.tarjetas = ["nu","rappi","visa"]` → `/tarjeta` muestra `TC Visa` con todo en $0. `/deshacer` tras `aj int` → borra el ajuste, el pago vuelve a `ajuste_resuelto = 0` y se repregunta; segundo `/deshacer` → borra el pago. `/deshacer` de un pago resuelto con `favor` → borra el pago.
- [ ] **Step 2–4.** **Step 5:** commit `feat: tarjetas de crédito, pagos y ajustes`.

---

### Task 16: Periodos y comparación

**Files:** Create `src/periodos.ts`, `test/periodos.test.ts`

**Interfaces:**
- Produces: `interface Periodo { tipo: "semana" | "mes"; desde: string; hasta: string; corte: string; enCurso: boolean; etiqueta: string; clave: string }` (`corte = min(hasta, hoy)`; `clave` = `"2026-10"` para mes, `"2026-10-12"` para semana; `etiqueta` = `"octubre 2026"` o `"semana del 12/10 al 18/10/2026"`).
  `semanaActual(hoy)`, `semanaPasada(hoy)`, `mesActual(hoy)`, `mesPasado(hoy)`, `mesNombrado(nombre: string, anio: number | undefined, hoy): Periodo | null` (nombres en español normalizados, `setiembre` también; sin año → año actual, o anterior si el mes aún no empieza); `parsePeriodo(args: string, hoy): Periodo | null` (`""`/`mes` → actual, `mes pasado`, `semana`, `semana pasada`, `<mes> [año]`); `rangoComparacion(p: Periodo): { desde: string; hasta: string }` — cerrado → periodo anterior completo; en curso → anterior desde su inicio hasta `inicio + (corte − desde)` días, limitado a su último día.

- [ ] **Step 1: Tests que fallan** (hoy `2026-10-14`, miércoles): semana actual `2026-10-12..2026-10-18`, corte `2026-10-14`, en curso; semana pasada `2026-10-05..2026-10-11`, cerrada; comparación de semana en curso `2026-10-05..2026-10-07`; mes actual `2026-10-01..2026-10-31`, comparación `2026-09-01..2026-09-14`; mes pasado `2026-09-01..2026-09-30`, comparación `2026-08-01..2026-08-31`; con hoy `2026-03-31`, comparación del mes en curso `2026-02-01..2026-02-28`; hoy `2027-01-02`: `mesPasado` = `2026-12`, `semanaActual` = `2026-12-28..2027-01-03`; `mesNombrado("diciembre", undefined, "2026-10-14")` → `2025-12`; `parsePeriodo("septiembre 2026")` → `2026-09`; `parsePeriodo("Octubre")` → en curso; `parsePeriodo("xyz")` → null.
- [ ] **Step 2–4.** **Step 5:** commit `feat: periodos en Bogotá y rango de comparación`.

---

### Task 17: Informes a demanda

**Files:** Create `src/informe.ts`, `test/informe.test.ts`; Modify `src/handlers/comandos.ts`

**Interfaces:**
- Produces:
  - `interface Resumen { total: number; cantidad: number; porCategoria: Map<string, number>; porMedio: Map<string, number>; top: Gasto[] }`; `resumir(gastos: Gasto[]): Resumen` (`porMedio` clave `"efectivo"` para `null`, alias o `"sin_definir"`; top 3 por monto desc, empate por fecha).
  - `generarInforme(deps: Deps, p: Periodo): Promise<string>` — carga gastos de `p.desde..p.corte` y de `rangoComparacion(p)`, pagos del periodo, saldos actuales, tope (si mensual) y llama a `formatearInforme`.
  - `formatearInforme(d: { periodo: Periodo; actual: Resumen; anterior: Resumen; comparacion: {desde, hasta}; tope: number | null; tarjetas: { alias: string; compras: number; pagos: number; saldo: number }[] }): string`.
  - `comandoInforme(args, deps)`: `parsePeriodo` null → `"Uso: /informe semana | semana pasada | mes | mes pasado | <mes> [año]"`.

Formato exacto (líneas vacías entre secciones; sección de tope solo si mensual y tope activo; categorías ordenadas por monto desc; categorías solo del anterior al final con `sin gastos`):
```
📊 Informe octubre 2026
01/10/2026 – 14/10/2026 (en curso)

Total: $1.050.000 en 12 gastos
vs. 01/09/2026 – 14/09/2026: ▲ +$120.000 (+13%)
Tope: 53% de $2.000.000

Por categoría:
• Comida: $400.000 (38%) ▲ +$50.000 (+14%)
• Viajes: $200.000 (19%) nueva
• Salud: sin gastos (antes $30.000)

Top 3:
1. $300.000 · Viajes · tiquetes · 05/10
2. …

Por medio de pago:
• Efectivo/débito: $500.000
• TC Nu: $450.000
• TC por definir: $100.000

Tarjetas de crédito (informativo, no suma al total):
• TC Nu: compras $450.000 · pagos $1.200.000 · saldo estimado $250.000
• TC Rappi: compras $0 · pagos $0 · saldo estimado $0
```
Periodo cerrado: segunda línea sin `(en curso)`. Periodo sin gastos: `📊 Informe <etiqueta>\n<fechas>\n\nNo registraste gastos en este periodo.` (y nada más). Porcentaje de categoría = `Math.round`.

- [ ] **Step 1: Tests que fallan:** `formatearInforme` con datos fijos produce exactamente el bloque de arriba (ajustar números del fixture); periodo anterior sin gastos → `vs. …: ▲ +$X` sin `%`; categoría nueva / desaparecida; sin tope → sin línea `Tope`; informe semanal sin línea `Tope` aunque haya tope; pagos nunca aparecen en total ni categorías (integración: gastos + pago → total solo gastos); `/informe mes pasado`, `/informe septiembre 2026`, `/informe xyz` → uso; gasto `fecha 2026-09-30` registrado a las `2026-10-01T03:00:00Z` cuenta en septiembre.
- [ ] **Step 2–4.** **Step 5:** commit `feat: informes con comparativa y sección de tarjetas`.

---

### Task 18: Informe mensual automático (cron)

**Files:** Create `src/scheduled.ts`, `test/scheduled.test.ts`; Modify `src/index.ts`

**Interfaces:**
- Produces: `ejecutarCron(deps: Deps): Promise<void>` — `p = mesPasado(hoy)`; si `marcarInformeEnviado(p.clave)` → `sendMessage(deps.chatId, await generarInforme(deps, p))`; después `limpiarUpdates(ahora − 30 días)`. `index.ts scheduled` → `ctx.waitUntil(ejecutarCron(crearDeps(env)))`.

- [ ] **Step 1: Tests que fallan:** reloj `2026-11-01T13:00:00Z` → envía informe de `octubre 2026` al chat `123456`; segunda ejecución → no envía; mes sin gastos → envía el mensaje "No registraste gastos…"; `updates_procesados` con fila de hace 31 días se borra y la de hace 5 días queda.
- [ ] **Step 2–4.** **Step 5:** commit `feat: informe mensual automático idempotente`.

---

### Task 19: Exportar CSV

**Files:** Create `src/csv.ts`, `test/csv.test.ts`; Modify `src/handlers/comandos.ts`

**Interfaces:**
- Produces: `escaparCampo(s: string): string`; `generarCSV(filas: string[][]): Uint8Array` (BOM `EF BB BF`, separador `;`, fin de línea `\r\n`, primera fila = encabezado); `comandoExportar(args, deps)`.

Reglas: `escaparCampo` primero neutraliza (empieza por `=`, `+`, `-`, `@`, `\t`, `\r` → prefijo `'`), luego si contiene `;`, `"`, `\n` o `\r` → envolver en `"` duplicando `"`. Encabezado `fecha;tipo;monto;categoria;concepto;medio_pago;fuente_clasificacion`. Gasto → `fecha_gasto;gasto;monto;categoria;concepto;medio;fuente`; pago → `fecha_pago;pago_tarjeta;monto;;;tc_<alias>;`. `medio_pago`: `efectivo_debito`, `tc_<alias>`, `tc_sin_definir`. Orden por fecha y luego `registrado_utc`. Periodo: `""` → mes actual, `mes pasado`, `<mes> [año]` (vía `parsePeriodo`, solo meses), `todo` → todo el historial. Nombre `gastos_<clave>.csv` (`gastos_2026-10.csv`, `gastos_todo.csv`). Sin filas → `"No hay movimientos para exportar en <etiqueta>."` (para `todo`: `"No hay movimientos para exportar."`). Argumento inválido → `"Uso: /exportar [mes pasado | <mes> [año] | todo]"`.

- [ ] **Step 1: Tests que fallan:** BOM presente; `escaparCampo("=SUM(A1)")` → `'=SUM(A1)`; `("-5")` → `'-5`; `('dijo "hola"')` → `"dijo ""hola"""`; `("a;b")` → `"a;b"`; `("@x;y")` → `"'@x;y"`; integración `/exportar` con un gasto `tc nu`, uno `sin_definir`, uno efectivo y un pago → `sendDocument` con nombre `gastos_2026-10.csv` y 5 líneas, columnas `tipo`/`medio_pago` correctas; periodo vacío → texto, sin `sendDocument`.
- [ ] **Step 2–4.** **Step 5:** commit `feat: exportación CSV segura para Excel`.

---

### Task 20: Scripts set-webhook y webhook-info

**Files:** Create `scripts/env.mjs`, `scripts/set-webhook.mjs`, `scripts/webhook-info.mjs`, `scripts/env.test.mjs`; Modify `package.json` (`"set-webhook": "node scripts/set-webhook.mjs"`, `"webhook-info": "node scripts/webhook-info.mjs"`)

**Interfaces:**
- Produces (`scripts/env.mjs`): `parseDevVars(contenido: string): Record<string,string>` (líneas `CLAVE=valor`, ignora vacías y `#`, quita comillas); `cargarVariables(nombres: string[], { leerArchivo = () => fs.readFileSync(".dev.vars","utf8") } = {}): Record<string,string>` (process.env gana; archivo ausente = `{}`; falta alguna → lanza `Error("Falta la variable X")` con solo el nombre); `redactar(texto: string, secretos: string[]): string` (reemplaza cada secreto por `***`).

`set-webhook`: requiere `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `WORKER_URL` (debe empezar por `https://`, si no → error). `setWebhook` con `{ url: WORKER_URL sin "/" final + "/webhook", secret_token, allowed_updates: ["message","callback_query"], drop_pending_updates: true }`; `setMyCommands` con los 13 comandos (`start, ayuda, informe, exportar, tope, pagotc, saldotc, tarjeta, cambiar, deshacer, categorias, aprendido, olvidar`) y descripciones cortas en español. `webhook-info`: `getWebhookInfo` y muestra solo `url`, `pending_update_count`, `last_error_date` (ISO), `last_error_message`. En ambos, todo `console.*` pasa por `redactar(…, [token, secreto])`; errores muestran solo método + status + `description`; el `catch` global imprime `redactar(e.message)` y `process.exit(1)`.

- [ ] **Step 1: Tests que fallan** (`node:test`): `parseDevVars('A=1\n# c\nB="x y"\n')` → `{A:"1",B:"x y"}`; `cargarVariables` prefiere `process.env`; falta variable → mensaje contiene el nombre y no valores; `redactar("bottest-bot-token/x", ["test-bot-token"])` → `"bot***/x"`.
- [ ] **Step 2:** `node --test scripts/` → FAIL. **Step 3:** implementar. **Step 4:** `npm test` → PASS (vitest + node). **Step 5:** commit `feat: scripts set-webhook y webhook-info sin exponer el token`.

---

### Task 21: CI/CD, Dependabot y README

**Files:** Create `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.github/dependabot.yml`, `README.md`

- [ ] **Step 1:** `ci.yml`: `on: pull_request` y `push` con `branches-ignore: [main]`; `permissions: contents: read`; `ubuntu-latest`; `actions/checkout` + `actions/setup-node` (`node-version-file: .nvmrc`, `cache: npm`) fijados a SHA; `npm ci`, `npm run typecheck`, `npm test`. Sin secretos ni environment.
- [ ] **Step 2:** `deploy.yml`: `on: push: branches: [main]` + `workflow_dispatch`; `permissions: contents: read`; `concurrency: { group: deploy-production, cancel-in-progress: false }`; job `test` igual que ci; job `deploy` (`needs: test`, `environment: production`, `ubuntu-latest`): checkout, setup-node, `npm ci`, `cloudflare/wrangler-action` (SHA) con `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}`, `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`, `command: d1 migrations apply bot-gastos-db --remote`; segundo paso igual con `command: deploy`. Nada de `pull_request_target`, `env`, `printenv`, `set -x`.
- [ ] **Step 3:** `dependabot.yml`: `version: 2`, ecosistemas `github-actions` (`/`) y `npm` (`/`), `schedule.interval: weekly`.
- [ ] **Step 4:** Validar: `npx --yes @action-validator/cli .github/workflows/*.yml` (o `actionlint` si está instalado) sin errores; `grep -rnE "uses: [^@]+@v[0-9]" .github` → sin resultados (todo fijado a SHA).
- [ ] **Step 5:** `README.md`: descripción, arquitectura (Worker fetch/scheduled, D1, Telegram, Gemini; diagrama de texto), uso (formato de gastos y comandos), instalación de gitleaks (macOS `brew install gitleaks`; Windows `winget install gitleaks` o `scoop install gitleaks`; Linux binario de releases o `go install github.com/zricethezav/gitleaks/v8@latest`), configuración paso a paso con placeholders (`npm ci`, `npx wrangler login`, `npx wrangler d1 create bot-gastos-db`, copiar `.dev.vars.example` a `.dev.vars`, `npx wrangler secret put <NOMBRE>` para los 4 secretos, Environment `production` con `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, primer deploy, `WORKER_URL`, `npm run set-webhook`, desactivar `/setjoingroups`), lista de secretos (solo nombres), licencia MIT. Sin capturas.
- [ ] **Step 6:** `npm test && npm run typecheck` → PASS. Commit `ci: workflows de CI/CD, dependabot y README`.

---

### Task 22: Verificación final

- [ ] **Step 1:** `npm ci && npm run typecheck && npm test` → todo PASS (mostrar resumen de conteos).
- [ ] **Step 2:** `gitleaks git --redact --no-banner` sobre todo el historial → `no leaks found`.
- [ ] **Step 3:** `grep -rnE "test-bot-token|123456" src/` → sin resultados (los valores de prueba solo viven en `test/` y `vitest.config.ts`). `grep -rn "parse_mode" src/` → sin resultados. `grep -rn "account_id" wrangler.jsonc` → sin resultados.
- [ ] **Step 4:** `npx wrangler deploy --dry-run` → compila sin errores.
- [ ] **Step 5:** Recorrer SPEC.md y el diseño sección por sección marcando dónde se implementó cada requisito; reportar cualquier hueco al usuario.
- [ ] **Step 6:** Preguntar al usuario antes de `git push -u origin feat/v1` y de abrir el PR (sin firma de Claude). Recordarle los pasos manuales pendientes del diseño (secretos en Cloudflare, Environment `production`, primer deploy, `WORKER_URL`, `set-webhook`, `/setjoingroups`).
