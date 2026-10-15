import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { procesarUpdate } from "../src/bot";
import { totalEntre } from "../src/db/gastos";
import { calcularSaldo } from "../src/tarjetas";
import type { InlineKeyboard } from "../src/telegram";
import type { Gasto, PagoTarjeta } from "../src/tipos";
import { callback, crearDepsPrueba, type DepsPrueba, limpiarDB, mensaje } from "./helpers";

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
async function tocar(data: string) {
  deps.tg.limpiar();
  await procesarUpdate(callback(data, { messageId: 555 }), deps, "123456");
}
const gastos = async () => (await env.DB.prepare("SELECT * FROM gastos ORDER BY id").all<Gasto>()).results;
const pagos = async () => (await env.DB.prepare("SELECT * FROM pagos_tarjeta ORDER BY id").all<PagoTarjeta>()).results;
const PREGUNTA = (x: string) => `El pago supera lo registrado en TC Nu por ${x}. ¿Qué fue esa diferencia?`;

describe("/saldotc", () => {
  it("define, reemplaza y pone en cero el saldo inicial", async () => {
    expect(await enviar("/saldotc nu 500000")).toEqual(["Saldo inicial de TC Nu: $500.000"]);
    expect(await enviar("/saldotc NU 0")).toEqual(["Saldo inicial de TC Nu: $0"]);
    expect((await calcularSaldo(env.DB, "nu")).inicial).toBe(0);
  });

  it("valida alias y uso", async () => {
    expect(await enviar("/saldotc visa 1")).toEqual(['No conozco la tarjeta "visa". Tarjetas configuradas: nu, rappi']);
    expect(await enviar("/saldotc nu")).toEqual(["Uso: /saldotc <tarjeta> <monto>"]);
    expect(await enviar("/saldotc nu abc")).toEqual(["No entendí el monto."]);
  });
});

describe("/pagotc", () => {
  it("registra un pago con saldo positivo sin preguntar", async () => {
    await enviar("/saldotc nu 500000");
    await enviar("100000 x tc nu");
    expect(await enviar("/pagotc nu 50000")).toEqual(["💳 Pago registrado: $50.000 a TC Nu\nSaldo estimado: $550.000"]);
    expect(await calcularSaldo(env.DB, "nu")).toEqual({ inicial: 500000, compras: 100000, pagos: 50000, saldo: 550000 });
  });

  it("acepta fecha retroactiva al final y pregunta si el saldo queda negativo", async () => {
    await enviar("600000 tv tc nu");
    const textos = await enviar("/pagotc nu 1.200.000 ayer");
    expect(textos).toEqual([
      "💳 Pago registrado: $1.200.000 a TC Nu · 13/10\nSaldo estimado: -$600.000",
      PREGUNTA("$600.000"),
    ]);
    const id = (await pagos())[0].id;
    expect((await pagos())[0]).toMatchObject({ fecha_pago: "2026-10-13", monto: 1200000, tarjeta: "nu" });
    expect(deps.tg.ultimoTeclado()).toEqual({
      inline_keyboard: [
        [{ text: "Intereses / cuota de manejo", callback_data: `aj:${id}:int` }],
        [{ text: "Compra no registrada", callback_data: `aj:${id}:compra` }],
        [{ text: "Saldo a favor", callback_data: `aj:${id}:favor` }],
      ],
    });
  });

  it("valida alias, monto y fecha", async () => {
    expect(await enviar("/pagotc visa 1000")).toEqual(['No conozco la tarjeta "visa". Tarjetas configuradas: nu, rappi']);
    expect(await enviar("/pagotc nu")).toEqual(["Uso: /pagotc <tarjeta> <monto> [fecha]"]);
    expect(await enviar("/pagotc nu 1000 31/02")).toEqual(["La fecha 31/02 no existe."]);
    expect(await pagos()).toEqual([]);
  });

  it("los pagos nunca suman en los totales", async () => {
    await enviar("/pagotc nu 1000000");
    expect(await totalEntre(env.DB, "2026-10-01", "2026-10-31")).toBe(0);
  });
});

describe("ajuste del pago", () => {
  async function pagoNegativo(): Promise<number> {
    await enviar("600000 tv tc nu");
    await enviar("/pagotc nu 1200000 ayer");
    return (await pagos())[0].id;
  }

  it("Intereses crea un gasto Financieros y deja el saldo en 0", async () => {
    const id = await pagoNegativo();
    await tocar(`aj:${id}:int`);
    const ajuste = (await gastos())[1];
    expect(ajuste).toMatchObject({
      monto: 600000,
      categoria: "Financieros",
      tarjeta: "nu",
      fecha_gasto: "2026-10-13",
      concepto: "Intereses y cuota de manejo (ajuste)",
      fuente_clasificacion: "ajuste",
      pago_ajuste_id: id,
    });
    expect((await calcularSaldo(env.DB, "nu")).saldo).toBe(0);
    expect(deps.tg.de("editMessageText")[0].args.slice(1, 4)).toEqual([
      555,
      "Registrado: ✅ $600.000 · Financieros · Intereses y cuota de manejo (ajuste) · TC Nu · 13/10",
      undefined,
    ]);
  });

  it("los botones funcionan una sola vez", async () => {
    const id = await pagoNegativo();
    await tocar(`aj:${id}:int`);
    await tocar(`aj:${id}:int`);
    await tocar(`aj:${id}:compra`);
    expect((await gastos()).length).toBe(2);
    expect(deps.tg.de("answerCallbackQuery").map((l) => l.args[1])).toEqual(["Este ajuste ya fue resuelto"]);
  });

  it("Compra no registrada crea un gasto Otros con su confirmación y botón de categoría", async () => {
    const id = await pagoNegativo();
    await tocar(`aj:${id}:compra`);
    const ajuste = (await gastos())[1];
    expect(ajuste).toMatchObject({ categoria: "Otros", concepto: "Compra no registrada (ajuste)", tarjeta: "nu" });
    expect(deps.tg.de("editMessageText")[0].args[2]).toBe("Registrado como compra no registrada.");
    expect(deps.tg.textos()).toEqual(["✅ $600.000 · Otros · Compra no registrada (ajuste) · TC Nu · 13/10"]);
    expect(deps.tg.ultimoTeclado()).toEqual({
      inline_keyboard: [[{ text: "✏️ Cambiar categoría", callback_data: `edit:${ajuste.id}` }]],
    });
  });

  it("Saldo a favor no crea gasto", async () => {
    const id = await pagoNegativo();
    await tocar(`aj:${id}:favor`);
    expect((await gastos()).length).toBe(1);
    expect((await calcularSaldo(env.DB, "nu")).saldo).toBe(-600000);
    expect(deps.tg.de("editMessageText")[0].args[2]).toBe("Queda saldo a favor de $600.000 en TC Nu.");
  });

  it("el gasto de ajuste dispara la evaluación del tope", async () => {
    await enviar("/tope 1000000");
    const id = await pagoNegativo();
    await tocar(`aj:${id}:int`);
    expect(deps.tg.textos()).toContain("🚨 Superaste tu tope mensual: $1.200.000 de $1.000.000");
  });

  it("pago inexistente", async () => {
    await tocar("aj:999:int");
    expect(deps.tg.de("answerCallbackQuery").map((l) => l.args[1])).toEqual(["Este pago ya no existe"]);
  });

  it("corregir la categoría de un gasto de ajuste no se aprende", async () => {
    const id = await pagoNegativo();
    await tocar(`aj:${id}:compra`);
    const ajuste = (await gastos())[1];
    await tocar(`cat:${ajuste.id}:9`);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM aprendizaje").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });
});

describe("/tarjeta", () => {
  it("muestra saldos de cada tarjeta configurada y los gastos sin tarjeta", async () => {
    deps = crearDepsPrueba({ tarjetas: ["nu", "rappi", "visa"] });
    await enviar("/saldotc nu 100000");
    await enviar("50000 x tc nu\n7000 y tc");
    await enviar("/pagotc nu 30000");
    expect(await enviar("/tarjeta")).toEqual([
      [
        "💳 Tarjetas de crédito",
        "",
        "TC Nu\nSaldo inicial: $100.000\nCompras: $50.000\nPagos: $30.000\nSaldo estimado: $120.000",
        "",
        "TC Rappi\nSaldo inicial: $0\nCompras: $0\nPagos: $0\nSaldo estimado: $0",
        "",
        "TC Visa\nSaldo inicial: $0\nCompras: $0\nPagos: $0\nSaldo estimado: $0",
        "",
        "Gastos con tc sin tarjeta definida: 1",
      ].join("\n"),
    ]);
  });
});

describe("/deshacer con pagos y ajustes", () => {
  it("deshacer el ajuste reabre el pago y vuelve a preguntar; luego borra el pago", async () => {
    await enviar("600000 tv tc nu");
    await enviar("/pagotc nu 1200000 ayer");
    const id = (await pagos())[0].id;
    await tocar(`aj:${id}:int`);

    const textos = await enviar("/deshacer");
    expect(textos).toEqual([
      "🗑️ Eliminado: $600.000 · Financieros · Intereses y cuota de manejo (ajuste) · TC Nu · 13/10",
      PREGUNTA("$600.000"),
    ]);
    expect((await pagos())[0].ajuste_resuelto).toBe(0);
    expect((deps.tg.ultimoTeclado() as InlineKeyboard).inline_keyboard[0][0].callback_data).toBe(`aj:${id}:int`);

    expect(await enviar("/deshacer")).toEqual(["🗑️ Eliminado: pago de $1.200.000 a TC Nu (13/10)"]);
    expect(await pagos()).toEqual([]);
  });

  it("deshacer un pago resuelto como saldo a favor lo borra", async () => {
    await enviar("600000 tv tc nu");
    await enviar("/pagotc nu 1200000");
    await tocar(`aj:${(await pagos())[0].id}:favor`);
    expect(await enviar("/deshacer")).toEqual(["🗑️ Eliminado: pago de $1.200.000 a TC Nu (14/10)"]);
  });
});

describe("alias con tildes", () => {
  it("tc y los comandos reconocen la tarjeta con o sin tilde", async () => {
    deps = crearDepsPrueba({ tarjetas: ["exito"] });
    await enviar("50000 x tc Éxito");
    await enviar("/saldotc éxito 1000");
    await enviar("/pagotc EXITO 2000");
    expect(await calcularSaldo(env.DB, "exito")).toEqual({ inicial: 1000, compras: 50000, pagos: 2000, saldo: 49000 });
  });
});

describe("saldo", () => {
  it("los gastos sin tarjeta definida no cuentan en el saldo", async () => {
    await enviar("50000 x tc");
    expect((await calcularSaldo(env.DB, "nu")).compras).toBe(0);
  });
});
