import { clasificar } from "../clasificar";
import { buscarAprendido } from "../db/aprendizaje";
import { insertarGasto } from "../db/gastos";
import type { Deps } from "../deps";
import { MENSAJE_LARGO, NOTA_FALLBACK, TEXTO_AYUDA, textoConfirmacion } from "../mensajes";
import { parseLinea } from "../parse/linea";
import { tecladoConfirmacion } from "../teclados";
import type { TgMessage } from "../telegram";
import { evaluarTope } from "../tope";
import { hoyBogota } from "../util/fechas";

const MAX_CARACTERES = 1000;
const MAX_LINEAS = 20;
/**
 * Workers corta waitUntil ~30 s después de responder. Pasado este presupuesto no se
 * llama más a Gemini (8 s de timeout por llamada) y las líneas restantes van a Otros.
 */
const PRESUPUESTO_IA_MS = 15_000;

/** Registra cada línea del mensaje como un gasto independiente, con su propia confirmación. */
export async function registrarGastos(msg: TgMessage, updateId: number, deps: Deps): Promise<void> {
  const texto = msg.text ?? "";
  const lineas = texto.split("\n").filter((l) => l.trim() !== "");
  if (texto.length > MAX_CARACTERES || lineas.length > MAX_LINEAS) {
    await deps.tg.sendMessage(msg.chat.id, MENSAJE_LARGO);
    return;
  }

  const limiteIA = deps.ahora().getTime() + PRESUPUESTO_IA_MS;
  const clasificarIA = (concepto: string) =>
    deps.ahora().getTime() < limiteIA ? deps.clasificarIA(concepto) : Promise.resolve(null);

  for (const [i, linea] of lineas.entries()) {
    const ahora = deps.ahora();
    const hoy = hoyBogota(ahora);
    const r = parseLinea(linea, hoy, deps.tarjetas);
    if (!r.ok) {
      const error = r.error === "ayuda" ? TEXTO_AYUDA : r.error;
      await deps.tg.sendMessage(msg.chat.id, lineas.length > 1 ? `Línea ${i + 1}: ${error}` : error);
      continue;
    }

    const { categoria, fuente } = await clasificar(r.valor.concepto, {
      buscarAprendido: (norm) => buscarAprendido(deps.db, norm),
      clasificarIA,
    });
    const gasto = {
      telegram_update_id: updateId,
      linea: i,
      fecha_gasto: r.valor.fecha,
      registrado_utc: ahora.toISOString(),
      monto: r.valor.monto,
      concepto: r.valor.concepto,
      categoria,
      tarjeta: r.valor.tarjeta,
      pago_ajuste_id: null,
      fuente_clasificacion: fuente,
      texto_original: linea.trim(),
    };
    const id = await insertarGasto(deps.db, gasto);
    if (id === null) continue;

    let confirmacion = textoConfirmacion(gasto, hoy);
    if (fuente === "fallback") confirmacion += `\n${NOTA_FALLBACK}`;
    await deps.tg.sendMessage(msg.chat.id, confirmacion, tecladoConfirmacion({ id, tarjeta: gasto.tarjeta }, deps.tarjetas));
    await evaluarTope(deps, gasto.fecha_gasto);
  }
}
