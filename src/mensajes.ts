import { nombreTarjeta } from "./tarjetas";
import type { Gasto } from "./tipos";
import { formatCOP } from "./util/cop";
import { fechaCorta } from "./util/fechas";

export const TEXTO_AYUDA = `Registra un gasto por línea:
35000 almuerzo
uber 18k tc nu
ayer 20000 taxi
12/10 35.000 almuerzo

Fecha opcional al inicio: hoy, ayer, anteayer, dd/mm o dd/mm/aaaa.
Tarjeta opcional: tc <tarjeta> (ej. tc nu).

Comandos:
/informe semana | semana pasada | mes | mes pasado | <mes> [año]
/exportar [mes pasado | <mes> [año] | todo]
/tope [monto | off]
/pagotc <tarjeta> <monto> [fecha]
/saldotc <tarjeta> <monto>
/tarjeta
/cambiar <categoría>
/deshacer
/categorias
/aprendido
/olvidar <concepto>`;

export const SOLO_TEXTO = "Por ahora solo entiendo texto";
export const MENSAJE_LARGO = "El mensaje es muy largo: máximo 1.000 caracteres y 20 líneas.";
export const NOTA_FALLBACK = "⚠️ No pude clasificarlo automáticamente: quedó en Otros.";
export const ERROR_GENERICO = "Ocurrió un error, intenta de nuevo";
export const COMANDO_DESCONOCIDO = "Comando no reconocido. Escribe /ayuda";

/** "✅ $35.000 · Comida · almuerzo · TC Nu · 13/10" (tarjeta y fecha solo si aplican). */
export function textoConfirmacion(g: Pick<Gasto, "monto" | "categoria" | "concepto" | "tarjeta" | "fecha_gasto">, hoy: string): string {
  let t = `✅ ${formatCOP(g.monto)} · ${g.categoria} · ${g.concepto}`;
  if (g.tarjeta) t += ` · ${nombreTarjeta(g.tarjeta)}`;
  if (g.fecha_gasto !== hoy) t += ` · ${fechaCorta(g.fecha_gasto)}`;
  return t;
}
