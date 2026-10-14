import { type Categoria, CATEGORIAS, reglaFija } from "../categorias";
import { aprender } from "../db/aprendizaje";
import { actualizarCategoria, actualizarTarjeta, obtenerGasto } from "../db/gastos";
import type { Deps } from "../deps";
import { textoConfirmacion } from "../mensajes";
import { parseCallback } from "../parse/callback";
import { tecladoCategorias, tecladoConfirmacion } from "../teclados";
import type { TgCallbackQuery } from "../telegram";
import type { Gasto } from "../tipos";
import { evaluarTope } from "../tope";
import { hoyBogota } from "../util/fechas";
import { normalizar } from "../util/texto";

export const BOTON_INVALIDO = "Botón no válido";
export const GASTO_NO_EXISTE = "Este gasto ya no existe";

/**
 * Corrección manual de categoría (botón o /cambiar): actualiza, aprende el concepto
 * (salvo regla fija o gasto de ajuste) y reevalúa el tope.
 */
export async function aplicarCorreccion(deps: Deps, g: Gasto, categoria: Categoria): Promise<Gasto> {
  await actualizarCategoria(deps.db, g.id, categoria, "manual");
  if (reglaFija(g.concepto) === null && g.pago_ajuste_id === null) {
    await aprender(deps.db, normalizar(g.concepto), categoria, deps.ahora().toISOString());
  }
  await evaluarTope(deps, g.fecha_gasto);
  return { ...g, categoria, fuente_clasificacion: "manual" };
}

export async function procesarCallback(cq: TgCallbackQuery, updateId: number, deps: Deps): Promise<void> {
  const cb = parseCallback(cq.data);
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  if (!cb || chatId === undefined || messageId === undefined) {
    await deps.tg.answerCallbackQuery(cq.id, BOTON_INVALIDO);
    return;
  }

  if (cb.t === "aj") {
    // Se conecta con el flujo de ajustes de tarjetas.
    await deps.tg.answerCallbackQuery(cq.id, BOTON_INVALIDO);
    return;
  }

  const g = await obtenerGasto(deps.db, cb.gastoId);
  if (!g) {
    await deps.tg.answerCallbackQuery(cq.id, GASTO_NO_EXISTE);
    await deps.tg.editMessageReplyMarkup(chatId, messageId);
    return;
  }
  const hoy = hoyBogota(deps.ahora());

  switch (cb.t) {
    case "edit":
      await deps.tg.answerCallbackQuery(cq.id);
      await deps.tg.editMessageReplyMarkup(chatId, messageId, tecladoCategorias(g.id));
      return;
    case "cancel":
      await deps.tg.answerCallbackQuery(cq.id);
      await deps.tg.editMessageReplyMarkup(chatId, messageId, tecladoConfirmacion(g, deps.tarjetas));
      return;
    case "cat": {
      const categoria = CATEGORIAS[cb.indice];
      if (!categoria) {
        await deps.tg.answerCallbackQuery(cq.id, BOTON_INVALIDO);
        return;
      }
      await deps.tg.answerCallbackQuery(cq.id);
      const nuevo = await aplicarCorreccion(deps, g, categoria);
      await deps.tg.editMessageText(chatId, messageId, textoConfirmacion(nuevo, hoy), tecladoConfirmacion(nuevo, deps.tarjetas));
      return;
    }
    case "tc": {
      if (g.tarjeta !== "sin_definir") {
        await deps.tg.answerCallbackQuery(cq.id, "Este gasto ya tiene medio de pago");
        await deps.tg.editMessageReplyMarkup(chatId, messageId, tecladoConfirmacion(g, deps.tarjetas));
        return;
      }
      const tarjeta = cb.indice === "x" ? null : deps.tarjetas[cb.indice];
      if (tarjeta === undefined) {
        await deps.tg.answerCallbackQuery(cq.id, BOTON_INVALIDO);
        return;
      }
      await deps.tg.answerCallbackQuery(cq.id);
      await actualizarTarjeta(deps.db, g.id, tarjeta);
      const nuevo = { ...g, tarjeta };
      await deps.tg.editMessageText(chatId, messageId, textoConfirmacion(nuevo, hoy), tecladoConfirmacion(nuevo, deps.tarjetas));
      return;
    }
  }
}
