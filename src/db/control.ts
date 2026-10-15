async function insertarSiNoExiste(stmt: D1PreparedStatement): Promise<boolean> {
  const r = await stmt.run();
  return r.meta.changes === 1;
}

/** true si es la primera vez que se registra la alerta de ese periodo y umbral. */
export function registrarAlerta(db: D1Database, periodo: string, umbral: 80 | 100, utc: string): Promise<boolean> {
  return insertarSiNoExiste(
    db.prepare("INSERT OR IGNORE INTO alertas_enviadas (periodo, umbral, enviado_utc) VALUES (?, ?, ?)").bind(periodo, umbral, utc),
  );
}

export async function borrarAlertas(db: D1Database, periodo: string) {
  await db.prepare("DELETE FROM alertas_enviadas WHERE periodo = ?").bind(periodo).run();
}

/** true si el informe de ese periodo no se había enviado. */
export function marcarInformeEnviado(db: D1Database, periodo: string, utc: string): Promise<boolean> {
  return insertarSiNoExiste(
    db.prepare("INSERT OR IGNORE INTO informes_enviados (periodo, enviado_utc) VALUES (?, ?)").bind(periodo, utc),
  );
}

/** true si el update no se había procesado. */
export function marcarUpdate(db: D1Database, updateId: number, utc: string): Promise<boolean> {
  return insertarSiNoExiste(
    db.prepare("INSERT OR IGNORE INTO updates_procesados (update_id, recibido_utc) VALUES (?, ?)").bind(updateId, utc),
  );
}

export async function limpiarUpdates(db: D1Database, antesDeUtc: string) {
  await db.prepare("DELETE FROM updates_procesados WHERE recibido_utc < ?").bind(antesDeUtc).run();
}
