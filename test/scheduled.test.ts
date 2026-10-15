import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marcarUpdate } from "../src/db/control";
import { insertarGasto } from "../src/db/gastos";
import worker from "../src/index";
import { ejecutarCron } from "../src/scheduled";
import { crearDepsPrueba, type DepsPrueba, limpiarDB, reloj } from "./helpers";

let deps: DepsPrueba;
beforeEach(async () => {
  await limpiarDB(env.DB);
  deps = crearDepsPrueba({ ahora: reloj("2026-11-01T13:00:00.000Z") });
});
afterEach(() => vi.unstubAllGlobals());

const gasto = {
  telegram_update_id: 1,
  linea: 0,
  fecha_gasto: "2026-10-20",
  registrado_utc: "2026-10-20T15:00:00.000Z",
  monto: 45000,
  concepto: "almuerzo",
  categoria: "Comida",
  tarjeta: null,
  pago_ajuste_id: null,
  fuente_clasificacion: "ia" as const,
  texto_original: "45000 almuerzo",
};

describe("cron mensual", () => {
  it("envía el informe del mes cerrado al usuario una sola vez", async () => {
    await insertarGasto(env.DB, gasto);
    await ejecutarCron(deps);
    await ejecutarCron(deps);
    const envios = deps.tg.de("sendMessage");
    expect(envios.length).toBe(1);
    expect(envios[0].args[0]).toBe("123456");
    expect(envios[0].args[1]).toMatch(/^📊 Informe octubre 2026\n01\/10\/2026 – 31\/10\/2026\n\nTotal: \$45.000 en 1 gasto/);
  });

  it("si Telegram falla no lo marca como enviado y la siguiente ejecución reintenta", async () => {
    const enviar = deps.tg.sendMessage.bind(deps.tg);
    let fallar = true;
    deps.tg.sendMessage = async (...a: Parameters<typeof enviar>) => {
      if (fallar) return null;
      return enviar(...a);
    };
    await ejecutarCron(deps);
    fallar = false;
    await ejecutarCron(deps);
    await ejecutarCron(deps);
    expect(deps.tg.textos().length).toBe(1);
  });

  it("envía un mensaje aunque el mes no tenga gastos", async () => {
    await ejecutarCron(deps);
    expect(deps.tg.textos()).toEqual(["📊 Informe octubre 2026\n01/10/2026 – 31/10/2026\n\nNo registraste gastos en este periodo."]);
  });

  it("borra updates procesados de hace más de 30 días", async () => {
    await marcarUpdate(env.DB, 1, "2026-10-01T12:00:00.000Z");
    await marcarUpdate(env.DB, 2, "2026-10-27T12:00:00.000Z");
    await ejecutarCron(deps);
    expect(await marcarUpdate(env.DB, 1, "x")).toBe(true);
    expect(await marcarUpdate(env.DB, 2, "x")).toBe(false);
  });

  it("el handler scheduled del Worker ejecuta el cron", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, result: { message_id: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ scheduledTime: new Date("2026-11-01T13:00:00Z"), cron: "0 13 1 * *" }), env, ctx);
    await waitOnExecutionContext(ctx);
    const urls = fetchMock.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls).toEqual(["https://api.telegram.org/bottest-bot-token/sendMessage"]);
  });
});
