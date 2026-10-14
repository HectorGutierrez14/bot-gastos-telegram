/** Alias de tarjetas desde TARJETAS_CREDITO ("nu,rappi"), en minúsculas y sin vacíos. */
export function parseTarjetas(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function nombreTarjeta(alias: string): string {
  if (alias === "sin_definir") return "TC por definir";
  return `TC ${alias.charAt(0).toUpperCase()}${alias.slice(1)}`;
}
