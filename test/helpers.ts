const TABLAS = [
  "gastos",
  "pagos_tarjeta",
  "saldos_iniciales_tarjeta",
  "aprendizaje",
  "config",
  "alertas_enviadas",
  "informes_enviados",
  "updates_procesados",
];

export async function limpiarDB(db: D1Database): Promise<void> {
  await db.batch(TABLAS.map((t) => db.prepare(`DELETE FROM ${t}`)));
}
