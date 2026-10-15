import { describe, expect, it } from "vitest";
import {
  diaSemana,
  diferenciaDias,
  fechaCorta,
  fechaLarga,
  hoyBogota,
  mesDe,
  sumarDias,
  ultimoDiaMes,
} from "../../src/util/fechas";

describe("fechas Bogotá", () => {
  it("hoyBogota resta 5 horas a UTC", () => {
    expect(hoyBogota(new Date("2026-10-14T03:00:00Z"))).toBe("2026-10-13");
    expect(hoyBogota(new Date("2026-10-14T04:59:59Z"))).toBe("2026-10-13");
    expect(hoyBogota(new Date("2026-10-14T05:00:00Z"))).toBe("2026-10-14");
    expect(hoyBogota(new Date("2027-01-01T02:00:00Z"))).toBe("2026-12-31");
  });
  it("sumarDias cruza meses y años", () => {
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("diaSemana: 1 = lunes, 7 = domingo", () => {
    expect(diaSemana("2026-10-14")).toBe(3);
    expect(diaSemana("2026-10-12")).toBe(1);
    expect(diaSemana("2026-10-18")).toBe(7);
  });
  it("ultimoDiaMes contempla bisiestos", () => {
    expect(ultimoDiaMes(2028, 2)).toBe(29);
    expect(ultimoDiaMes(2026, 2)).toBe(28);
    expect(ultimoDiaMes(2026, 12)).toBe(31);
  });
  it("formatos cortos y largos", () => {
    expect(fechaCorta("2026-10-13")).toBe("13/10");
    expect(fechaLarga("2026-01-05")).toBe("05/01/2026");
    expect(mesDe("2026-10-13")).toBe("2026-10");
  });
  it("diferenciaDias", () => {
    expect(diferenciaDias("2025-10-14", "2026-10-14")).toBe(365);
    expect(diferenciaDias("2026-10-14", "2026-10-12")).toBe(-2);
  });
});
