import { buscarCategoria, CATEGORIAS } from "../categorias";
import { listarAprendidos, olvidar } from "../db/aprendizaje";
import { borrarGasto, ultimoGasto } from "../db/gastos";
import { borrarPago, obtenerPago, reabrirAjuste, ultimoMovimiento } from "../db/pagos";
import type { Deps } from "../deps";
import { comandoInforme } from "../informe";
import { COMANDO_DESCONOCIDO, TEXTO_AYUDA, textoConfirmacion } from "../mensajes";
import { parseComando } from "../parse/comando";
import { nombreTarjeta } from "../tarjetas";
import type { TgMessage } from "../telegram";
import { comandoTope } from "../tope";
import { formatCOP } from "../util/cop";
import { fechaCorta, hoyBogota } from "../util/fechas";
import { normalizar } from "../util/texto";
import { aplicarCorreccion } from "./callbacks";
import { comandoPagoTc, comandoSaldoTc, comandoTarjeta, preguntarAjuste } from "./tarjetas";

const LISTA_CATEGORIAS = CATEGORIAS.join("\n");

type Comando = (args: string, deps: Deps, updateId: number) => Promise<string | null>;

const COMANDOS: Record<string, Comando> = {
  start: async () => TEXTO_AYUDA,
  ayuda: async () => TEXTO_AYUDA,
  categorias: async () => `Categorías:\n${LISTA_CATEGORIAS}`,
  cambiar: comandoCambiar,
  aprendido: comandoAprendido,
  olvidar: comandoOlvidar,
  deshacer: comandoDeshacer,
  tope: comandoTope,
  saldotc: comandoSaldoTc,
  pagotc: comandoPagoTc,
  tarjeta: comandoTarjeta,
  informe: comandoInforme,
};

/** Ejecuta un comando y envía su respuesta (si devuelve texto). */
export async function ejecutarComando(msg: TgMessage, updateId: number, deps: Deps): Promise<void> {
  const c = parseComando(msg.text ?? "");
  const fn = c ? COMANDOS[c.nombre] : undefined;
  const respuesta = fn && c ? await fn(c.args, deps, updateId) : COMANDO_DESCONOCIDO;
  if (respuesta) await deps.tg.sendMessage(msg.chat.id, respuesta);
}

async function comandoCambiar(args: string, deps: Deps): Promise<string> {
  const categoria = buscarCategoria(args);
  if (!categoria) return `Categoría no válida. Opciones:\n${LISTA_CATEGORIAS}`;
  const g = await ultimoGasto(deps.db);
  if (!g) return "No hay gastos para cambiar.";
  const nuevo = await aplicarCorreccion(deps, g, categoria);
  return `Cambiado: ${textoConfirmacion(nuevo, hoyBogota(deps.ahora()))}`;
}

async function comandoAprendido(_args: string, deps: Deps): Promise<string> {
  const lista = await listarAprendidos(deps.db);
  if (lista.length === 0) return "Aún no he aprendido ningún concepto.";
  return `Conceptos aprendidos:\n${lista.map((a) => `• ${a.concepto_normalizado} → ${a.categoria}`).join("\n")}`;
}

async function comandoOlvidar(args: string, deps: Deps): Promise<string> {
  if (!args) return "Uso: /olvidar <concepto>";
  return (await olvidar(deps.db, normalizar(args))) ? `Olvidé "${args}".` : `No tenía aprendido "${args}".`;
}

async function comandoDeshacer(_args: string, deps: Deps): Promise<string | null> {
  const mov = await ultimoMovimiento(deps.db);
  if (!mov) return "No hay nada que deshacer.";
  if (mov.tipo === "pago") {
    const p = mov.pago;
    await borrarPago(deps.db, p.id);
    return `🗑️ Eliminado: pago de ${formatCOP(p.monto)} a ${nombreTarjeta(p.tarjeta)} (${fechaCorta(p.fecha_pago)})`;
  }

  const g = mov.gasto;
  await borrarGasto(deps.db, g.id);
  const texto = `🗑️ Eliminado: ${textoConfirmacion(g, hoyBogota(deps.ahora())).replace(/^✅ /, "")}`;
  if (g.pago_ajuste_id === null) return texto;

  // Gasto de ajuste: se reabre el pago y se vuelve a preguntar qué fue la diferencia.
  await deps.tg.sendMessage(deps.chatId, texto);
  await reabrirAjuste(deps.db, g.pago_ajuste_id);
  const pago = await obtenerPago(deps.db, g.pago_ajuste_id);
  if (pago) await preguntarAjuste(deps, pago);
  return null;
}
