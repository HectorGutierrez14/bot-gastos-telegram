import { buscarCategoria, CATEGORIAS } from "../categorias";
import { listarAprendidos, olvidar } from "../db/aprendizaje";
import { borrarGasto, ultimoGasto } from "../db/gastos";
import { ultimoMovimiento } from "../db/pagos";
import type { Deps } from "../deps";
import { COMANDO_DESCONOCIDO, TEXTO_AYUDA, textoConfirmacion } from "../mensajes";
import { parseComando } from "../parse/comando";
import type { TgMessage } from "../telegram";
import { comandoTope } from "../tope";
import { hoyBogota } from "../util/fechas";
import { normalizar } from "../util/texto";
import { aplicarCorreccion } from "./callbacks";

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

async function comandoDeshacer(_args: string, deps: Deps): Promise<string> {
  const mov = await ultimoMovimiento(deps.db);
  if (!mov) return "No hay nada que deshacer.";
  if (mov.tipo === "gasto") {
    await borrarGasto(deps.db, mov.gasto.id);
    return `🗑️ Eliminado: ${textoConfirmacion(mov.gasto, hoyBogota(deps.ahora())).replace(/^✅ /, "")}`;
  }
  return "No hay nada que deshacer.";
}
