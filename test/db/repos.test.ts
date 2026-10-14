import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { aprender, buscarAprendido, listarAprendidos, olvidar } from "../../src/db/aprendizaje";
import { borrarTope, getTope, setTope } from "../../src/db/config";
import {
  borrarAlertas,
  limpiarUpdates,
  marcarInformeEnviado,
  marcarUpdate,
  registrarAlerta,
} from "../../src/db/control";
import {
  actualizarCategoria,
  actualizarTarjeta,
  borrarGasto,
  comprasTarjeta,
  contarSinDefinir,
  gastoDeAjuste,
  gastosEntre,
  insertarGasto,
  obtenerGasto,
  totalEntre,
  ultimoGasto,
} from "../../src/db/gastos";
import {
  borrarPago,
  getSaldoInicial,
  insertarPago,
  marcarAjusteResuelto,
  obtenerPago,
  pagosEntre,
  reabrirAjuste,
  setSaldoInicial,
  totalPagos,
  ultimoMovimiento,
} from "../../src/db/pagos";
import type { Gasto } from "../../src/tipos";
import { limpiarDB } from "../helpers";

const db = env.DB;
let n = 0;

function gasto(over: Partial<Omit<Gasto, "id">> = {}): Omit<Gasto, "id"> {
  n++;
  return {
    telegram_update_id: n,
    linea: 0,
    fecha_gasto: "2026-10-14",
    registrado_utc: `2026-10-14T10:00:${String(n % 60).padStart(2, "0")}.000Z`,
    monto: 1000,
    concepto: "almuerzo",
    categoria: "Comida",
    tarjeta: null,
    pago_ajuste_id: null,
    fuente_clasificacion: "ia",
    texto_original: "1000 almuerzo",
    ...over,
  };
}

beforeEach(() => limpiarDB(db));

describe("gastos", () => {
  it("insertar el mismo (update_id, linea) dos veces devuelve null la segunda", async () => {
    const g = gasto();
    expect(await insertarGasto(db, g)).toBeTypeOf("number");
    expect(await insertarGasto(db, g)).toBeNull();
    expect(await insertarGasto(db, { ...g, linea: 1 })).toBeTypeOf("number");
  });

  it("obtener, actualizar y borrar", async () => {
    const id = (await insertarGasto(db, gasto()))!;
    await actualizarCategoria(db, id, "Transporte", "manual");
    await actualizarTarjeta(db, id, "nu");
    expect(await obtenerGasto(db, id)).toMatchObject({ categoria: "Transporte", fuente_clasificacion: "manual", tarjeta: "nu" });
    await borrarGasto(db, id);
    expect(await obtenerGasto(db, id)).toBeNull();
  });

  it("gastosEntre y totalEntre incluyen los extremos", async () => {
    await insertarGasto(db, gasto({ fecha_gasto: "2026-09-30", monto: 1 }));
    await insertarGasto(db, gasto({ fecha_gasto: "2026-10-01", monto: 10 }));
    await insertarGasto(db, gasto({ fecha_gasto: "2026-10-31", monto: 100 }));
    await insertarGasto(db, gasto({ fecha_gasto: "2026-11-01", monto: 1000 }));
    expect((await gastosEntre(db, "2026-10-01", "2026-10-31")).map((g) => g.monto)).toEqual([10, 100]);
    expect(await totalEntre(db, "2026-10-01", "2026-10-31")).toBe(110);
    expect(await totalEntre(db, "2025-01-01", "2025-01-31")).toBe(0);
  });

  it("ultimoGasto por registrado_utc", async () => {
    await insertarGasto(db, gasto({ registrado_utc: "2026-10-14T10:00:05.000Z", concepto: "b" }));
    await insertarGasto(db, gasto({ registrado_utc: "2026-10-14T10:00:01.000Z", concepto: "a" }));
    expect((await ultimoGasto(db))?.concepto).toBe("b");
  });

  it("compras por tarjeta, sin definir y gasto de ajuste", async () => {
    await insertarGasto(db, gasto({ tarjeta: "nu", monto: 100 }));
    await insertarGasto(db, gasto({ tarjeta: "nu", monto: 50, fecha_gasto: "2026-09-01" }));
    await insertarGasto(db, gasto({ tarjeta: "sin_definir", monto: 7 }));
    await insertarGasto(db, gasto({ tarjeta: "nu", monto: 5, pago_ajuste_id: 42 }));
    expect(await comprasTarjeta(db, "nu")).toBe(155);
    expect(await comprasTarjeta(db, "nu", "2026-10-01", "2026-10-31")).toBe(105);
    expect(await contarSinDefinir(db)).toBe(1);
    expect((await gastoDeAjuste(db, 42))?.monto).toBe(5);
    expect(await gastoDeAjuste(db, 43)).toBeNull();
  });
});

describe("pagos", () => {
  const pago = (over = {}) => ({
    telegram_update_id: 900 + n++,
    tarjeta: "nu",
    monto: 1000,
    fecha_pago: "2026-10-14",
    registrado_utc: "2026-10-14T10:00:01.000Z",
    ...over,
  });

  it("insertar, idempotencia, totales y borrar", async () => {
    const p = pago();
    const id = (await insertarPago(db, p))!;
    expect(await insertarPago(db, p)).toBeNull();
    expect(await obtenerPago(db, id)).toMatchObject({ monto: 1000, ajuste_resuelto: 0 });
    await insertarPago(db, pago({ fecha_pago: "2026-09-01", monto: 1 }));
    expect(await totalPagos(db, "nu")).toBe(1001);
    expect(await totalPagos(db, "nu", "2026-10-01", "2026-10-31")).toBe(1000);
    expect((await pagosEntre(db, "2026-10-01", "2026-10-31")).length).toBe(1);
    await borrarPago(db, id);
    expect(await obtenerPago(db, id)).toBeNull();
  });

  it("marcarAjusteResuelto solo funciona una vez y reabrirAjuste lo revierte", async () => {
    const id = (await insertarPago(db, pago()))!;
    expect(await marcarAjusteResuelto(db, id)).toBe(true);
    expect(await marcarAjusteResuelto(db, id)).toBe(false);
    await reabrirAjuste(db, id);
    expect(await marcarAjusteResuelto(db, id)).toBe(true);
  });

  it("saldo inicial por defecto 0 y reemplazable", async () => {
    expect(await getSaldoInicial(db, "nu")).toBe(0);
    await setSaldoInicial(db, "nu", 500, "2026-10-14T10:00:00.000Z");
    await setSaldoInicial(db, "nu", 700, "2026-10-14T10:00:01.000Z");
    expect(await getSaldoInicial(db, "nu")).toBe(700);
  });

  it("ultimoMovimiento compara gastos y pagos; empate → gasto", async () => {
    expect(await ultimoMovimiento(db)).toBeNull();
    await insertarGasto(db, gasto({ registrado_utc: "2026-10-14T10:00:00.000Z" }));
    await insertarPago(db, pago({ registrado_utc: "2026-10-14T10:00:01.000Z" }));
    expect((await ultimoMovimiento(db))?.tipo).toBe("pago");
    await insertarGasto(db, gasto({ registrado_utc: "2026-10-14T10:00:01.000Z" }));
    expect((await ultimoMovimiento(db))?.tipo).toBe("gasto");
  });
});

describe("aprendizaje y config", () => {
  it("upsert, listado ordenado con límite y olvidar", async () => {
    await aprender(db, "almuerzo", "Comida", "2026-10-14T10:00:00.000Z");
    await aprender(db, "almuerzo", "Transporte", "2026-10-14T10:00:02.000Z");
    await aprender(db, "uber", "Transporte", "2026-10-14T10:00:01.000Z");
    expect(await buscarAprendido(db, "almuerzo")).toBe("Transporte");
    expect(await listarAprendidos(db)).toEqual([
      { concepto_normalizado: "almuerzo", categoria: "Transporte" },
      { concepto_normalizado: "uber", categoria: "Transporte" },
    ]);
    expect((await listarAprendidos(db, 1)).length).toBe(1);
    expect(await olvidar(db, "uber")).toBe(true);
    expect(await olvidar(db, "uber")).toBe(false);
    expect(await buscarAprendido(db, "uber")).toBeNull();
  });

  it("tope mensual", async () => {
    expect(await getTope(db)).toBeNull();
    await setTope(db, 2000000);
    expect(await getTope(db)).toBe(2000000);
    await borrarTope(db);
    expect(await getTope(db)).toBeNull();
  });
});

describe("control", () => {
  it("alertas una vez por periodo y umbral", async () => {
    expect(await registrarAlerta(db, "2026-10", 80, "x")).toBe(true);
    expect(await registrarAlerta(db, "2026-10", 80, "x")).toBe(false);
    expect(await registrarAlerta(db, "2026-10", 100, "x")).toBe(true);
    await borrarAlertas(db, "2026-10");
    expect(await registrarAlerta(db, "2026-10", 80, "x")).toBe(true);
  });

  it("informes enviados y updates procesados", async () => {
    expect(await marcarInformeEnviado(db, "2026-09", "x")).toBe(true);
    expect(await marcarInformeEnviado(db, "2026-09", "x")).toBe(false);
    expect(await marcarUpdate(db, 1, "2026-09-01T00:00:00.000Z")).toBe(true);
    expect(await marcarUpdate(db, 1, "2026-09-01T00:00:00.000Z")).toBe(false);
    await marcarUpdate(db, 2, "2026-10-10T00:00:00.000Z");
    await limpiarUpdates(db, "2026-10-01T00:00:00.000Z");
    expect(await marcarUpdate(db, 1, "x")).toBe(true);
    expect(await marcarUpdate(db, 2, "x")).toBe(false);
  });
});
