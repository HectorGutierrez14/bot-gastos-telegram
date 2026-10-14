import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { procesarUpdate } from "../src/bot";
import { escaparCampo, generarCSV } from "../src/csv";
import { crearDepsPrueba, type DepsPrueba, limpiarDB, mensaje } from "./helpers";

describe("escaparCampo", () => {
  it.each([
    ["almuerzo", "almuerzo"],
    ["=SUM(A1)", "'=SUM(A1)"],
    ["+57", "'+57"],
    ["-5", "'-5"],
    ["@x", "'@x"],
    ["\tx", "'\tx"],
    ["\rx", "\"'\rx\""],
    ['dijo "hola"', '"dijo ""hola"""'],
    ["a;b", '"a;b"'],
    ["a\nb", '"a\nb"'],
    ["@x;y", "\"'@x;y\""],
  ])("%j → %j", (entrada, salida) => {
    expect(escaparCampo(entrada)).toBe(salida);
  });
});

describe("generarCSV", () => {
  it("UTF-8 con BOM, separador ; y CRLF", () => {
    const bytes = generarCSV([
      ["a", "b"],
      ["1", "x;y"],
    ]);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('a;b\r\n1;"x;y"\r\n');
  });
});

describe("/exportar", () => {
  let deps: DepsPrueba;
  beforeEach(async () => {
    await limpiarDB(env.DB);
    deps = crearDepsPrueba();
  });
  async function enviar(texto: string) {
    deps.tg.limpiar();
    await procesarUpdate(mensaje(texto), deps, "123456");
  }
  function documento(): { nombre: string; lineas: string[] } {
    const [llamada] = deps.tg.de("sendDocument");
    const [, nombre, contenido] = llamada.args as [string, string, Uint8Array];
    return { nombre, lineas: new TextDecoder().decode(contenido.slice(3)).split("\r\n").filter(Boolean) };
  }

  it("exporta gastos y pagos del mes actual con tipo y medio de pago", async () => {
    await enviar("ayer 35000 almuerzo tc nu\n18000 uber tc\n=cmd 5000\n12/09 1000 viejo");
    await enviar("/pagotc nu 20000");
    await enviar("/exportar");
    const { nombre, lineas } = documento();
    expect(nombre).toBe("gastos_2026-10.csv");
    expect(lineas).toEqual([
      "fecha;tipo;monto;categoria;concepto;medio_pago;fuente_clasificacion",
      "2026-10-13;gasto;35000;Comida;almuerzo;tc_nu;ia",
      "2026-10-14;gasto;18000;Comida;uber;tc_sin_definir;ia",
      "2026-10-14;gasto;5000;Comida;'=cmd;efectivo_debito;ia",
      "2026-10-14;pago_tarjeta;20000;;;tc_nu;",
    ]);
  });

  it("exportar todo y mes pasado", async () => {
    await enviar("12/09 1000 viejo\n2000 nuevo");
    await enviar("/exportar todo");
    expect(documento().nombre).toBe("gastos_todo.csv");
    expect(documento().lineas.length).toBe(3);
    await enviar("/exportar mes pasado");
    expect(documento()).toEqual({
      nombre: "gastos_2026-09.csv",
      lineas: ["fecha;tipo;monto;categoria;concepto;medio_pago;fuente_clasificacion", "2026-09-12;gasto;1000;Comida;viejo;efectivo_debito;ia"],
    });
  });

  it("periodo vacío responde con texto y no envía archivo", async () => {
    await enviar("/exportar agosto");
    expect(deps.tg.de("sendDocument")).toEqual([]);
    expect(deps.tg.textos()).toEqual(["No hay movimientos para exportar en agosto 2026."]);
    await enviar("/exportar todo");
    expect(deps.tg.textos()).toEqual(["No hay movimientos para exportar."]);
  });

  it("argumentos inválidos o semanas muestran el uso", async () => {
    await enviar("/exportar xyz");
    await enviar("/exportar semana");
    expect(deps.tg.textos()).toEqual(["Uso: /exportar [mes pasado | <mes> [año] | todo]"]);
  });
});
