import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { cargarVariables, llamarTelegram, parseDevVars, redactar } from "./env.mjs";

describe("parseDevVars", () => {
  it("lee CLAVE=valor, ignora comentarios y quita comillas", () => {
    assert.deepEqual(parseDevVars('A=1\n# comentario\n\nB="x y"\nC=\'z\'\nD=a=b\n'), { A: "1", B: "x y", C: "z", D: "a=b" });
  });
});

describe("cargarVariables", () => {
  afterEach(() => {
    delete process.env.PRUEBA_A;
  });

  it("process.env gana sobre el archivo", () => {
    process.env.PRUEBA_A = "del-entorno";
    const v = cargarVariables(["PRUEBA_A", "PRUEBA_B"], { leerArchivo: () => "PRUEBA_A=del-archivo\nPRUEBA_B=b" });
    assert.deepEqual(v, { PRUEBA_A: "del-entorno", PRUEBA_B: "b" });
  });

  it("archivo ausente no falla si las variables están en el entorno", () => {
    process.env.PRUEBA_A = "x";
    const v = cargarVariables(["PRUEBA_A"], {
      leerArchivo: () => {
        throw Object.assign(new Error("no existe"), { code: "ENOENT" });
      },
    });
    assert.deepEqual(v, { PRUEBA_A: "x" });
  });

  it("falta una variable → error que solo menciona el nombre", () => {
    assert.throws(
      () => cargarVariables(["PRUEBA_A", "PRUEBA_FALTA"], { leerArchivo: () => "PRUEBA_A=valor-secreto" }),
      (e) => e.message === "Falta la variable PRUEBA_FALTA" && !e.message.includes("valor-secreto"),
    );
  });
});

describe("redactar", () => {
  it("reemplaza cada secreto por ***", () => {
    assert.equal(redactar("bottest-bot-token/x y test-webhook-secret", ["test-bot-token", "test-webhook-secret"]), "bot***/x y ***");
  });
  it("ignora secretos vacíos", () => {
    assert.equal(redactar("abc", ["", undefined]), "abc");
  });
});

describe("llamarTelegram", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("un error HTTP solo muestra método, status y descripción", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), { status: 401 });
    await assert.rejects(llamarTelegram("test-bot-token", "setWebhook", {}), (e) => {
      assert.equal(e.message, "setWebhook: 401 Unauthorized");
      return true;
    });
  });

  it("un error de red no incluye la URL con el token", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed https://api.telegram.org/bottest-bot-token/getWebhookInfo");
    };
    await assert.rejects(llamarTelegram("test-bot-token", "getWebhookInfo"), (e) => {
      assert.ok(!e.message.includes("test-bot-token"));
      assert.equal(e.message, "getWebhookInfo: error de red (TypeError)");
      return true;
    });
  });
});
