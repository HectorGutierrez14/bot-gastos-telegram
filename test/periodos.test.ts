import { describe, expect, it } from "vitest";
import {
  mesActual,
  mesNombrado,
  mesPasado,
  parsePeriodo,
  rangoComparacion,
  semanaActual,
  semanaPasada,
} from "../src/periodos";

const HOY = "2026-10-14"; // miércoles

describe("semanas", () => {
  it("semana actual en curso, de lunes a domingo", () => {
    expect(semanaActual(HOY)).toEqual({
      tipo: "semana",
      desde: "2026-10-12",
      hasta: "2026-10-18",
      corte: "2026-10-14",
      enCurso: true,
      etiqueta: "semana del 12/10 al 18/10/2026",
      clave: "2026-10-12",
    });
    expect(rangoComparacion(semanaActual(HOY))).toEqual({ desde: "2026-10-05", hasta: "2026-10-07" });
  });

  it("semana pasada cerrada", () => {
    const p = semanaPasada(HOY);
    expect(p).toMatchObject({ desde: "2026-10-05", hasta: "2026-10-11", corte: "2026-10-11", enCurso: false });
    expect(rangoComparacion(p)).toEqual({ desde: "2026-09-28", hasta: "2026-10-04" });
  });

  it("semana que cruza el año", () => {
    expect(semanaActual("2027-01-02")).toMatchObject({ desde: "2026-12-28", hasta: "2027-01-03" });
  });
});

describe("meses", () => {
  it("mes actual en curso compara con el mismo corte", () => {
    const p = mesActual(HOY);
    expect(p).toEqual({
      tipo: "mes",
      desde: "2026-10-01",
      hasta: "2026-10-31",
      corte: "2026-10-14",
      enCurso: true,
      etiqueta: "octubre 2026",
      clave: "2026-10",
    });
    expect(rangoComparacion(p)).toEqual({ desde: "2026-09-01", hasta: "2026-09-14" });
  });

  it("mes pasado cerrado compara con el mes anterior completo", () => {
    const p = mesPasado(HOY);
    expect(p).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-30", enCurso: false, clave: "2026-09" });
    expect(rangoComparacion(p)).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" });
  });

  it("si el mes anterior es más corto, el corte se limita a su último día", () => {
    expect(rangoComparacion(mesActual("2026-03-31"))).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });

  it("mes pasado en enero es diciembre del año anterior", () => {
    expect(mesPasado("2027-01-02")).toMatchObject({ clave: "2026-12", etiqueta: "diciembre 2026" });
  });

  it("mes nombrado sin año: año actual, o anterior si aún no empieza", () => {
    expect(mesNombrado("diciembre", undefined, HOY)?.clave).toBe("2025-12");
    expect(mesNombrado("Septiembre", undefined, HOY)?.clave).toBe("2026-09");
    expect(mesNombrado("setiembre", 2025, HOY)?.clave).toBe("2025-09");
    expect(mesNombrado("octubre", undefined, HOY)?.enCurso).toBe(true);
    expect(mesNombrado("xyz", undefined, HOY)).toBeNull();
  });
});

describe("parsePeriodo", () => {
  it.each([
    ["", "2026-10"],
    ["mes", "2026-10"],
    ["Mes Pasado", "2026-09"],
    ["semana", "2026-10-12"],
    ["semana pasada", "2026-10-05"],
    ["septiembre 2026", "2026-09"],
    ["Octubre", "2026-10"],
  ])("%s → %s", (args, clave) => {
    expect(parsePeriodo(args, HOY)?.clave).toBe(clave);
  });

  it.each(["xyz", "septiembre abc", "mes futuro", "noviembre 2026", "enero 1999 x"])("%s → null", (args) => {
    expect(parsePeriodo(args, HOY)).toBeNull();
  });
});
