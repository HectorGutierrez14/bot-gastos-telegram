import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { procesarUpdate } from "../src/bot";
import { insertarPago } from "../src/db/pagos";
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
const alertas = (textos: string[]) => textos.filter((t) => t.startsWith("⚠️ Llevas") || t.startsWith("🚨"));

describe("tope mensual", () => {
  it("/tope sin configurar, configurar, mostrar y desactivar", async () => {
    expect(await enviar("/tope")).toEqual(["No tienes tope mensual. Defínelo con /tope 2000000"]);
    expect(await enviar("/tope 100.000")).toEqual(["Tope mensual: $100.000"]);
    await enviar("35000 almuerzo");
    expect(await enviar("/tope")).toEqual(["Tope mensual: $100.000\nGastado este mes: $35.000 (35%)"]);
    expect(await enviar("/tope off")).toEqual(["Tope desactivado."]);
    expect(alertas(await enviar("200000 tv"))).toEqual([]);
  });

  it("/tope con monto inválido", async () => {
    expect(await enviar("/tope abc")).toEqual(["No entendí el monto."]);
    expect(await enviar("/tope 0")).toEqual(["El monto debe ser mayor que $0 y máximo $50.000.000."]);
  });

  it("alerta al 80% y al 100% una sola vez cada una", async () => {
    await enviar("/tope 100000");
    expect(alertas(await enviar("70000 a"))).toEqual([]);
    expect(alertas(await enviar("15000 b"))).toEqual(["⚠️ Llevas $85.000 de $100.000 este mes (85%)"]);
    expect(alertas(await enviar("1000 c"))).toEqual([]);
    expect(alertas(await enviar("20000 d"))).toEqual(["🚨 Superaste tu tope mensual: $106.000 de $100.000"]);
    expect(alertas(await enviar("1000 e"))).toEqual([]);
  });

  it("saltar directo por encima del 100% solo envía la alerta de 100%", async () => {
    await enviar("/tope 100000");
    expect(alertas(await enviar("120000 a"))).toEqual(["🚨 Superaste tu tope mensual: $120.000 de $100.000"]);
    expect(alertas(await enviar("1000 b"))).toEqual([]);
  });

  it("cambiar el tope reinicia las alertas y evalúa de inmediato", async () => {
    await enviar("/tope 100000");
    await enviar("106000 a");
    expect(await enviar("/tope 200000")).toEqual(["Tope mensual: $200.000"]);
    expect(await enviar("/tope 120000")).toEqual(["Tope mensual: $120.000", "⚠️ Llevas $106.000 de $120.000 este mes (88%)"]);
  });

  it("gastos de meses anteriores no disparan alertas", async () => {
    await enviar("/tope 100000");
    expect(alertas(await enviar("12/09 500000 x"))).toEqual([]);
  });

  it("los pagos de tarjeta no cuentan en el total", async () => {
    await insertarPago(env.DB, {
      telegram_update_id: 1,
      tarjeta: "nu",
      monto: 1000000,
      fecha_pago: "2026-10-14",
      registrado_utc: "2026-10-14T10:00:00.000Z",
    });
    await enviar("/tope 100000");
    expect(alertas(await enviar("10000 a"))).toEqual([]);
    expect(await enviar("/tope")).toEqual(["Tope mensual: $100.000\nGastado este mes: $10.000 (10%)"]);
  });

  it("incluye Lau, Moto, Apto y compras con tarjeta", async () => {
    await enviar("/tope 100000");
    await enviar("30000 regalo lau\n30000 gasolina moto\n20000 x tc nu");
    expect(await enviar("/tope")).toEqual(["Tope mensual: $100.000\nGastado este mes: $80.000 (80%)"]);
  });
});
