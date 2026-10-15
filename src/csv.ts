import { gastosEntre } from "./db/gastos";
import { pagosEntre } from "./db/pagos";
import type { Deps } from "./deps";
import { parsePeriodo } from "./periodos";
import { hoyBogota } from "./util/fechas";
import { normalizar } from "./util/texto";

const ENCABEZADO = ["fecha", "tipo", "monto", "categoria", "concepto", "medio_pago", "fuente_clasificacion"];
const USO = "Uso: /exportar [mes pasado | <mes> [año] | todo]";

/** Neutraliza CSV injection (prefijo ') y escapa ; comillas y saltos de línea. */
export function escaparCampo(s: string): string {
  let v = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (/[;"\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** CSV para Excel en español: UTF-8 con BOM, separador ; y fin de línea CRLF. */
export function generarCSV(filas: string[][]): Uint8Array {
  const texto = filas.map((f) => f.map(escaparCampo).join(";")).join("\r\n") + "\r\n";
  const cuerpo = new TextEncoder().encode(texto);
  const bytes = new Uint8Array(cuerpo.length + 3);
  bytes.set([0xef, 0xbb, 0xbf]);
  bytes.set(cuerpo, 3);
  return bytes;
}

function medioPago(tarjeta: string | null): string {
  return tarjeta === null ? "efectivo_debito" : `tc_${tarjeta}`;
}

/** /exportar [mes pasado | <mes> [año] | todo] */
export async function comandoExportar(args: string, deps: Deps): Promise<string | null> {
  const hoy = hoyBogota(deps.ahora());
  let rango: { desde: string; hasta: string; clave: string; etiqueta: string | null };
  if (normalizar(args) === "todo") {
    rango = { desde: "0000-01-01", hasta: "9999-12-31", clave: "todo", etiqueta: null };
  } else {
    const p = parsePeriodo(args, hoy);
    if (!p || p.tipo !== "mes") return USO;
    rango = { desde: p.desde, hasta: p.hasta, clave: p.clave, etiqueta: p.etiqueta };
  }

  const [gastos, pagos] = await Promise.all([
    gastosEntre(deps.db, rango.desde, rango.hasta),
    pagosEntre(deps.db, rango.desde, rango.hasta),
  ]);
  if (gastos.length + pagos.length === 0) {
    return rango.etiqueta ? `No hay movimientos para exportar en ${rango.etiqueta}.` : "No hay movimientos para exportar.";
  }

  const movimientos = [
    ...gastos.map((g) => ({
      orden: `${g.fecha_gasto}|${g.registrado_utc}`,
      fila: [g.fecha_gasto, "gasto", String(g.monto), g.categoria, g.concepto, medioPago(g.tarjeta), g.fuente_clasificacion],
    })),
    ...pagos.map((p) => ({
      orden: `${p.fecha_pago}|${p.registrado_utc}`,
      fila: [p.fecha_pago, "pago_tarjeta", String(p.monto), "", "", medioPago(p.tarjeta), ""],
    })),
  ].sort((a, b) => a.orden.localeCompare(b.orden));

  await deps.tg.sendDocument(deps.chatId, `gastos_${rango.clave}.csv`, generarCSV([ENCABEZADO, ...movimientos.map((m) => m.fila)]));
  return null;
}
