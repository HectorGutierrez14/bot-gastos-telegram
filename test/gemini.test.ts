import { afterEach, describe, expect, it, vi } from "vitest";
import { crearClasificadorGemini } from "../src/gemini";

function respuesta(texto: string, status = 200) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }), { status });
}

function crear(fetchFn: typeof fetch, timeoutMs?: number) {
  return crearClasificadorGemini({ apiKey: "test-gemini-key", model: "gemini-3.5-flash-lite", fetchFn, timeoutMs });
}

afterEach(() => vi.restoreAllMocks());

describe("clasificador Gemini", () => {
  it("devuelve la categoría válida", async () => {
    const f = vi.fn(async () => respuesta('{"categoria":"Comida"}'));
    expect(await crear(f as unknown as typeof fetch)("almuerzo")).toBe("Comida");
  });

  it("envía la llave en el header, nunca en la URL, y solo el concepto", async () => {
    const f = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => respuesta('{"categoria":"Comida"}'));
    await crear(f as unknown as typeof fetch)("almuerzo con jefe");
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(String(url)).not.toContain("test-gemini-key");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("test-gemini-key");
    const body = JSON.parse(String(init?.body));
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "almuerzo con jefe" }] }]);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.properties.categoria.enum).toContain("Financieros");
    expect(body.generationConfig.responseSchema.properties.categoria.enum).not.toContain("Lau");
  });

  it.each([
    ["categoría fuera del enum", () => respuesta('{"categoria":"Lau"}')],
    ["429", () => new Response("{}", { status: 429 })],
    ["500", () => new Response("{}", { status: 500 })],
    ["texto envuelto en ```json", () => respuesta('```json {"categoria":"Comida"}```')],
    ["body sin candidates", () => new Response("{}", { status: 200 })],
    ["body no JSON", () => new Response("hola", { status: 200 })],
  ])("%s → null", async (_n, r) => {
    const f = vi.fn(async () => r());
    expect(await crear(f as unknown as typeof fetch)("x")).toBeNull();
  });

  it("fetch que lanza → null", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await crear(f as unknown as typeof fetch)("x")).toBeNull();
  });

  it("timeout → null", async () => {
    const f = vi.fn(
      (_u: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal?.reason))),
    );
    expect(await crear(f as unknown as typeof fetch, 20)("x")).toBeNull();
  });
});
