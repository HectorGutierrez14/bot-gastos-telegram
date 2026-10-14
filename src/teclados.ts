import { nombreTarjeta } from "./tarjetas";
import type { InlineKeyboard } from "./telegram";
import type { Gasto } from "./tipos";

const boton = (text: string, callback_data: string) => ({ text, callback_data });

/** Teclado de la confirmación: botones de tarjeta si está sin definir, y siempre "Cambiar categoría". */
export function tecladoConfirmacion(g: Pick<Gasto, "id" | "tarjeta">, tarjetas: string[]): InlineKeyboard {
  const filas: InlineKeyboard["inline_keyboard"] = [];
  if (g.tarjeta === "sin_definir") {
    filas.push([
      ...tarjetas.map((alias, i) => boton(nombreTarjeta(alias), `tc:${g.id}:${i}`)),
      boton("Corregir", `tc:${g.id}:x`),
    ]);
  }
  filas.push([boton("✏️ Cambiar categoría", `edit:${g.id}`)]);
  return { inline_keyboard: filas };
}
