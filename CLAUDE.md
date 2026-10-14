# Bot de gastos por Telegram

Especificación: [SPEC.md](SPEC.md). Decisiones que la precisan o cambian: [docs/superpowers/specs/2026-10-14-bot-gastos-design.md](docs/superpowers/specs/2026-10-14-bot-gastos-design.md) (manda sobre SPEC.md donde difieran).

## Reglas de seguridad (el repositorio es PÚBLICO)

- Nunca leer, editar, crear ni mostrar `.dev.vars` ni archivos `.env*`. Si hace falta que existan, pedírselo al usuario. Solo se versiona `.dev.vars.example` con placeholders.
- Nunca pedir al usuario que pegue tokens, llaves ni su ID de Telegram en el chat. Los secretos los carga el usuario con `npx wrangler secret put`.
- Nunca escribir valores reales de secretos en código, pruebas, documentación ni commits. En pruebas usar valores falsos evidentes (`test-bot-token`, `123456`).
- Antes de cada commit, mostrar `git status` y la lista de archivos (`git diff --cached --name-only`).
- Nunca hacer `git push` sin confirmación explícita del usuario.
- Sin líneas `Co-Authored-By: Claude …` en commits ni firma "Generated with Claude Code" en PRs.
- El hook `.githooks/pre-commit` ejecuta gitleaks; no saltarlo (`--no-verify` prohibido).

## Comandos

- `npm test`: Vitest (pool de Workers) + `node --test scripts/`
- `npm run typecheck`: `tsc --noEmit`
- `npx wrangler …`: wrangler está instalado como devDependency (no global)
- `npm run set-webhook` / `npm run webhook-info`: configuración del webhook (leen `.dev.vars`; Claude no los ejecuta)
