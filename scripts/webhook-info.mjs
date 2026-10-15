// Muestra el estado del webhook sin exponer el token. Uso: npm run webhook-info
import { cargarVariables, llamarTelegram, redactar } from "./env.mjs";

let secretos = [];
try {
  const { TELEGRAM_BOT_TOKEN } = cargarVariables(["TELEGRAM_BOT_TOKEN"]);
  secretos = [TELEGRAM_BOT_TOKEN];
  const info = await llamarTelegram(TELEGRAM_BOT_TOKEN, "getWebhookInfo");
  const resumen = {
    url: info.url,
    pending_update_count: info.pending_update_count,
    last_error_date: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
    last_error_message: info.last_error_message ?? null,
  };
  console.log(redactar(JSON.stringify(resumen, null, 2), secretos));
} catch (e) {
  console.error(redactar(`Error: ${e?.message ?? e}`, secretos));
  process.exit(1);
}
