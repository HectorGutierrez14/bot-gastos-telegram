import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { procesarUpdate } from "../src/bot";
import { aprender, buscarAprendido } from "../src/db/aprendizaje";
import { COMANDO_DESCONOCIDO, TEXTO_AYUDA } from "../src/mensajes";
import type { Gasto } from "../src/tipos";
import { crearDepsPrueba, type DepsPrueba, limpiarDB, mensaje } from "./helpers";

let deps: DepsPrueba;
beforeEach(async () => {
  await limpiarDB(env.DB);
  deps = crearDepsPrueba();
});

async function enviar(texto: string): Promise<string[]> {
  deps.tg.limpiar();
  await procesarUpdate(mensaje(texto), deps, "123456");
  return deps.tg.textos();
}
const gastos = async () => (await env.DB.prepare("SELECT * FROM gastos ORDER BY id").all<Gasto>()).results;
const CATEGORIAS_TEXTO =
  "Comida\nMercado\nTransporte\nDeporte\nFacturas\nViajes\nSalud\nHogar\nEntretenimiento\nCompras\nEducación\nFinancieros\nOtros\nLau\nMoto\nApto";

describe("comandos básicos", () => {
  it("/start y /ayuda muestran la ayuda", async () => {
    expect(await enviar("/start")).toEqual([TEXTO_AYUDA]);
    expect(await enviar("/Ayuda")).toEqual([TEXTO_AYUDA]);
  });

  it("/categorias lista las 16", async () => {
    expect(await enviar("/categorías")).toEqual([`Categorías:\n${CATEGORIAS_TEXTO}`]);
  });

  it("comando desconocido", async () => {
    expect(await enviar("/foo")).toEqual([COMANDO_DESCONOCIDO]);
  });
});

describe("/cambiar", () => {
  it("cambia el último gasto y aprende", async () => {
    await enviar("35000 almuerzo");
    await enviar("18000 uber");
    expect(await enviar("/cambiar transporte")).toEqual(["Cambiado: ✅ $18.000 · Transporte · uber"]);
    expect((await gastos()).map((g) => [g.categoria, g.fuente_clasificacion])).toEqual([
      ["Comida", "ia"],
      ["Transporte", "manual"],
    ]);
    expect(await buscarAprendido(env.DB, "uber")).toBe("Transporte");
  });

  it("categoría inválida lista las opciones", async () => {
    await enviar("35000 almuerzo");
    expect(await enviar("/cambiar xyz")).toEqual([`Categoría no válida. Opciones:\n${CATEGORIAS_TEXTO}`]);
    expect(await enviar("/cambiar")).toEqual([`Categoría no válida. Opciones:\n${CATEGORIAS_TEXTO}`]);
  });

  it("sin gastos", async () => {
    expect(await enviar("/cambiar comida")).toEqual(["No hay gastos para cambiar."]);
  });
});

describe("/aprendido y /olvidar", () => {
  it("lista lo aprendido", async () => {
    expect(await enviar("/aprendido")).toEqual(["Aún no he aprendido ningún concepto."]);
    await aprender(env.DB, "almuerzo", "Comida", "2026-10-14T10:00:00.000Z");
    await aprender(env.DB, "uber", "Transporte", "2026-10-14T10:00:01.000Z");
    expect(await enviar("/aprendido")).toEqual(["Conceptos aprendidos:\n• uber → Transporte\n• almuerzo → Comida"]);
  });

  it("olvida un concepto normalizado", async () => {
    await aprender(env.DB, "almuerzo con jefe", "Comida", "2026-10-14T10:00:00.000Z");
    expect(await enviar("/olvidar Almuerzo  con Jéfe")).toEqual(['Olvidé "Almuerzo  con Jéfe".']);
    expect(await buscarAprendido(env.DB, "almuerzo con jefe")).toBeNull();
    expect(await enviar("/olvidar uber")).toEqual(['No tenía aprendido "uber".']);
    expect(await enviar("/olvidar")).toEqual(["Uso: /olvidar <concepto>"]);
  });
});

describe("/deshacer (gastos)", () => {
  it("borra el gasto más reciente primero", async () => {
    await enviar("35000 almuerzo");
    await enviar("18000 uber tc nu");
    expect(await enviar("/deshacer")).toEqual(["🗑️ Eliminado: $18.000 · Comida · uber · TC Nu"]);
    expect(await enviar("/deshacer")).toEqual(["🗑️ Eliminado: $35.000 · Comida · almuerzo"]);
    expect(await gastos()).toEqual([]);
    expect(await enviar("/deshacer")).toEqual(["No hay nada que deshacer."]);
  });
});
