import type { Gasto, PagoTarjeta } from "../tipos";
import { ultimoGasto } from "./gastos";

export async function insertarPago(
  db: D1Database,
  p: Omit<PagoTarjeta, "id" | "ajuste_resuelto">,
): Promise<number | null> {
  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO pagos_tarjeta (telegram_update_id, tarjeta, monto, fecha_pago, registrado_utc)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(p.telegram_update_id, p.tarjeta, p.monto, p.fecha_pago, p.registrado_utc)
    .first<{ id: number }>();
  return r?.id ?? null;
}

export function obtenerPago(db: D1Database, id: number): Promise<PagoTarjeta | null> {
  return db.prepare("SELECT * FROM pagos_tarjeta WHERE id = ?").bind(id).first<PagoTarjeta>();
}

export async function borrarPago(db: D1Database, id: number) {
  await db.prepare("DELETE FROM pagos_tarjeta WHERE id = ?").bind(id).run();
}

export async function pagosEntre(db: D1Database, desde: string, hasta: string): Promise<PagoTarjeta[]> {
  const r = await db
    .prepare("SELECT * FROM pagos_tarjeta WHERE fecha_pago BETWEEN ? AND ? ORDER BY fecha_pago, registrado_utc, id")
    .bind(desde, hasta)
    .all<PagoTarjeta>();
  return r.results;
}

export async function totalPagos(db: D1Database, alias: string, desde?: string, hasta?: string): Promise<number> {
  const r = await db
    .prepare(
      `SELECT COALESCE(SUM(monto), 0) AS total FROM pagos_tarjeta
       WHERE tarjeta = ? AND fecha_pago BETWEEN ? AND ?`,
    )
    .bind(alias, desde ?? "0000-01-01", hasta ?? "9999-12-31")
    .first<{ total: number }>();
  return r?.total ?? 0;
}

/** Marca el ajuste como resuelto; false si ya lo estaba (los botones funcionan una sola vez). */
export async function marcarAjusteResuelto(db: D1Database, id: number): Promise<boolean> {
  const r = await db
    .prepare("UPDATE pagos_tarjeta SET ajuste_resuelto = 1 WHERE id = ? AND ajuste_resuelto = 0")
    .bind(id)
    .run();
  return r.meta.changes === 1;
}

export async function reabrirAjuste(db: D1Database, id: number) {
  await db.prepare("UPDATE pagos_tarjeta SET ajuste_resuelto = 0 WHERE id = ?").bind(id).run();
}

export function ultimoPago(db: D1Database): Promise<PagoTarjeta | null> {
  return db.prepare("SELECT * FROM pagos_tarjeta ORDER BY registrado_utc DESC, id DESC LIMIT 1").first<PagoTarjeta>();
}

export async function getSaldoInicial(db: D1Database, alias: string): Promise<number> {
  const r = await db
    .prepare("SELECT monto FROM saldos_iniciales_tarjeta WHERE tarjeta = ?")
    .bind(alias)
    .first<{ monto: number }>();
  return r?.monto ?? 0;
}

export async function setSaldoInicial(db: D1Database, alias: string, monto: number, utc: string) {
  await db
    .prepare(
      `INSERT INTO saldos_iniciales_tarjeta (tarjeta, monto, actualizado_utc) VALUES (?, ?, ?)
       ON CONFLICT (tarjeta) DO UPDATE SET monto = excluded.monto, actualizado_utc = excluded.actualizado_utc`,
    )
    .bind(alias, monto, utc)
    .run();
}

export type Movimiento = { tipo: "gasto"; gasto: Gasto } | { tipo: "pago"; pago: PagoTarjeta };

/** Último gasto o pago por registrado_utc; en empate gana el gasto. */
export async function ultimoMovimiento(db: D1Database): Promise<Movimiento | null> {
  const [gasto, pago] = await Promise.all([ultimoGasto(db), ultimoPago(db)]);
  if (pago && (!gasto || pago.registrado_utc > gasto.registrado_utc)) return { tipo: "pago", pago };
  return gasto ? { tipo: "gasto", gasto } : null;
}
