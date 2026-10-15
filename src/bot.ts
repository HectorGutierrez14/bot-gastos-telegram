import { marcarUpdate } from "./db/control";
import type { Deps } from "./deps";
import { procesarCallback } from "./handlers/callbacks";
import { ejecutarComando } from "./handlers/comandos";
import { registrarGastos } from "./handlers/gastos";
import { log } from "./log";
import { ERROR_GENERICO, SOLO_TEXTO } from "./mensajes";
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

  try {
    await enrutar(update, deps);
  } catch (e) {
    log("error_proceso", { update_id: update.update_id, error: e instanceof Error ? e.name : "desconocido" });
    if (callback_query) await deps.tg.answerCallbackQuery(callback_query.id).catch(() => false);
    await deps.tg.sendMessage(deps.chatId, ERROR_GENERICO).catch(() => null);
  }
}

async function enrutar(update: TgUpdate, deps: Deps): Promise<void> {
  const { message, callback_query } = update;
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
