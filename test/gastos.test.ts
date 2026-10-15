import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { procesarUpdate } from "../src/bot";
import { aprender } from "../src/db/aprendizaje";
import { MENSAJE_LARGO, NOTA_FALLBACK, SOLO_TEXTO, TEXTO_AYUDA } from "../src/mensajes";
import type { Gasto } from "../src/tipos";
import { callback, crearDepsPrueba, type DepsPrueba, limpiarDB, mensaje, reloj } from "./helpers";

let deps: DepsPrueba;
beforeEach(async () => {
  await limpiarDB(env.DB);
  deps = crearDepsPrueba();
});

const procesar = (u: Parameters<typeof procesarUpdate>[0]) => procesarUpdate(u, deps, "123456");
const gastos = async () => (await env.DB.prepare("SELECT * FROM gastos ORDER BY id").all<Gasto>()).results;

describe("filtros del update", () => {
  it("ignora en silencio a usuarios no autorizados (mensaje y callback)", async () => {
    await procesar(mensaje("35000 almuerzo", { from: 999 }));
    await procesar(callback("edit:1", { from: 999 }));
    expect(deps.tg.llamadas).toEqual([]);
    expect(await gastos()).toEqual([]);
  });

  it("ignora chats de grupo", async () => {
    await procesar(mensaje("35000 almuerzo", { chatType: "group" }));
    expect(deps.tg.llamadas).toEqual([]);
    expect(await gastos()).toEqual([]);
  });

  it("ignora tipos de update no soportados", async () => {
    await procesar({ update_id: 77, edited_message: {} });
    expect(deps.tg.llamadas).toEqual([]);
  });

  it("procesa un update duplicado una sola vez", async () => {
    const u = mensaje("35000 almuerzo");
    await procesar(u);
    await procesar(u);
    expect((await gastos()).length).toBe(1);
    expect(deps.tg.textos().length).toBe(1);
  });

  it("responde que solo entiende texto a fotos, audios y documentos", async () => {
    await procesar(mensaje(undefined, { extra: { photo: [{}] } }));
    await procesar(mensaje(undefined, { extra: { voice: {} } }));
    expect(deps.tg.textos()).toEqual([SOLO_TEXTO, SOLO_TEXTO]);
  });
});

describe("registro de gastos", () => {
  it("un mensaje con varias líneas genera una confirmación por gasto", async () => {
    await procesar(mensaje("35000 almuerzo\nuber 18k tc nu"));
    expect((await gastos()).length).toBe(2);
    expect(deps.tg.textos()).toEqual(["✅ $35.000 · Comida · almuerzo", "✅ $18.000 · Comida · uber · TC Nu"]);
    expect(deps.tg.ultimoTeclado()).toEqual({ inline_keyboard: [[{ text: "✏️ Cambiar categoría", callback_data: `edit:${(await gastos())[1].id}` }]] });
  });

  it("guarda todos los campos", async () => {
    const u = mensaje("ayer 20000 Taxi aeropuerto");
    await procesar(u);
    expect((await gastos())[0]).toMatchObject({
      telegram_update_id: u.update_id,
      linea: 0,
      fecha_gasto: "2026-10-13",
      registrado_utc: "2026-10-14T15:00:02.000Z",
      monto: 20000,
      concepto: "Taxi aeropuerto",
      categoria: "Comida",
      tarjeta: null,
      pago_ajuste_id: null,
      fuente_clasificacion: "ia",
      texto_original: "ayer 20000 Taxi aeropuerto",
    });
    expect(deps.tg.textos()).toEqual(["✅ $20.000 · Comida · Taxi aeropuerto · 13/10"]);
  });

  it("las líneas válidas se registran aunque otras fallen", async () => {
    await procesar(mensaje("35000 almuerzo\nxx\n\n31/02 5000 taxi"));
    expect((await gastos()).length).toBe(1);
    expect(deps.tg.textos()).toEqual([
      "✅ $35.000 · Comida · almuerzo",
      `Línea 2: ${TEXTO_AYUDA}`,
      "Línea 3: La fecha 31/02 no existe.",
    ]);
  });

  it("una sola línea inválida responde la ayuda sin prefijo", async () => {
    await procesar(mensaje("almuerzo"));
    expect(deps.tg.textos()).toEqual([TEXTO_AYUDA]);
  });

  it("usa la fecha de Bogotá cerca de la medianoche UTC", async () => {
    deps = crearDepsPrueba({ ahora: reloj("2026-10-14T03:00:00.000Z") });
    await procesar(mensaje("35000 cena"));
    expect((await gastos())[0].fecha_gasto).toBe("2026-10-13");
    expect(deps.tg.textos()).toEqual(["✅ $35.000 · Comida · cena"]);
  });

  it("si Gemini falla queda en Otros y lo indica", async () => {
    deps.clasificarIA.mockResolvedValue(null);
    await procesar(mensaje("35000 cosa rara"));
    expect((await gastos())[0]).toMatchObject({ categoria: "Otros", fuente_clasificacion: "fallback" });
    expect(deps.tg.textos()).toEqual([`✅ $35.000 · Otros · cosa rara\n${NOTA_FALLBACK}`]);
  });

  it("un concepto aprendido no llama a Gemini", async () => {
    await aprender(env.DB, "almuerzo", "Transporte", "2026-10-01T00:00:00.000Z");
    await procesar(mensaje("35000 Almuerzo"));
    expect(deps.clasificarIA).not.toHaveBeenCalled();
    expect((await gastos())[0]).toMatchObject({ categoria: "Transporte", fuente_clasificacion: "aprendida" });
  });

  it("la regla Lau/Moto/Apto no llama a Gemini", async () => {
    await procesar(mensaje("80k regalo Lau\n1.200.000 arriendo apto"));
    expect(deps.clasificarIA).not.toHaveBeenCalled();
    expect((await gastos()).map((g) => g.categoria)).toEqual(["Lau", "Apto"]);
  });

  it("envía a Gemini solo el concepto", async () => {
    await procesar(mensaje("ayer 35000 almuerzo tc nu"));
    expect(deps.clasificarIA).toHaveBeenCalledWith("almuerzo");
  });

  it("guarda y confirma caracteres especiales tal cual, sin parse_mode", async () => {
    await procesar(mensaje('35000 a*b_[c]<d>&"e" 🍕'));
    expect((await gastos())[0].concepto).toBe('a*b_[c]<d>&"e" 🍕');
    expect(deps.tg.textos()).toEqual(['✅ $35.000 · Comida · a*b_[c]<d>&"e" 🍕']);
  });

  it("tc sin tarjeta conocida muestra botones de tarjeta, Corregir y Cambiar categoría", async () => {
    await procesar(mensaje("35000 tc almuerzo"));
    const id = (await gastos())[0].id;
    expect((await gastos())[0].tarjeta).toBe("sin_definir");
    expect(deps.tg.textos()).toEqual(["✅ $35.000 · Comida · almuerzo · TC por definir"]);
    expect(deps.tg.ultimoTeclado()).toEqual({
      inline_keyboard: [
        [
          { text: "TC Nu", callback_data: `tc:${id}:0` },
          { text: "TC Rappi", callback_data: `tc:${id}:1` },
          { text: "Corregir", callback_data: `tc:${id}:x` },
        ],
        [{ text: "✏️ Cambiar categoría", callback_data: `edit:${id}` }],
      ],
    });
  });

  it("rechaza mensajes de más de 1.000 caracteres o 20 líneas", async () => {
    await procesar(mensaje(`35000 ${"a".repeat(995)}`));
    await procesar(mensaje(Array.from({ length: 21 }, (_, i) => `${1000 + i} x`).join("\n")));
    expect(deps.tg.textos()).toEqual([MENSAJE_LARGO, MENSAJE_LARGO]);
    expect(await gastos()).toEqual([]);
  });

  it("un texto que no empieza por / nunca es comando", async () => {
    await procesar(mensaje("cambiar aceite moto 80k"));
    expect((await gastos())[0]).toMatchObject({ categoria: "Moto", concepto: "cambiar aceite moto" });
  });
});

describe("presupuesto de tiempo y errores", () => {
  it("deja de llamar a Gemini tras 15 s de procesamiento y clasifica el resto como fallback", async () => {
    let t = new Date("2026-10-14T15:00:00.000Z").getTime();
    deps = crearDepsPrueba({ ahora: () => new Date(t) });
    deps.clasificarIA.mockImplementation(async () => {
      t += 8000; // cada llamada a Gemini tarda 8 s (timeout)
      return "Comida";
    });
    await procesar(mensaje("1000 a\n1000 b\n1000 c\n1000 d"));
    expect(deps.clasificarIA).toHaveBeenCalledTimes(2);
    expect((await gastos()).map((g) => g.fuente_clasificacion)).toEqual(["ia", "ia", "fallback", "fallback"]);
    expect(deps.tg.textos().length).toBe(4);
  });

  it("si el procesamiento falla avisa al usuario", async () => {
    deps.clasificarIA.mockRejectedValue(new Error("bug"));
    await procesar(mensaje("35000 almuerzo"));
    expect(deps.tg.textos()).toEqual(["Ocurrió un error, intenta de nuevo"]);
  });

  it("si falla un botón responde el callback y avisa", async () => {
    deps.tg.editMessageReplyMarkup = async () => {
      throw new Error("bug");
    };
    await procesar(mensaje("35000 almuerzo"));
    const id = (await gastos())[0].id;
    deps.tg.limpiar();
    await procesar(callback(`edit:${id}`));
    expect(deps.tg.textos()).toEqual(["Ocurrió un error, intenta de nuevo"]);
  });
});
