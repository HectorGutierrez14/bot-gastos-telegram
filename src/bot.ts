import { marcarUpdate } from "./db/control";
import type { Deps } from "./deps";
import { procesarCallback } from "./handlers/callbacks";
import { ejecutarComando } from "./handlers/comandos";
import { registrarGastos } from "./handlers/gastos";
import { log } from "./log";
import { SOLO_TEXTO } from "./mensajes";
import type { TgUpdate } from "./telegram";

/** Filtra, deduplica y enruta un update de Telegram. */
export async function procesarUpdate(update: TgUpdate, deps: Deps, allowedUserId: string): Promise<void> {
  const { message, callback_query } = update;
  if (!message && !callback_query) return;

  const from = message ? message.from : callback_query?.from;
  if (!from || String(from.id) !== allowedUserId) return;
  if (message && message.chat.type !== "private") return;

  if (!(await marcarUpdate(deps.db, update.update_id, deps.ahora().toISOString()))) return;
  log("update", { update_id: update.update_id, tipo: message ? "message" : "callback_query" });

  if (callback_query) {
    await procesarCallback(callback_query, update.update_id, deps);
    return;
  }
  if (!message) return;

  if (typeof message.text !== "string") {
    await deps.tg.sendMessage(message.chat.id, SOLO_TEXTO);
    return;
  }
  if (message.text.trimStart().startsWith("/")) {
    await ejecutarComando(message, update.update_id, deps);
    return;
  }
  await registrarGastos(message, update.update_id, deps);
}
