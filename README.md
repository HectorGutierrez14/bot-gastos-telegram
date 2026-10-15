# Bot de gastos por Telegram

Bot personal (un solo usuario) para registrar gastos diarios escribiéndole por Telegram. Clasifica cada gasto por categoría, aprende de tus correcciones, genera informes semanales y mensuales con comparativa, avisa cuando te acercas a un tope mensual, exporta a CSV y lleva el saldo de tus tarjetas de crédito sin contar dos veces (el pago de la tarjeta nunca es un gasto).

Corre gratis en Cloudflare Workers + D1, con Gemini (capa gratuita) para clasificar.

## Arquitectura

```
Telegram ──webhook──▶ Worker (fetch)  ──▶ D1 (gastos, pagos, aprendizaje, …)
                         │    └─────────▶ Gemini (solo el concepto del gasto)
Cron día 1 ─────────▶ Worker (scheduled) ──▶ informe del mes cerrado
```

- `src/index.ts`: handler `fetch` (valida el secreto del webhook, limita el tamaño, responde 200 y procesa en `waitUntil`) y `scheduled` (informe mensual).
- `src/bot.ts`: filtra el update (lista blanca, chats privados, idempotencia) y lo enruta a comandos, gastos o botones.
- `src/parse/`: lectores deterministas de monto, fecha, línea de gasto, comandos y botones.
- `src/clasificar.ts`: regla fija (Lau, Moto, Apto) → conceptos aprendidos → Gemini → Otros.
- `src/informe.ts`, `src/periodos.ts`, `src/csv.ts`, `src/tope.ts`, `src/handlers/tarjetas.ts`: informes, rangos en America/Bogota, exportación, tope y tarjetas.
- `migrations/`: esquema de D1.

## Uso

Un gasto por línea, con el monto y el concepto en cualquier orden:

```
35000 almuerzo
uber 18k tc nu
ayer 20000 taxi
12/10 35.000 almuerzo
gasolina moto 20 mil
```

- Fecha opcional al inicio: `hoy`, `ayer`, `anteayer`, `dd/mm` o `dd/mm/aaaa`.
- Tarjeta opcional: `tc <alias>` (ej. `tc nu`). Con `tc` solo, el bot pregunta cuál fue.
- Cada gasto se confirma con un botón para cambiar la categoría; el bot aprende de esas correcciones.

Comandos (siempre con `/`): `/informe`, `/exportar`, `/tope`, `/pagotc`, `/saldotc`, `/tarjeta`, `/cambiar`, `/deshacer`, `/categorias`, `/aprendido`, `/olvidar`, `/ayuda`. Escribe `/ayuda` para ver el formato completo.

## Instalar gitleaks (obligatorio para commitear)

El repositorio es público. Un hook de pre-commit (`.githooks/pre-commit`) ejecuta [gitleaks](https://github.com/gitleaks/gitleaks) y bloquea el commit si detecta secretos. `npm ci` activa el hook automáticamente (`git config core.hooksPath .githooks`).

- **macOS:** `brew install gitleaks`
- **Windows:** `winget install gitleaks` o `scoop install gitleaks`
- **Linux:** descarga el binario de [releases](https://github.com/gitleaks/gitleaks/releases) o `go install github.com/zricethezav/gitleaks/v8@latest`

Además, el workflow `gitleaks` revisa cada push y pull request en GitHub.

## Configuración paso a paso

Todos los valores de abajo son placeholders: nunca pegues secretos reales en el código, en issues ni en commits.

1. Instala dependencias: `npm ci` (requiere Node 24+).
2. Inicia sesión en Cloudflare: `npx wrangler login`.
3. Crea la base de datos: `npx wrangler d1 create bot-gastos-db` y copia el `database_id` en `wrangler.jsonc` (no es un secreto).
4. Crea el bot con [@BotFather](https://t.me/BotFather) y desactiva `/setjoingroups`.
5. Copia `.dev.vars.example` a `.dev.vars` y reemplaza los placeholders (este archivo está en `.gitignore`).
6. Carga los secretos en Cloudflare, uno por uno (wrangler los pide de forma interactiva):
   ```sh
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put ALLOWED_TELEGRAM_USER_ID
   ```
7. En GitHub, crea el Environment `production` (Settings → Environments), restringe los despliegues a la rama `main` y agrega dos secretos:
   - `CLOUDFLARE_API_TOKEN`: token con permisos Workers Scripts: Edit y D1: Edit.
   - `CLOUDFLARE_ACCOUNT_ID`.

   > ⚠️ **La restricción a `main` es obligatoria antes del primer despliegue.** El workflow `deploy` también se puede lanzar a mano (`workflow_dispatch`) desde cualquier rama; la regla del Environment es lo que impide que una rama distinta de `main` use los secretos de Cloudflare y despliegue a producción.
8. Haz merge a `main`: el workflow `deploy` corre las pruebas, aplica las migraciones y despliega.
9. Agrega `WORKER_URL=https://bot-gastos-telegram.<tu-subdominio>.workers.dev` a `.dev.vars` y ejecuta `npm run set-webhook`. Para revisar el estado: `npm run webhook-info`.

### Secretos requeridos

| Dónde | Nombre |
|---|---|
| Cloudflare (Worker) | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `ALLOWED_TELEGRAM_USER_ID` |
| GitHub (Environment `production`) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Local (`.dev.vars`, solo para los scripts) | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `WORKER_URL` |

Variables no secretas en `wrangler.jsonc`: `GEMINI_MODEL` y `TARJETAS_CREDITO` (alias separados por comas, ej. `nu,rappi`).

## Desarrollo

- `npm test`: pruebas (Vitest dentro del runtime de Workers + `node --test` para los scripts). Telegram y Gemini siempre van simulados, y las pruebas nunca leen `.dev.vars`.
- `npm run typecheck`: TypeScript estricto.

## Licencia

[MIT](LICENSE)
