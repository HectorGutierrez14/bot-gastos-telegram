import { comprasTarjeta } from "./db/gastos";
import { getSaldoInicial, totalPagos } from "./db/pagos";
import { normalizar } from "./util/texto";

/** Alias de tarjetas desde TARJETAS_CREDITO ("nu,rappi"), normalizados (sin tildes ni mayúsculas) y sin vacíos. */
export function parseTarjetas(raw: string): string[] {
  return raw.split(",").map(normalizar).filter(Boolean);
}

export function nombreTarjeta(alias: string): string {
  if (alias === "sin_definir") return "TC por definir";
  return `TC ${alias.charAt(0).toUpperCase()}${alias.slice(1)}`;
}

export interface SaldoTarjeta {
  inicial: number;
  compras: number;
  pagos: number;
  saldo: number;
}

/** saldo = saldo inicial + compras (incluye ajustes) − pagos, todo el historial. */
export async function calcularSaldo(db: D1Database, alias: string): Promise<SaldoTarjeta> {
  const [inicial, compras, pagos] = await Promise.all([
    getSaldoInicial(db, alias),
    comprasTarjeta(db, alias),
    totalPagos(db, alias),
  ]);
  return { inicial, compras, pagos, saldo: inicial + compras - pagos };
}
