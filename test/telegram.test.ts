import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramClient } from "../src/telegram";

type Llamada = [RequestInfo | URL, RequestInit | undefined];

function fetchFalso(res: () => Response) {
  const llamadas: Llamada[] = [];
  const fn = vi.fn(async (u: RequestInfo | URL, i?: RequestInit) => {
    llamadas.push([u, i]);
    return res();
  });
  return { fn: fn as unknown as typeof fetch, llamadas };
}

function capturarLogs() {
  const salida: string[] = [];
  for (const m of ["log", "error", "warn", "info"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      salida.push(a.map(String).join(" "));
    });
  }
  return salida;
}

afterEach(() => vi.restoreAllMocks());

describe("TelegramClient", () => {
  it("llama a fetch como función suelta (Workers lanza Illegal invocation si recibe otro this)", async () => {
    // Igual que el fetch real del runtime: falla si se invoca como método de otro objeto.
    const fetchEstricto = vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(Response.json({ ok: true, result: { message_id: 5 } }));
    });
    const tg = new TelegramClient("test-bot-token", fetchEstricto as unknown as typeof fetch);
    expect(await tg.sendMessage(1, "hola")).toBe(5);
  });


  it("llama al método con JSON y sin parse_mode, y devuelve message_id", async () => {
    const f = fetchFalso(() => Response.json({ ok: true, result: { message_id: 77 } }));
    const tg = new TelegramClient("test-bot-token", f.fn);
    expect(await tg.sendMessage(123456, "hola *x*")).toBe(77);
    const [url, init] = f.llamadas[0];
    expect(String(url)).toBe("https://api.telegram.org/bottest-bot-token/sendMessage");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ chat_id: 123456, text: "hola *x*" });
    expect(body).not.toHaveProperty("parse_mode");
  });

  it("editMessageReplyMarkup sin teclado envía un teclado vacío", async () => {
    const f = fetchFalso(() => Response.json({ ok: true, result: true }));
    await new TelegramClient("test-bot-token", f.fn).editMessageReplyMarkup(1, 2);
    expect(JSON.parse(String(f.llamadas[0][1]?.body)).reply_markup).toEqual({ inline_keyboard: [] });
  });

  it("ante un error HTTP loguea método, status y descripción, nunca el token", async () => {
    const logs = capturarLogs();
    const f = fetchFalso(() =>
      Response.json({ ok: false, description: "Bad Request: chat not found" }, { status: 400 }),
    );
    expect(await new TelegramClient("test-bot-token", f.fn).sendMessage(1, "x")).toBeNull();
    const todo = logs.join("\n");
    expect(todo).toContain("sendMessage");
    expect(todo).toContain("400");
    expect(todo).toContain("chat not found");
    expect(todo).not.toContain("test-bot-token");
    expect(todo).not.toContain("api.telegram.org");
  });

  it("ante un error de red no loguea el mensaje (que puede traer la URL)", async () => {
    const logs = capturarLogs();
    const fn = vi.fn(async () => {
      throw new TypeError("fetch failed https://api.telegram.org/bottest-bot-token/sendMessage");
    }) as unknown as typeof fetch;
    expect(await new TelegramClient("test-bot-token", fn).answerCallbackQuery("abc")).toBe(false);
    const todo = logs.join("\n");
    expect(todo).toContain("answerCallbackQuery");
    expect(todo).not.toContain("test-bot-token");
  });

  it("sendDocument envía multipart con el nombre del archivo", async () => {
    const f = fetchFalso(() => Response.json({ ok: true, result: {} }));
    const ok = await new TelegramClient("test-bot-token", f.fn).sendDocument(
      123456,
      "gastos_2026-10.csv",
      new TextEncoder().encode("a;b"),
    );
    expect(ok).toBe(true);
    const body = f.llamadas[0][1]?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("chat_id")).toBe("123456");
    expect((body.get("document") as File).name).toBe("gastos_2026-10.csv");
  });
});
