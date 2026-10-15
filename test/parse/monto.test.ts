import { describe, expect, it } from "vitest";
import { interpretarNumero, parseMonto, validarRango } from "../../src/parse/monto";

const RANGO = "El monto debe ser mayor que $0 y máximo $50.000.000.";

describe("interpretarNumero", () => {
  it.each([
    ["35000", 35000, true],
    ["35.000", 35000, true],
    ["35,000", 35000, true],
    ["1.200.000", 1200000, true],
    ["$45.500", 45500, true],
    ["$500", 500, true],
    ["18k", 18000, true],
    ["18K", 18000, true],
    ["2", 2, false],
    ["500", 500, false],
    ["1000", 1000, true],
  ])("%s → %d (marcado %s)", (token, valor, marcado) => {
    expect(interpretarNumero(token)).toEqual({ valor, marcado });
  });

  it.each(["1.5k", "12/10", "3.50", "$", "k", "abc", "35.00", "1,2345", "-5"])("%s no es número", (token) => {
    expect(interpretarNumero(token)).toBeNull();
  });
});

describe("parseMonto", () => {
  it("acepta formatos de comando", () => {
    expect(parseMonto("500000")).toEqual({ ok: true, valor: 500000 });
    expect(parseMonto("20 mil")).toEqual({ ok: true, valor: 20000 });
    expect(parseMonto("20 MIL")).toEqual({ ok: true, valor: 20000 });
    expect(parseMonto("$2.000.000")).toEqual({ ok: true, valor: 2000000 });
    expect(parseMonto("18k")).toEqual({ ok: true, valor: 18000 });
    expect(parseMonto("50.000.000")).toEqual({ ok: true, valor: 50000000 });
  });
  it("valida el rango", () => {
    expect(parseMonto("0")).toEqual({ ok: false, error: RANGO });
    expect(parseMonto("50000001")).toEqual({ ok: false, error: RANGO });
  });
  it("rechaza lo que no es monto", () => {
    expect(parseMonto("abc")).toEqual({ ok: false, error: "No entendí el monto." });
    expect(parseMonto("")).toEqual({ ok: false, error: "No entendí el monto." });
    expect(parseMonto("20 30")).toEqual({ ok: false, error: "No entendí el monto." });
  });
});

describe("validarRango", () => {
  it("acepta de 1 a 50.000.000", () => {
    expect(validarRango(1)).toEqual({ ok: true, valor: 1 });
    expect(validarRango(50_000_000)).toEqual({ ok: true, valor: 50_000_000 });
    expect(validarRango(0)).toEqual({ ok: false, error: RANGO });
  });
});
