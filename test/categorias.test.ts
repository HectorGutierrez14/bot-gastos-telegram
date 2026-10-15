import { describe, expect, it } from "vitest";
import { buscarCategoria, CATEGORIAS, CATEGORIAS_IA, reglaFija } from "../src/categorias";
import { nombreTarjeta, parseTarjetas } from "../src/tarjetas";

describe("reglaFija", () => {
  it.each([
    ["regalo Lau", "Lau"],
    ["LÁU cena", "Lau"],
    ["gasolina moto", "Moto"],
    ["arriendo apto", "Apto"],
    ["Apto 302 admin", "Apto"],
    ["moto de lau", "Moto"],
    ["lau moto", "Lau"],
    ["apto lau", "Apto"],
    ["cena (Lau)", "Lau"],
  ])("%s → %s", (concepto, cat) => {
    expect(reglaFija(concepto)).toBe(cat);
  });

  it.each(["Laura", "motor", "motos", "motocicleta", "aptos", "apartamento", "adapto", "almuerzo"])("%s → null", (c) => {
    expect(reglaFija(c)).toBeNull();
  });
});

describe("categorías", () => {
  it("16 categorías en orden fijo, las fijas al final", () => {
    expect(CATEGORIAS.length).toBe(16);
    expect(CATEGORIAS.slice(13)).toEqual(["Lau", "Moto", "Apto"]);
    expect(CATEGORIAS_IA).not.toContain("Lau");
    expect(CATEGORIAS_IA).toContain("Financieros");
  });

  it("buscarCategoria ignora mayúsculas y tildes", () => {
    expect(buscarCategoria("educacion")).toBe("Educación");
    expect(buscarCategoria("APTO")).toBe("Apto");
    expect(buscarCategoria(" comida ")).toBe("Comida");
    expect(buscarCategoria("xyz")).toBeNull();
  });
});

describe("tarjetas", () => {
  it("parseTarjetas normaliza espacios y mayúsculas", () => {
    expect(parseTarjetas(" Nu , RAPPI ,")).toEqual(["nu", "rappi"]);
    expect(parseTarjetas("")).toEqual([]);
    expect(parseTarjetas("Éxito, Nu")).toEqual(["exito", "nu"]);
  });
  it("nombreTarjeta", () => {
    expect(nombreTarjeta("rappi")).toBe("TC Rappi");
    expect(nombreTarjeta("nu")).toBe("TC Nu");
    expect(nombreTarjeta("sin_definir")).toBe("TC por definir");
  });
});
