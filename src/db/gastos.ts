import type { Fuente, Gasto } from "../tipos";

export async function insertarGasto(db: D1Database, g: Omit<Gasto, "id">): Promise<number | null> {
  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO gastos (telegram_update_id, linea, fecha_gasto, registrado_utc, monto, concepto,
        categoria, tarjeta, pago_ajuste_id, fuente_clasificacion, texto_original)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      g.telegram_update_id,
      g.linea,
      g.fecha_gasto,
      g.registrado_utc,
      g.monto,
      g.concepto,
      g.categoria,
      g.tarjeta,
      g.pago_ajuste_id,
      g.fuente_clasificacion,
      g.texto_original,
    )
    .first<{ id: number }>();
  return r?.id ?? null;
}

export function obtenerGasto(db: D1Database, id: number): Promise<Gasto | null> {
  return db.prepare("SELECT * FROM gastos WHERE id = ?").bind(id).first<Gasto>();
}

export async function actualizarCategoria(db: D1Database, id: number, categoria: string, fuente: Fuente) {
  await db.prepare("UPDATE gastos SET categoria = ?, fuente_clasificacion = ? WHERE id = ?").bind(categoria, fuente, id).run();
}

export async function actualizarTarjeta(db: D1Database, id: number, tarjeta: string | null) {
  await db.prepare("UPDATE gastos SET tarjeta = ? WHERE id = ?").bind(tarjeta, id).run();
}

export async function borrarGasto(db: D1Database, id: number) {
  await db.prepare("DELETE FROM gastos WHERE id = ?").bind(id).run();
}

/** Gastos con fecha entre `desde` y `hasta` (inclusive). */
export async function gastosEntre(db: D1Database, desde: string, hasta: string): Promise<Gasto[]> {
  const r = await db
    .prepare("SELECT * FROM gastos WHERE fecha_gasto BETWEEN ? AND ? ORDER BY fecha_gasto, registrado_utc, id")
    .bind(desde, hasta)
    .all<Gasto>();
  return r.results;
}

export async function totalEntre(db: D1Database, desde: string, hasta: string): Promise<number> {
  const r = await db
    .prepare("SELECT COALESCE(SUM(monto), 0) AS total FROM gastos WHERE fecha_gasto BETWEEN ? AND ?")
    .bind(desde, hasta)
    .first<{ total: number }>();
  return r?.total ?? 0;
}

export function ultimoGasto(db: D1Database): Promise<Gasto | null> {
  return db.prepare("SELECT * FROM gastos ORDER BY registrado_utc DESC, id DESC LIMIT 1").first<Gasto>();
}

export async function contarSinDefinir(db: D1Database): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM gastos WHERE tarjeta = 'sin_definir'").first<{ n: number }>();
  return r?.n ?? 0;
}

/** Suma de compras con la tarjeta (incluye ajustes); todo el historial si no hay rango. */
export async function comprasTarjeta(db: D1Database, alias: string, desde?: string, hasta?: string): Promise<number> {
  const r = await db
    .prepare(
      `SELECT COALESCE(SUM(monto), 0) AS total FROM gastos
       WHERE tarjeta = ? AND fecha_gasto BETWEEN ? AND ?`,
    )
    .bind(alias, desde ?? "0000-01-01", hasta ?? "9999-12-31")
    .first<{ total: number }>();
  return r?.total ?? 0;
}

export function gastoDeAjuste(db: D1Database, pagoId: number): Promise<Gasto | null> {
  return db.prepare("SELECT * FROM gastos WHERE pago_ajuste_id = ? LIMIT 1").bind(pagoId).first<Gasto>();
}
