/** Minúsculas, sin tildes, espacios colapsados y sin espacios en los extremos. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Índice de la primera aparición de `palabra` como palabra completa dentro de
 * un texto ya normalizado, o -1. El límite de palabra es el inicio/fin del
 * texto o cualquier carácter fuera de [a-z0-9].
 */
export function contienePalabra(normalizado: string, palabra: string): number {
  const re = new RegExp(`(^|[^a-z0-9])${palabra}(?=$|[^a-z0-9])`);
  const m = re.exec(normalizado);
  return m ? m.index + m[1].length : -1;
}

/** Recorta a `max` caracteres (contando el "…" final) para no pasar el límite de Telegram en listas. */
export function recortar(s: string, max: number): string {
  const chars = [...s];
  return chars.length <= max ? s : `${chars.slice(0, max - 1).join("")}…`;
}
