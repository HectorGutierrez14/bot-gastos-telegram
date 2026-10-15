import { informeYaEnviado, limpiarUpdates, marcarInformeEnviado } from "./db/control";
import type { Deps } from "./deps";
import { generarInforme } from "./informe";
import { mesPasado } from "./periodos";
import { hoyBogota } from "./util/fechas";

const RETENCION_UPDATES_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cron del día 1: informe del mes que cerró y limpieza de updates viejos.
 * Se marca como enviado solo si Telegram confirma la entrega, para poder reintentar.
 */
export async function ejecutarCron(deps: Deps): Promise<void> {
  const ahora = deps.ahora();
  const periodo = mesPasado(hoyBogota(ahora));
  if (!(await informeYaEnviado(deps.db, periodo.clave))) {
    const enviado = await deps.tg.sendMessage(deps.chatId, await generarInforme(deps, periodo));
    if (enviado !== null) await marcarInformeEnviado(deps.db, periodo.clave, ahora.toISOString());
  }
  await limpiarUpdates(deps.db, new Date(ahora.getTime() - RETENCION_UPDATES_MS).toISOString());
}
