import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { limpiarDB } from "./helpers";

const URL_WEBHOOK = "https://bot.example/webhook";

async function llamar(init: RequestInit & { url?: string } = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(init.url ?? URL_WEBHOOK, { method: "POST", ...init }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const HEADER_OK = { "X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret", "content-type": "application/json" };
// Update de un usuario no autorizado: se acepta (200) pero no genera llamadas.
const UPDATE_AJENO = JSON.stringify({ update_id: 1, message: { message_id: 1, from: { id: 999 }, chat: { id: 999, type: "private" }, text: "hola" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  await limpiarDB(env.DB);
  fetchMock = vi.fn(async () => Response.json({ ok: true, result: { message_id: 1 } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /webhook", () => {
  it("sin header secreto → 401", async () => {
    const res = await llamar({ body: UPDATE_AJENO });
    expect(res.status).toBe(401);
  });

  it("header incorrecto → 401", async () => {
    const res = await llamar({ body: UPDATE_AJENO, headers: { "X-Telegram-Bot-Api-Secret-Token": "otro" } });
    expect(res.status).toBe(401);
  });

  it("header correcto → 200", async () => {
    const res = await llamar({ body: UPDATE_AJENO, headers: HEADER_OK });
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("body de más de 64 KB → 413", async () => {
    const res = await llamar({ body: "x".repeat(70 * 1024), headers: HEADER_OK });
    expect(res.status).toBe(413);
  });

  it("JSON inválido → 200 sin procesar", async () => {
    const res = await llamar({ body: "{no json", headers: HEADER_OK });
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un gasto real se procesa en waitUntil y responde por Telegram", async () => {
    const body = JSON.stringify({
      update_id: 50,
      message: { message_id: 1, from: { id: 123456 }, chat: { id: 123456, type: "private" }, text: "35000 almuerzo moto" },
    });
    const res = await llamar({ body, headers: HEADER_OK });
    expect(res.status).toBe(200);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("https://api.telegram.org/bottest-bot-token/sendMessage");
  });
});

describe("otras rutas", () => {
  it("GET /webhook → 404", async () => {
    const res = await llamar({ method: "GET" });
    expect(res.status).toBe(404);
  });
  it("POST /otra → 404", async () => {
    const res = await llamar({ url: "https://bot.example/otra", headers: HEADER_OK, body: UPDATE_AJENO });
    expect(res.status).toBe(404);
  });
});

describe("logs", () => {
  it("ningún log contiene el token ni los secretos, aunque Telegram y Gemini fallen", async () => {
    const salida: string[] = [];
    for (const m of ["log", "error", "warn", "info", "debug"] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        salida.push(a.map(String).join(" "));
      });
    }
    fetchMock.mockImplementation(async (u: RequestInfo | URL) => {
      if (String(u).includes("generativelanguage")) throw new TypeError(`fetch failed ${String(u)}`);
      return Response.json({ ok: false, description: "Bad Request: chat not found" }, { status: 400 });
    });
    const update = (id: number, text: string) =>
      JSON.stringify({ update_id: id, message: { message_id: 1, from: { id: 123456 }, chat: { id: 123456, type: "private" }, text } });
    await llamar({ body: update(60, "35000 almuerzo"), headers: HEADER_OK });
    await llamar({ body: update(61, "/informe"), headers: HEADER_OK });
    vi.restoreAllMocks();

    const todo = salida.join("\n");
    expect(todo).toContain("telegram_error");
    for (const secreto of ["test-bot-token", "test-webhook-secret", "test-gemini-key", "almuerzo"]) {
      expect(todo).not.toContain(secreto);
    }
  });
});
