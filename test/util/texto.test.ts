import { describe, expect, it } from "vitest";
import { contienePalabra, normalizar } from "../../src/util/texto";

describe("normalizar", () => {
  it("pasa a minúsculas, quita tildes y colapsa espacios", () => {
    expect(normalizar("  Almuerzo   CON  Láu ")).toBe("almuerzo con lau");
    expect(normalizar("Educación\tÑoño")).toBe("educacion nono");
  });
});

describe("contienePalabra", () => {
  it("encuentra palabras completas y devuelve su índice", () => {
    expect(contienePalabra("regalo lau", "lau")).toBe(7);
    expect(contienePalabra("lau", "lau")).toBe(0);
    expect(contienePalabra("cena (lau)", "lau")).toBe(6);
  });
  it("no coincide dentro de otras palabras", () => {
    expect(contienePalabra("laura", "lau")).toBe(-1);
    expect(contienePalabra("motor", "moto")).toBe(-1);
    expect(contienePalabra("motos", "moto")).toBe(-1);
    expect(contienePalabra("2moto", "moto")).toBe(-1);
  });
});
