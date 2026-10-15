import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { procesarUpdate } from "../src/bot";
import { insertarGasto } from "../src/db/gastos";
import { formatearInforme, resumir } from "../src/informe";
import { mesActual, mesPasado, rangoComparacion, semanaActual } from "../src/periodos";
import type { Gasto } from "../src/tipos";
import { crearDepsPrueba, type DepsPrueba, limpiarDB, mensaje, reloj } from "./helpers";

let n = 0;
function g(fecha: string, monto: number, categoria: string, concepto: string, tarjeta: string | null = null): Gasto {
  n++;
  return {
    id: n,
    telegram_update_id: n,
    linea: 0,
    fecha_gasto: fecha,
    registrado_utc: `${fecha}T15:00:00.000Z`,
    monto,
    concepto,
    categoria,
    tarjeta,
    pago_ajuste_id: null,
    fuente_clasificacion: "ia",
    texto_original: concepto,
  };
}

const ACTUAL = [
  g("2026-10-05", 300000, "Viajes", "tiquetes", "nu"),
  g("2026-10-02", 250000, "Comida", "almuerzos"),
  g("2026-10-08", 150000, "Comida", "restaurante"),
  g("2026-10-10", 100000, "Hogar", "bombillos", "sin_definir"),
];
const ANTERIOR = [g("2026-09-03", 350000, "Comida", "x"), g("2026-09-04", 30000, "Salud", "y")];
const TARJETAS = [
  { alias: "nu", compras: 300000, pagos: 1200000, saldo: 250000 },
  { alias: "rappi", compras: 0, pagos: 0, saldo: 0 },
];

describe("formatearInforme", () => {
  it("produce el informe completo de un mes en curso", () => {
    const periodo = mesActual("2026-10-14");
    expect(
      formatearInforme({
        periodo,
        actual: resumir(ACTUAL),
        anterior: resumir(ANTERIOR),
        comparacion: rangoComparacion(periodo),
        tope: 2000000,
        tarjetas: TARJETAS,
      }),
    ).toBe(`📊 Informe octubre 2026
01/10/2026 – 14/10/2026 (en curso)

Total: $800.000 en 4 gastos
vs. 01/09/2026 – 14/09/2026: ▲ +$420.000 (+111%)
Tope: 40% de $2.000.000

Por categoría:
• Comida: $400.000 (50%) ▲ +$50.000 (+14%)
• Viajes: $300.000 (38%) nueva
• Hogar: $100.000 (13%) nueva
• Salud: sin gastos (antes $30.000)

Top 3:
1. $300.000 · Viajes · tiquetes · 05/10
2. $250.000 · Comida · almuerzos · 02/10
3. $150.000 · Comida · restaurante · 08/10

Por medio de pago:
• Efectivo/débito: $400.000
• TC Nu: $300.000
• TC por definir: $100.000

Tarjetas de crédito (informativo, no suma al total):
• TC Nu: compras $300.000 · pagos $1.200.000 · saldo estimado $250.000
• TC Rappi: compras $0 · pagos $0 · saldo estimado $0`);
  });

  it("sin tope, periodo cerrado y anterior vacío", () => {
    const periodo = mesPasado("2026-10-14");
    const texto = formatearInforme({
      periodo,
      actual: resumir([g("2026-09-10", 50000, "Comida", "x")]),
      anterior: resumir([]),
      comparacion: rangoComparacion(periodo),
      tope: null,
      tarjetas: [],
    });
    expect(texto.split("\n").slice(0, 5)).toEqual([
      "📊 Informe septiembre 2026",
      "01/09/2026 – 30/09/2026",
      "",
      "Total: $50.000 en 1 gasto",
      "vs. 01/08/2026 – 31/08/2026: ▲ +$50.000",
    ]);
    expect(texto).not.toContain("Tope");
    expect(texto).toContain("• Comida: $50.000 (100%) nueva");
  });

  it("un informe semanal nunca muestra el tope", () => {
    const periodo = semanaActual("2026-10-14");
    const texto = formatearInforme({
      periodo,
      actual: resumir(ACTUAL),
      anterior: resumir([]),
      comparacion: rangoComparacion(periodo),
      tope: 100,
      tarjetas: [],
    });
    expect(texto).not.toContain("Tope");
    expect(texto.split("\n")[0]).toBe("📊 Informe semana del 12/10 al 18/10/2026");
  });

  it("categoría sin cambios", () => {
    const periodo = mesPasado("2026-10-14");
    const texto = formatearInforme({
      periodo,
      actual: resumir([g("2026-09-10", 1000, "Comida", "x")]),
      anterior: resumir([g("2026-08-10", 1000, "Comida", "x")]),
      comparacion: rangoComparacion(periodo),
      tope: null,
      tarjetas: [],
    });
    expect(texto).toContain("• Comida: $1.000 (100%) = $0 (0%)");
  });

  it("periodo sin gastos", () => {
    const periodo = mesPasado("2026-10-14");
    expect(
      formatearInforme({ periodo, actual: resumir([]), anterior: resumir(ANTERIOR), comparacion: rangoComparacion(periodo), tope: 1, tarjetas: TARJETAS }),
    ).toBe("📊 Informe septiembre 2026\n01/09/2026 – 30/09/2026\n\nNo registraste gastos en este periodo.");
  });

  it("recorta conceptos largos en el top 3", () => {
    const periodo = mesPasado("2026-10-14");
    const texto = formatearInforme({
      periodo,
      actual: resumir([g("2026-09-10", 1000, "Comida", "y".repeat(500))]),
      anterior: resumir([]),
      comparacion: rangoComparacion(periodo),
      tope: null,
      tarjetas: [],
    });
    expect(texto).toContain(`1. $1.000 · Comida · ${"y".repeat(59)}… · 10/09`);
  });

  it("top 3 desempata por fecha", () => {
    const r = resumir([g("2026-10-03", 5, "Comida", "b"), g("2026-10-01", 5, "Comida", "a"), g("2026-10-02", 9, "Comida", "c")]);
    expect(r.top.map((x) => x.concepto)).toEqual(["c", "a", "b"]);
  });
});

describe("/informe", () => {
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

  it("los pagos de tarjeta no aparecen en el total ni en categorías", async () => {
    await enviar("100000 tv tc nu");
    await enviar("/pagotc nu 500000");
    const [informe] = await enviar("/informe mes");
    expect(informe).toContain("Total: $100.000 en 1 gasto");
    expect(informe).toContain("• TC Nu: compras $100.000 · pagos $500.000 · saldo estimado -$400.000");
  });

  it("acepta mes pasado y mes con nombre y año", async () => {
    await insertarGasto(env.DB, { ...g("2026-09-30", 20000, "Comida", "cena"), registrado_utc: "2026-10-01T03:00:00.000Z" });
    expect((await enviar("/informe mes pasado"))[0]).toContain("Total: $20.000 en 1 gasto");
    expect((await enviar("/informe septiembre 2026"))[0]).toContain("📊 Informe septiembre 2026");
  });

  it("un gasto registrado a las 22:00 de Bogotá del 30/09 cuenta en septiembre", async () => {
    deps = crearDepsPrueba({ ahora: reloj("2026-10-01T03:00:00.000Z") });
    await enviar("20000 cena");
    expect((await enviar("/informe septiembre"))[0]).toContain("Total: $20.000 en 1 gasto");
  });

  it("argumento inválido muestra el uso", async () => {
    expect(await enviar("/informe xyz")).toEqual(["Uso: /informe semana | semana pasada | mes | mes pasado | <mes> [año]"]);
  });

  it("muestra el porcentaje del tope en informes mensuales", async () => {
    await enviar("/tope 200000");
    await enviar("50000 x");
    expect((await enviar("/informe"))[0]).toContain("Tope: 25% de $200.000");
  });
});
