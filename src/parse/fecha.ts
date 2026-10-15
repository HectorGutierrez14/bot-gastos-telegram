import type { Resultado } from "../tipos";
import { crearFecha, diferenciaDias, fechaLarga, sumarDias, ultimoDiaMes } from "../util/fechas";
import { normalizar } from "../util/texto";

const RELATIVAS: Record<string, number> = { hoy: 0, ayer: -1, anteayer: -2 };
const RE_FECHA = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;

/**
 * Interpreta un token de fecha retroactiva (hoy, ayer, anteayer, dd/mm, dd/mm/aaaa).
 * Devuelve null si el token no tiene forma de fecha.
 */
export function parseFechaToken(token: string, hoy: string): Resultado<string> | null {
  const t = normalizar(token);
  if (t in RELATIVAS) return { ok: true, valor: sumarDias(hoy, RELATIVAS[t]) };

  const m = RE_FECHA.exec(t);
  if (!m) return null;

  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anioHoy = Number(hoy.slice(0, 4));
  let anio = m[3] ? Number(m[3]) : anioHoy;

  if (mes < 1 || mes > 12 || dia < 1 || dia > ultimoDiaMes(anio, mes)) {
    return { ok: false, error: `La fecha ${token} no existe.` };
  }

  let fecha = crearFecha(anio, mes, dia);
  if (!m[3] && fecha > hoy) {
    anio -= 1;
    if (dia > ultimoDiaMes(anio, mes)) return { ok: false, error: `La fecha ${token} no existe.` };
    fecha = crearFecha(anio, mes, dia);
  }

  if (fecha > hoy) return { ok: false, error: `No puedo registrar fechas futuras (${fechaLarga(fecha)}).` };
  if (diferenciaDias(fecha, hoy) > 365) {
    return { ok: false, error: "Solo puedo registrar fechas de los últimos 365 días." };
  }
  return { ok: true, valor: fecha };
}
