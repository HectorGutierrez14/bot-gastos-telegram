import type { Deps } from "../deps";
import { COMANDO_DESCONOCIDO } from "../mensajes";
import type { TgMessage } from "../telegram";

export async function ejecutarComando(msg: TgMessage, _updateId: number, deps: Deps): Promise<void> {
  await deps.tg.sendMessage(msg.chat.id, COMANDO_DESCONOCIDO);
}
