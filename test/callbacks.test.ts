import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { procesarUpdate } from "../src/bot";
import { buscarAprendido } from "../src/db/aprendizaje";
import { borrarGasto, obtenerGasto } from "../src/db/gastos";
import type { InlineKeyboard } from "../src/telegram";
import type { Gasto } from "../src/tipos";
import { callback, crearDepsPrueba, type DepsPrueba, limpiarDB, mensaje } from "./helpers";

let deps: DepsPrueba;
beforeEach(async () => {
  await limpiarDB(env.DB);
  deps = crearDepsPrueba();
});

const procesar = (u: Parameters<typeof procesarUpdate>[0]) => procesarUpdate(u, deps, "123456");

async function registrar(texto: string): Promise<Gasto> {
  await procesar(mensaje(texto));
  const g = await env.DB.prepare("SELECT * FROM gastos ORDER BY id DESC LIMIT 1").first<Gasto>();
  deps.tg.limpiar();
  return g!;
}

const respuestas = () => deps.tg.de("answerCallbackQuery").map((l) => l.args[1]);
const SOLO_EDITAR = (id: number): InlineKeyboard => ({
  inline_keyboard: [[{ text: "✏️ Cambiar categoría", callback_data: `edit:${id}` }]],
});

describe("botones de categoría", () => {
  it("editar muestra las 16 categorías en filas de 3 más Cancelar", async () => {
    const g = await registrar("35000 almuerzo");
    await procesar(callback(`edit:${g.id}`, { messageId: 1000 }));
    const [, messageId, teclado] = deps.tg.de("editMessageReplyMarkup")[0].args as [number, number, InlineKeyboard];
    expect(messageId).toBe(1000);
    expect(teclado.inline_keyboard.length).toBe(7);
    expect(teclado.inline_keyboard[0].map((b) => b.text)).toEqual(["Comida", "Mercado", "Transporte"]);
    expect(teclado.inline_keyboard[5]).toEqual([{ text: "Apto", callback_data: `cat:${g.id}:15` }]);
    expect(teclado.inline_keyboard[6]).toEqual([{ text: "Cancelar", callback_data: `cancel:${g.id}` }]);
    expect(respuestas()).toEqual([undefined]);
  });

  it("elegir una categoría actualiza, aprende y edita el mensaje", async () => {
    const g = await registrar("35000 almuerzo");
    await procesar(callback(`cat:${g.id}:2`));
    expect(await obtenerGasto(env.DB, g.id)).toMatchObject({ categoria: "Transporte", fuente_clasificacion: "manual" });
    expect(await buscarAprendido(env.DB, "almuerzo")).toBe("Transporte");
    expect(deps.tg.de("editMessageText")[0].args.slice(2)).toEqual(["✅ $35.000 · Transporte · almuerzo", SOLO_EDITAR(g.id)]);
    expect(respuestas().length).toBe(1);

    deps.clasificarIA.mockClear();
    const g2 = await registrar("20000 almuerzo");
    expect(g2).toMatchObject({ categoria: "Transporte", fuente_clasificacion: "aprendida" });
    expect(deps.clasificarIA).not.toHaveBeenCalled();
  });

  it("corregir hacia Apto también se aprende", async () => {
    const g = await registrar("500000 administración");
    await procesar(callback(`cat:${g.id}:15`));
    expect(await buscarAprendido(env.DB, "administracion")).toBe("Apto");
  });

  it("no aprende conceptos que vienen de la regla fija", async () => {
    const g = await registrar("80000 regalo Lau");
    await procesar(callback(`cat:${g.id}:0`));
    expect((await obtenerGasto(env.DB, g.id))?.categoria).toBe("Comida");
    expect(await buscarAprendido(env.DB, "regalo lau")).toBeNull();
  });

  it("cancelar vuelve al botón de cambiar categoría", async () => {
    const g = await registrar("35000 almuerzo");
    await procesar(callback(`cancel:${g.id}`));
    expect(deps.tg.de("editMessageReplyMarkup")[0].args[2]).toEqual(SOLO_EDITAR(g.id));
  });

  it("un gasto inexistente responde y quita los botones", async () => {
    const g = await registrar("35000 almuerzo");
    await borrarGasto(env.DB, g.id);
    await procesar(callback(`cat:${g.id}:2`));
    expect(respuestas()).toEqual(["Este gasto ya no existe"]);
    expect(deps.tg.de("editMessageReplyMarkup")[0].args[2]).toBeUndefined();
  });

  it("callback_data inválido o índice fuera de rango → Botón no válido", async () => {
    const g = await registrar("35000 almuerzo");
    await procesar(callback("cat:1:2:3"));
    await procesar(callback(`cat:${g.id}:16`));
    expect(respuestas()).toEqual(["Botón no válido", "Botón no válido"]);
    expect((await obtenerGasto(env.DB, g.id))?.categoria).toBe("Comida");
  });
});

describe("botones de tarjeta", () => {
  it("elegir tarjeta asigna el alias y deja solo Cambiar categoría", async () => {
    const g = await registrar("35000 almuerzo tc");
    await procesar(callback(`tc:${g.id}:0`));
    expect((await obtenerGasto(env.DB, g.id))?.tarjeta).toBe("nu");
    expect(deps.tg.de("editMessageText")[0].args.slice(2)).toEqual(["✅ $35.000 · Comida · almuerzo · TC Nu", SOLO_EDITAR(g.id)]);
  });

  it("Corregir lo pasa a efectivo/débito", async () => {
    const g = await registrar("35000 almuerzo tc");
    await procesar(callback(`tc:${g.id}:x`));
    expect((await obtenerGasto(env.DB, g.id))?.tarjeta).toBeNull();
    expect(deps.tg.de("editMessageText")[0].args[2]).toBe("✅ $35.000 · Comida · almuerzo");
  });

  it("un segundo toque no cambia nada", async () => {
    const g = await registrar("35000 almuerzo tc");
    await procesar(callback(`tc:${g.id}:0`));
    await procesar(callback(`tc:${g.id}:1`));
    expect((await obtenerGasto(env.DB, g.id))?.tarjeta).toBe("nu");
    expect(respuestas()).toEqual([undefined, "Este gasto ya tiene medio de pago"]);
  });

  it("índice de tarjeta fuera de rango → Botón no válido", async () => {
    const g = await registrar("35000 almuerzo tc");
    await procesar(callback(`tc:${g.id}:5`));
    expect(respuestas()).toEqual(["Botón no válido"]);
    expect((await obtenerGasto(env.DB, g.id))?.tarjeta).toBe("sin_definir");
  });

  it("al cambiar de categoría un gasto sin tarjeta definida conserva sus botones de tarjeta", async () => {
    const g = await registrar("35000 almuerzo tc");
    await procesar(callback(`cat:${g.id}:1`));
    const teclado = deps.tg.de("editMessageText")[0].args[3] as InlineKeyboard;
    expect(teclado.inline_keyboard[0].map((b) => b.text)).toEqual(["TC Nu", "TC Rappi", "Corregir"]);
  });
});
