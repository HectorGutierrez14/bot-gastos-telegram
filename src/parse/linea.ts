import type { Resultado } from "../tipos";
import { normalizar } from "../util/texto";
import { parseFechaToken } from "./fecha";
import { interpretarNumero, validarRango } from "./monto";

export interface LineaGasto {
  fecha: string;
  monto: number;
  concepto: string;
  /** null = efectivo/débito, alias de TARJETAS_CREDITO o 'sin_definir'. */
  tarjeta: string | null;
}

const AYUDA: Resultado<LineaGasto> = { ok: false, error: "ayuda" };

/**
 * Interpreta una línea de gasto: `[fecha] <monto> <concepto> [tc <alias>]` en
 * cualquier orden de monto/concepto. error "ayuda" = responder con el texto de ayuda.
 */
export function parseLinea(linea: string, hoy: string, tarjetas: string[]): Resultado<LineaGasto> {
  let tokens = linea.trim().split(/\s+/).filter(Boolean);

  // 1. Fecha opcional al inicio.
  let fecha = hoy;
  const f = tokens.length > 0 ? parseFechaToken(tokens[0], hoy) : null;
  if (f) {
    if (!f.ok) return f;
    fecha = f.valor;
    tokens = tokens.slice(1);
  }

  // 2. Medio de pago: `tc` y, si sigue un alias conocido, el alias.
  let tarjeta: string | null = null;
  const posTc = tokens.flatMap((t, i) => (normalizar(t) === "tc" ? [i] : []));
  if (posTc.length > 1) return AYUDA;
  if (posTc.length === 1) {
    const i = posTc[0];
    const siguiente = tokens[i + 1] !== undefined ? normalizar(tokens[i + 1]) : undefined;
    if (siguiente !== undefined && tarjetas.includes(siguiente)) {
      tarjeta = siguiente;
      tokens.splice(i, 2);
    } else {
      tarjeta = "sin_definir";
      tokens.splice(i, 1);
    }
  }

  // 3. Monto: gana el único candidato marcado; si no hay, el único número sin marca.
  const numeros: { inicio: number; largo: number; valor: number; marcado: boolean }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const n = interpretarNumero(tokens[i]);
    if (!n) continue;
    if (tokens[i + 1] !== undefined && normalizar(tokens[i + 1]) === "mil") {
      numeros.push({ inicio: i, largo: 2, valor: n.valor * 1000, marcado: true });
      i++;
    } else {
      numeros.push({ inicio: i, largo: 1, ...n });
    }
  }
  const marcados = numeros.filter((n) => n.marcado);
  const elegido = marcados.length === 1 ? marcados[0] : marcados.length === 0 && numeros.length === 1 ? numeros[0] : null;
  if (!elegido) return AYUDA;
  const rango = validarRango(elegido.valor);
  if (!rango.ok) return rango;
  tokens.splice(elegido.inicio, elegido.largo);

  // 4. Concepto: lo que queda.
  const concepto = tokens.join(" ");
  if (concepto === "") return AYUDA;
  return { ok: true, valor: { fecha, monto: elegido.valor, concepto, tarjeta } };
}
