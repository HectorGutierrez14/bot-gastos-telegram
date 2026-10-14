/** Formato COP: $1.234.567 (negativos como -$40.000). */
export function formatCOP(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const miles = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}$${miles}`;
}

/** Variación de `actual` respecto a `anterior`: "▲ +$120.000 (+15%)". Sin % si anterior es 0. */
export function formatVariacion(actual: number, anterior: number): string {
  const diff = actual - anterior;
  const pct = anterior === 0 ? null : Math.round((diff * 100) / anterior);
  const sufijo = pct === null ? "" : ` (${pct > 0 ? "+" : ""}${pct}%)`;
  if (diff > 0) return `▲ +${formatCOP(diff)}${sufijo}`;
  if (diff < 0) return `▼ ${formatCOP(diff)}${sufijo}`;
  return `= $0${sufijo}`;
}
