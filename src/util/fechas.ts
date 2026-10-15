// Fechas como 'YYYY-MM-DD' en America/Bogota (UTC-5 fijo, sin horario de verano).

const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

function aUTC(f: string): number {
  const [a, m, d] = f.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

function deUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function hoyBogota(ahora: Date): string {
  return deUTC(ahora.getTime() - OFFSET_BOGOTA_MS);
}

export function sumarDias(f: string, n: number): string {
  return deUTC(aUTC(f) + n * DIA_MS);
}

/** 1 = lunes … 7 = domingo. */
export function diaSemana(f: string): number {
  const d = new Date(aUTC(f)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function ultimoDiaMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

export function fechaCorta(f: string): string {
  return `${f.slice(8, 10)}/${f.slice(5, 7)}`;
}

export function fechaLarga(f: string): string {
  return `${fechaCorta(f)}/${f.slice(0, 4)}`;
}

export function mesDe(f: string): string {
  return f.slice(0, 7);
}

/** Días de `a` a `b` (b − a). */
export function diferenciaDias(a: string, b: string): number {
  return Math.round((aUTC(b) - aUTC(a)) / DIA_MS);
}

export function crearFecha(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
