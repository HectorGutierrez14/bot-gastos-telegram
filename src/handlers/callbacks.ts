import type { Deps } from "../deps";
import type { TgCallbackQuery } from "../telegram";

export async function procesarCallback(cq: TgCallbackQuery, _updateId: number, deps: Deps): Promise<void> {
  await deps.tg.answerCallbackQuery(cq.id, "Botón no válido");
}
