import { describe, expect, it, vi } from "vitest";
import type { Categoria, CategoriaIA } from "../src/categorias";
import { clasificar } from "../src/clasificar";

function deps(aprendido: Record<string, Categoria> = {}, ia: CategoriaIA | null = "Comida") {
  return {
    buscarAprendido: vi.fn(async (norm: string) => aprendido[norm] ?? null),
    clasificarIA: vi.fn(async (_c: string) => ia),
  };
}

describe("clasificar", () => {
  it("la regla fija gana sin consultar a nadie", async () => {
    const d = deps();
    expect(await clasificar("gasolina moto", d)).toEqual({ categoria: "Moto", fuente: "regla" });
    expect(d.buscarAprendido).not.toHaveBeenCalled();
    expect(d.clasificarIA).not.toHaveBeenCalled();
  });

  it("lo aprendido nunca sobrescribe la regla", async () => {
    const d = deps({ "regalo lau": "Comida" });
    expect(await clasificar("regalo Lau", d)).toEqual({ categoria: "Lau", fuente: "regla" });
  });

  it("usa lo aprendido con el concepto normalizado y no llama a la IA", async () => {
    const d = deps({ "almuerzo con jefe": "Comida" });
    expect(await clasificar("Almuerzo  con Jéfe", d)).toEqual({ categoria: "Comida", fuente: "aprendida" });
    expect(d.buscarAprendido).toHaveBeenCalledWith("almuerzo con jefe");
    expect(d.clasificarIA).not.toHaveBeenCalled();
  });

  it("si no hay regla ni aprendido, consulta la IA solo con el concepto", async () => {
    const d = deps({}, "Transporte");
    expect(await clasificar("uber", d)).toEqual({ categoria: "Transporte", fuente: "ia" });
    expect(d.clasificarIA).toHaveBeenCalledWith("uber");
  });

  it("si la IA falla queda en Otros con fuente fallback", async () => {
    expect(await clasificar("uber", deps({}, null))).toEqual({ categoria: "Otros", fuente: "fallback" });
  });
});
