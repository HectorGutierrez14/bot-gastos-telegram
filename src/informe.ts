import { getTope } from "./db/config";
import { comprasTarjeta, gastosEntre } from "./db/gastos";
import { totalPagos } from "./db/pagos";
import type { Deps } from "./deps";
import { type Periodo, parsePeriodo, rangoComparacion } from "./periodos";
import { calcularSaldo, nombreTarjeta } from "./tarjetas";
import type { Gasto } from "./tipos";
import { formatCOP, formatVariacion } from "./util/cop";
import { fechaCorta, fechaLarga, hoyBogota } from "./util/fechas";
import { recortar } from "./util/texto";

const MAX_CONCEPTO_TOP = 60;

export interface Resumen {
  total: number;
  cantidad: number;
  porCategoria: Map<string, number>;
  /** Clave "efectivo" para efectivo/débito, alias o "sin_definir". */
  porMedio: Map<string, number>;
  top: Gasto[];
}

export interface TarjetaInforme {
  alias: string;
  compras: number;
  pagos: number;
  saldo: number;
}

export interface DatosInforme {
  periodo: Periodo;
  actual: Resumen;
  anterior: Resumen;
  comparacion: { desde: string; hasta: string };
  tope: number | null;
  tarjetas: TarjetaInforme[];
}

function sumar(m: Map<string, number>, clave: string, monto: number) {
  m.set(clave, (m.get(clave) ?? 0) + monto);
}

export function resumir(gastos: Gasto[]): Resumen {
  const porCategoria = new Map<string, number>();
  const porMedio = new Map<string, number>();
  let total = 0;
  for (const g of gastos) {
    total += g.monto;
    sumar(porCategoria, g.categoria, g.monto);
    sumar(porMedio, g.tarjeta ?? "efectivo", g.monto);
  }
  const top = [...gastos]
    .sort((a, b) => b.monto - a.monto || a.fecha_gasto.localeCompare(b.fecha_gasto) || a.id - b.id)
    .slice(0, 3);
  return { total, cantidad: gastos.length, porCategoria, porMedio, top };
}

const pct = (parte: number, total: number) => Math.round((parte * 100) / total);

export function formatearInforme(d: DatosInforme): string {
  const { periodo: p, actual, anterior } = d;
  const fechas = `${fechaLarga(p.desde)} – ${fechaLarga(p.corte)}${p.enCurso ? " (en curso)" : ""}`;
  const encabezado = `📊 Informe ${p.etiqueta}\n${fechas}`;
  if (actual.cantidad === 0) return `${encabezado}\n\nNo registraste gastos en este periodo.`;

  const resumen = [
    `Total: ${formatCOP(actual.total)} en ${actual.cantidad} ${actual.cantidad === 1 ? "gasto" : "gastos"}`,
    `vs. ${fechaLarga(d.comparacion.desde)} – ${fechaLarga(d.comparacion.hasta)}: ${formatVariacion(actual.total, anterior.total)}`,
  ];
  if (p.tipo === "mes" && d.tope !== null) resumen.push(`Tope: ${pct(actual.total, d.tope)}% de ${formatCOP(d.tope)}`);

  const categorias = [...actual.porCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, monto]) => {
      const antes = anterior.porCategoria.get(cat);
      const variacion = antes === undefined ? "nueva" : formatVariacion(monto, antes);
      return `• ${cat}: ${formatCOP(monto)} (${pct(monto, actual.total)}%) ${variacion}`;
    });
  for (const [cat, monto] of [...anterior.porCategoria.entries()].sort((a, b) => b[1] - a[1])) {
    if (!actual.porCategoria.has(cat)) categorias.push(`• ${cat}: sin gastos (antes ${formatCOP(monto)})`);
  }

  const top = actual.top.map(
    (g, i) => `${i + 1}. ${formatCOP(g.monto)} · ${g.categoria} · ${recortar(g.concepto, MAX_CONCEPTO_TOP)} · ${fechaCorta(g.fecha_gasto)}`,
  );

  const orden = (k: string) => (k === "efectivo" ? 0 : k === "sin_definir" ? 2 : 1);
  const medios = [...actual.porMedio.entries()]
    .sort((a, b) => orden(a[0]) - orden(b[0]) || b[1] - a[1])
    .map(([k, monto]) => `• ${k === "efectivo" ? "Efectivo/débito" : nombreTarjeta(k)}: ${formatCOP(monto)}`);

  const secciones = [
    encabezado,
    resumen.join("\n"),
    `Por categoría:\n${categorias.join("\n")}`,
    `Top 3:\n${top.join("\n")}`,
    `Por medio de pago:\n${medios.join("\n")}`,
  ];
  if (d.tarjetas.length > 0) {
    const lineas = d.tarjetas.map(
      (t) =>
        `• ${nombreTarjeta(t.alias)}: compras ${formatCOP(t.compras)} · pagos ${formatCOP(t.pagos)} · saldo estimado ${formatCOP(t.saldo)}`,
    );
    secciones.push(`Tarjetas de crédito (informativo, no suma al total):\n${lineas.join("\n")}`);
  }
  return secciones.join("\n\n");
}

/** Carga los datos del periodo y su comparación y arma el informe. */
export async function generarInforme(deps: Deps, p: Periodo): Promise<string> {
  const comparacion = rangoComparacion(p);
  const [actual, anterior, tope, tarjetas] = await Promise.all([
    gastosEntre(deps.db, p.desde, p.corte),
    gastosEntre(deps.db, comparacion.desde, comparacion.hasta),
    getTope(deps.db),
    Promise.all(
      deps.tarjetas.map(async (alias) => ({
        alias,
        compras: await comprasTarjeta(deps.db, alias, p.desde, p.corte),
        pagos: await totalPagos(deps.db, alias, p.desde, p.corte),
        saldo: (await calcularSaldo(deps.db, alias)).saldo,
      })),
    ),
  ]);
  return formatearInforme({ periodo: p, actual: resumir(actual), anterior: resumir(anterior), comparacion, tope, tarjetas });
}

/** /informe semana | semana pasada | mes | mes pasado | <mes> [año] */
export async function comandoInforme(args: string, deps: Deps): Promise<string> {
  const p = parsePeriodo(args, hoyBogota(deps.ahora()));
  if (!p) return "Uso: /informe semana | semana pasada | mes | mes pasado | <mes> [año]";
  return generarInforme(deps, p);
}
