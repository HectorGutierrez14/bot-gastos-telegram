import { describe, expect, it } from "vitest";
import { parseComando } from "../../src/parse/comando";

describe("parseComando", () => {
  it("normaliza el nombre y conserva los argumentos", () => {
    expect(parseComando("/Categorías")).toEqual({ nombre: "categorias", args: "" });
    expect(parseComando("/informe@MiBot mes pasado")).toEqual({ nombre: "informe", args: "mes pasado" });
    expect(parseComando("  /olvidar   Almuerzo con Jefe ")).toEqual({ nombre: "olvidar", args: "Almuerzo con Jefe" });
    expect(parseComando("/TOPE 2.000.000")).toEqual({ nombre: "tope", args: "2.000.000" });
  });
  it("sin barra no es comando", () => {
    expect(parseComando("informe mes")).toBeNull();
    expect(parseComando("/")).toBeNull();
  });
});
