import { describe, expect, it } from "vitest";
import { parseLinea } from "../../src/parse/linea";

const HOY = "2026-10-14";
const TARJETAS = ["nu", "rappi"];
const parse = (l: string) => parseLinea(l, HOY, TARJETAS);

describe("parseLinea: válidas", () => {
  it.each([
    ["35000 almuerzo", HOY, 35000, "almuerzo", null],
    ["almuerzo 35.000", HOY, 35000, "almuerzo", null],
    ["uber 18k", HOY, 18000, "uber", null],
    ["gasolina moto 20 mil", HOY, 20000, "gasolina moto", null],
    ["$45.500 regalo Lau", HOY, 45500, "regalo Lau", null],
    ["ayer 20000 taxi", "2026-10-13", 20000, "taxi", null],
    ["12/10 35000 almuerzo", "2026-10-12", 35000, "almuerzo", null],
    ["2 cervezas 15000", HOY, 15000, "2 cervezas", null],
    ["almuerzo 500", HOY, 500, "almuerzo", null],
    ["35000 almuerzo tc nu", HOY, 35000, "almuerzo", "nu"],
    ["uber 18k TC Rappi", HOY, 18000, "uber", "rappi"],
    ["ayer regalo Lau 80k tc nu", "2026-10-13", 80000, "regalo Lau", "nu"],
    ["tc nu 35000 almuerzo", HOY, 35000, "almuerzo", "nu"],
    ["35000 almuerzo tc", HOY, 35000, "almuerzo", "sin_definir"],
    ["35000 tc almuerzo", HOY, 35000, "almuerzo", "sin_definir"],
    ["tc nuu almuerzo 35000", HOY, 35000, "nuu almuerzo", "sin_definir"],
    ["  35000   almuerzo   con  jefe ", HOY, 35000, "almuerzo con jefe", null],
    ["35000 almuerzo 12/10", HOY, 35000, "almuerzo 12/10", null],
  ])("%s", (linea, fecha, monto, concepto, tarjeta) => {
    expect(parse(linea)).toEqual({ ok: true, valor: { fecha, monto, concepto, tarjeta } });
  });
});

describe("parseLinea: errores", () => {
  it.each(["almuerzo", "35000 15000 almuerzo", "35000", "35000 tc nu", "tc tc 35000 x", "2 3 cervezas", ""])(
    "%s → ayuda",
    (linea) => {
      expect(parse(linea)).toEqual({ ok: false, error: "ayuda" });
    },
  );

  it("errores de rango y fecha se devuelven tal cual", () => {
    const rango = "El monto debe ser mayor que $0 y máximo $50.000.000.";
    expect(parse("0 almuerzo")).toEqual({ ok: false, error: rango });
    expect(parse("60000000 carro")).toEqual({ ok: false, error: rango });
    expect(parse("31/02 35000 x")).toEqual({ ok: false, error: "La fecha 31/02 no existe." });
  });
});
