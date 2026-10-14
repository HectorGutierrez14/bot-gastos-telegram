import { normalizar } from "../util/texto";

/** "/Informe@MiBot mes pasado" → { nombre: "informe", args: "mes pasado" }. Solo con "/". */
export function parseComando(texto: string): { nombre: string; args: string } | null {
  const m = /^\/([^\s@]+)(?:@\S+)?(?:\s+([\s\S]*))?$/.exec(texto.trim());
  if (!m) return null;
  return { nombre: normalizar(m[1]), args: (m[2] ?? "").trim() };
}
