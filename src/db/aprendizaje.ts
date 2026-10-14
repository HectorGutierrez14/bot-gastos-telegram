import type { Categoria } from "../categorias";

export async function buscarAprendido(db: D1Database, norm: string): Promise<Categoria | null> {
  const r = await db
    .prepare("SELECT categoria FROM aprendizaje WHERE concepto_normalizado = ?")
    .bind(norm)
    .first<{ categoria: Categoria }>();
  return r?.categoria ?? null;
}

export async function aprender(db: D1Database, norm: string, categoria: Categoria, utc: string) {
  await db
    .prepare(
      `INSERT INTO aprendizaje (concepto_normalizado, categoria, actualizado_utc) VALUES (?, ?, ?)
       ON CONFLICT (concepto_normalizado) DO UPDATE SET categoria = excluded.categoria, actualizado_utc = excluded.actualizado_utc`,
    )
    .bind(norm, categoria, utc)
    .run();
}

export async function listarAprendidos(
  db: D1Database,
  limite = 50,
): Promise<{ concepto_normalizado: string; categoria: string }[]> {
  const r = await db
    .prepare("SELECT concepto_normalizado, categoria FROM aprendizaje ORDER BY actualizado_utc DESC LIMIT ?")
    .bind(limite)
    .all<{ concepto_normalizado: string; categoria: string }>();
  return r.results;
}

export async function olvidar(db: D1Database, norm: string): Promise<boolean> {
  const r = await db.prepare("DELETE FROM aprendizaje WHERE concepto_normalizado = ?").bind(norm).run();
  return r.meta.changes > 0;
}
