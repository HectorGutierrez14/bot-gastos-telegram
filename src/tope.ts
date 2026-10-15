import { borrarAlertas, registrarAlerta } from "./db/control";
import { borrarTope, getTope, setTope } from "./db/config";
import { totalEntre } from "./db/gastos";
import type { Deps } from "./deps";
import { parseMonto } from "./parse/monto";
import { formatCOP } from "./util/cop";
import { crearFecha, hoyBogota, mesDe, ultimoDiaMes } from "./util/fechas";

/** Total gastado en el mes 'YYYY-MM' (solo gastos; nunca pagos ni saldos iniciales). */
async function totalMes(db: D1Database, mes: string): Promise<number> {
  const [a, m] = mes.split("-").map(Number);
  return totalEntre(db, crearFecha(a, m, 1), crearFecha(a, m, ultimoDiaMes(a, m)));
}

/** Tras registrar o corregir un gasto del mes actual, avisa al cruzar el 80% y el 100% (una vez por mes). */
export async function evaluarTope(deps: Deps, fechaGasto: string): Promise<void> {
  const ahora = deps.ahora();
  const mes = mesDe(hoyBogota(ahora));
  if (mesDe(fechaGasto) !== mes) return;
  const tope = await getTope(deps.db);
  if (tope === null) return;

  const total = await totalMes(deps.db, mes);
  const utc = ahora.toISOString();
  if (total >= tope) {
    if (await registrarAlerta(deps.db, mes, 100, utc)) {
      await deps.tg.sendMessage(deps.chatId, `🚨 Superaste tu tope mensual: ${formatCOP(total)} de ${formatCOP(tope)}`);
    }
    await registrarAlerta(deps.db, mes, 80, utc);
  } else if (total * 100 >= tope * 80 && (await registrarAlerta(deps.db, mes, 80, utc))) {
    const pct = Math.floor((total * 100) / tope);
    await deps.tg.sendMessage(deps.chatId, `⚠️ Llevas ${formatCOP(total)} de ${formatCOP(tope)} este mes (${pct}%)`);
  }
}

/** /tope [monto | off] */
export async function comandoTope(args: string, deps: Deps): Promise<string | null> {
  const hoy = hoyBogota(deps.ahora());
  const arg = args.trim().toLowerCase();

  if (arg === "") {
    const tope = await getTope(deps.db);
    if (tope === null) return "No tienes tope mensual. Defínelo con /tope 2000000";
    const total = await totalMes(deps.db, mesDe(hoy));
    return `Tope mensual: ${formatCOP(tope)}\nGastado este mes: ${formatCOP(total)} (${Math.floor((total * 100) / tope)}%)`;
  }
  if (arg === "off") {
    await borrarTope(deps.db);
    return "Tope desactivado.";
  }

  const monto = parseMonto(args);
  if (!monto.ok) return monto.error;
  await setTope(deps.db, monto.valor);
  await borrarAlertas(deps.db, mesDe(hoy));
  await deps.tg.sendMessage(deps.chatId, `Tope mensual: ${formatCOP(monto.valor)}`);
  await evaluarTope(deps, hoy);
  return null;
}
