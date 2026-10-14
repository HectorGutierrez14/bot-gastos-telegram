import { crearFecha, diaSemana, diferenciaDias, fechaCorta, fechaLarga, sumarDias, ultimoDiaMes } from "./util/fechas";
import { normalizar } from "./util/texto";

export interface Periodo {
  tipo: "semana" | "mes";
  desde: string;
  hasta: string;
  /** min(hasta, hoy): último día con datos del periodo. */
  corte: string;
  enCurso: boolean;
  etiqueta: string;
  /** 'YYYY-MM' para meses, fecha del lunes para semanas. */
  clave: string;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function construir(tipo: Periodo["tipo"], desde: string, hasta: string, hoy: string, etiqueta: string, clave: string): Periodo {
  const enCurso = hoy >= desde && hoy <= hasta;
  return { tipo, desde, hasta, corte: enCurso ? hoy : hasta, enCurso, etiqueta, clave };
}

function semanaDesde(lunes: string, hoy: string): Periodo {
  const domingo = sumarDias(lunes, 6);
  return construir("semana", lunes, domingo, hoy, `semana del ${fechaCorta(lunes)} al ${fechaLarga(domingo)}`, lunes);
}

function mes(anio: number, m: number, hoy: string): Periodo {
  const desde = crearFecha(anio, m, 1);
  const hasta = crearFecha(anio, m, ultimoDiaMes(anio, m));
  return construir("mes", desde, hasta, hoy, `${MESES[m - 1]} ${anio}`, desde.slice(0, 7));
}

export function semanaActual(hoy: string): Periodo {
  return semanaDesde(sumarDias(hoy, 1 - diaSemana(hoy)), hoy);
}

export function semanaPasada(hoy: string): Periodo {
  return semanaDesde(sumarDias(hoy, 1 - diaSemana(hoy) - 7), hoy);
}

export function mesActual(hoy: string): Periodo {
  return mes(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), hoy);
}

export function mesPasado(hoy: string): Periodo {
  const a = Number(hoy.slice(0, 4));
  const m = Number(hoy.slice(5, 7));
  return m === 1 ? mes(a - 1, 12, hoy) : mes(a, m - 1, hoy);
}

/** "octubre" [2026]. Sin año: el actual, o el anterior si ese mes aún no empieza. Meses futuros → null. */
export function mesNombrado(nombre: string, anio: number | undefined, hoy: string): Periodo | null {
  const n = normalizar(nombre);
  const idx = n === "setiembre" ? 8 : MESES.indexOf(n);
  if (idx < 0) return null;
  let a = anio ?? Number(hoy.slice(0, 4));
  if (anio === undefined && crearFecha(a, idx + 1, 1) > hoy) a -= 1;
  const p = mes(a, idx + 1, hoy);
  return p.desde > hoy ? null : p;
}

/** "", "mes", "mes pasado", "semana", "semana pasada", "<mes> [año]". */
export function parsePeriodo(args: string, hoy: string): Periodo | null {
  const t = normalizar(args);
  if (t === "" || t === "mes") return mesActual(hoy);
  if (t === "mes pasado") return mesPasado(hoy);
  if (t === "semana") return semanaActual(hoy);
  if (t === "semana pasada") return semanaPasada(hoy);
  const m = /^([a-z]+)(?: (\d{4}))?$/.exec(t);
  return m ? mesNombrado(m[1], m[2] ? Number(m[2]) : undefined, hoy) : null;
}

/** Periodo anterior equivalente: completo si el actual está cerrado; mismo corte si está en curso. */
export function rangoComparacion(p: Periodo): { desde: string; hasta: string } {
  let anterior: Periodo;
  if (p.tipo === "semana") {
    anterior = semanaDesde(sumarDias(p.desde, -7), p.desde);
  } else {
    anterior = mesPasado(p.desde);
  }
  if (!p.enCurso) return { desde: anterior.desde, hasta: anterior.hasta };
  const corte = sumarDias(anterior.desde, diferenciaDias(p.desde, p.corte));
  return { desde: anterior.desde, hasta: corte < anterior.hasta ? corte : anterior.hasta };
}
