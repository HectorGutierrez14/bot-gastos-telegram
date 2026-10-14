import { describe, expect, it } from "vitest";
import { parseFechaToken } from "../../src/parse/fecha";

const HOY = "2026-10-14";
const ok = (valor: string) => ({ ok: true, valor });
const err = (error: string) => ({ ok: false, error });

describe("parseFechaToken", () => {
  it.each([
    ["hoy", HOY, "2026-10-14"],
    ["Ayer", HOY, "2026-10-13"],
    ["anteayer", HOY, "2026-10-12"],
    ["12/10", HOY, "2026-10-12"],
    ["20/12", HOY, "2025-12-20"],
    ["1/1", "2027-01-05", "2027-01-01"],
    ["31/12", "2027-01-05", "2026-12-31"],
    ["05/10/2026", HOY, "2026-10-05"],
    ["14/10/2025", HOY, "2025-10-14"],
  ])("%s (hoy %s) → %s", (token, hoy, esperado) => {
    expect(parseFechaToken(token, hoy)).toEqual(ok(esperado));
  });

  it("rechaza fechas inexistentes repitiendo el token", () => {
    expect(parseFechaToken("31/02", HOY)).toEqual(err("La fecha 31/02 no existe."));
    expect(parseFechaToken("29/02/2026", HOY)).toEqual(err("La fecha 29/02/2026 no existe."));
    expect(parseFechaToken("10/13", HOY)).toEqual(err("La fecha 10/13 no existe."));
  });

  it("rechaza fechas futuras", () => {
    expect(parseFechaToken("15/10/2026", HOY)).toEqual(err("No puedo registrar fechas futuras (15/10/2026)."));
  });

  it("rechaza fechas de hace más de 365 días", () => {
    expect(parseFechaToken("13/10/2025", HOY)).toEqual(err("Solo puedo registrar fechas de los últimos 365 días."));
  });

  it.each(["almuerzo", "35000", "12/10/26", "1/2/3", ""])("%s no es fecha", (token) => {
    expect(parseFechaToken(token, HOY)).toBeNull();
  });
});
