import { CATEGORIAS } from "./categorias";
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

/** Todas las categorías en filas de 3 (cat:<id>:<índice>) más Cancelar. */
export function tecladoCategorias(gastoId: number): InlineKeyboard {
  const filas: InlineKeyboard["inline_keyboard"] = [];
  CATEGORIAS.forEach((cat, i) => {
    if (i % 3 === 0) filas.push([]);
    filas[filas.length - 1].push(boton(cat, `cat:${gastoId}:${i}`));
  });
  filas.push([boton("Cancelar", `cancel:${gastoId}`)]);
  return { inline_keyboard: filas };
}
