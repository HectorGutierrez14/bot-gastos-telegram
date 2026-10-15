import type { Resultado } from "../tipos";
import { normalizar } from "../util/texto";

export const MONTO_MAX = 50_000_000;
const ERROR_RANGO = "El monto debe ser mayor que $0 y máximo $50.000.000.";
const ERROR_FORMATO = "No entendí el monto.";

const RE_NUMERO = /^(\$)?(\d+|\d{1,3}(?:[.,]\d{3})+)([kK])?$/;

/** Interpreta un token como monto COP entero. `marcado` = tiene $, k, separador de miles o vale ≥ 1.000. */
export function interpretarNumero(token: string): { valor: number; marcado: boolean } | null {
  const m = RE_NUMERO.exec(token);
  if (!m) return null;
  const [, pesos, cifras, k] = m;
  const separador = /[.,]/.test(cifras);
  const valor = Number(cifras.replace(/[.,]/g, "")) * (k ? 1000 : 1);
  return { valor, marcado: Boolean(pesos || k || separador) || valor >= 1000 };
}

export function validarRango(n: number): Resultado<number> {
  return n > 0 && n <= MONTO_MAX ? { ok: true, valor: n } : { ok: false, error: ERROR_RANGO };
}

/** Monto único para comandos: "500000", "$2.000.000", "18k", "20 mil". */
export function parseMonto(texto: string): Resultado<number> {
  const tokens = texto.trim().split(/\s+/).filter(Boolean);
  const esMil = tokens.length === 2 && normalizar(tokens[1]) === "mil";
  if (tokens.length !== 1 && !esMil) return { ok: false, error: ERROR_FORMATO };
  const n = interpretarNumero(tokens[0]);
  if (!n) return { ok: false, error: ERROR_FORMATO };
  return validarRango(esMil ? n.valor * 1000 : n.valor);
}
