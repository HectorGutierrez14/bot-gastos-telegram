const CLAVE_TOPE = "tope_mensual";

export async function getTope(db: D1Database): Promise<number | null> {
  const r = await db.prepare("SELECT valor FROM config WHERE clave = ?").bind(CLAVE_TOPE).first<{ valor: string }>();
  return r ? Number(r.valor) : null;
}

export async function setTope(db: D1Database, monto: number) {
  await db
    .prepare("INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor")
    .bind(CLAVE_TOPE, String(monto))
    .run();
}

export async function borrarTope(db: D1Database) {
  await db.prepare("DELETE FROM config WHERE clave = ?").bind(CLAVE_TOPE).run();
}
