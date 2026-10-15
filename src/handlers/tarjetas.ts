import { contarSinDefinir, insertarGasto } from "../db/gastos";
import { insertarPago, marcarAjusteResuelto, obtenerPago, setSaldoInicial } from "../db/pagos";
import type { Deps } from "../deps";
import { textoConfirmacion } from "../mensajes";
import { parseFechaToken } from "../parse/fecha";
import { parseMonto } from "../parse/monto";
import { calcularSaldo, nombreTarjeta } from "../tarjetas";
import { tecladoAjuste, tecladoConfirmacion } from "../teclados";
import type { TgCallbackQuery } from "../telegram";
import type { PagoTarjeta } from "../tipos";
import { evaluarTope } from "../tope";
import { formatCOP } from "../util/cop";
import { fechaCorta, hoyBogota } from "../util/fechas";
import { normalizar } from "../util/texto";

function aliasDesconocido(alias: string, deps: Deps): string {
  return `No conozco la tarjeta "${alias}". Tarjetas configuradas: ${deps.tarjetas.join(", ")}`;
}

/** /saldotc <tarjeta> <monto> — saldo inicial (no es un gasto). */
export async function comandoSaldoTc(args: string, deps: Deps): Promise<string> {
  const [aliasRaw, ...resto] = args.split(/\s+/).filter(Boolean);
  if (!aliasRaw || resto.length === 0) return "Uso: /saldotc <tarjeta> <monto>";
  const alias = normalizar(aliasRaw);
  if (!deps.tarjetas.includes(alias)) return aliasDesconocido(aliasRaw, deps);
  const texto = resto.join(" ");
  let monto = 0;
  if (texto !== "0") {
    const r = parseMonto(texto);
    if (!r.ok) return r.error;
    monto = r.valor;
  }
  await setSaldoInicial(deps.db, alias, monto, deps.ahora().toISOString());
  return `Saldo inicial de ${nombreTarjeta(alias)}: ${formatCOP(monto)}`;
}

/** /pagotc <tarjeta> <monto> [fecha] — registra un pago (nunca es gasto). */
export async function comandoPagoTc(args: string, deps: Deps, updateId: number): Promise<string | null> {
  const tokens = args.split(/\s+/).filter(Boolean);
  const [aliasRaw, ...resto] = tokens;
  if (!aliasRaw || resto.length === 0) return "Uso: /pagotc <tarjeta> <monto> [fecha]";
  const alias = normalizar(aliasRaw);
  if (!deps.tarjetas.includes(alias)) return aliasDesconocido(aliasRaw, deps);

  const ahora = deps.ahora();
  const hoy = hoyBogota(ahora);
  let fecha = hoy;
  const f = resto.length > 1 ? parseFechaToken(resto[resto.length - 1], hoy) : null;
  if (f) {
    if (!f.ok) return f.error;
    fecha = f.valor;
    resto.pop();
  }
  const monto = parseMonto(resto.join(" "));
  if (!monto.ok) return monto.error;

  const id = await insertarPago(deps.db, {
    telegram_update_id: updateId,
    tarjeta: alias,
    monto: monto.valor,
    fecha_pago: fecha,
    registrado_utc: ahora.toISOString(),
  });
  if (id === null) return null;

  const { saldo } = await calcularSaldo(deps.db, alias);
  const fechaTxt = fecha !== hoy ? ` · ${fechaCorta(fecha)}` : "";
  await deps.tg.sendMessage(
    deps.chatId,
    `💳 Pago registrado: ${formatCOP(monto.valor)} a ${nombreTarjeta(alias)}${fechaTxt}\nSaldo estimado: ${formatCOP(saldo)}`,
  );
  const pago = await obtenerPago(deps.db, id);
  if (pago) await preguntarAjuste(deps, pago);
  return null;
}

/** Si el saldo de la tarjeta del pago quedó negativo, pregunta qué fue la diferencia. */
export async function preguntarAjuste(deps: Deps, pago: PagoTarjeta): Promise<void> {
  const { saldo } = await calcularSaldo(deps.db, pago.tarjeta);
  if (saldo >= 0) return;
  await deps.tg.sendMessage(
    deps.chatId,
    `El pago supera lo registrado en ${nombreTarjeta(pago.tarjeta)} por ${formatCOP(-saldo)}. ¿Qué fue esa diferencia?`,
    tecladoAjuste(pago.id),
  );
}

/** /tarjeta — resumen de saldos por tarjeta configurada. */
export async function comandoTarjeta(_args: string, deps: Deps): Promise<string> {
  const bloques = await Promise.all(
    deps.tarjetas.map(async (alias) => {
      const s = await calcularSaldo(deps.db, alias);
      return [
        nombreTarjeta(alias),
        `Saldo inicial: ${formatCOP(s.inicial)}`,
        `Compras: ${formatCOP(s.compras)}`,
        `Pagos: ${formatCOP(s.pagos)}`,
        `Saldo estimado: ${formatCOP(s.saldo)}`,
      ].join("\n");
    }),
  );
  const sinDefinir = await contarSinDefinir(deps.db);
  return ["💳 Tarjetas de crédito", ...bloques, `Gastos con tc sin tarjeta definida: ${sinDefinir}`].join("\n\n");
}

const AJUSTES = {
  int: { categoria: "Financieros", concepto: "Intereses y cuota de manejo (ajuste)" },
  compra: { categoria: "Otros", concepto: "Compra no registrada (ajuste)" },
} as const;

/** Botones aj:<pagoId>:<opcion>. Solo funcionan una vez por pago. */
export async function procesarAjuste(
  cq: TgCallbackQuery,
  cb: { pagoId: number; opcion: "int" | "compra" | "favor" },
  updateId: number,
  deps: Deps,
): Promise<void> {
  const chatId = cq.message!.chat.id;
  const messageId = cq.message!.message_id;
  const pago = await obtenerPago(deps.db, cb.pagoId);
  if (!pago) {
    await deps.tg.answerCallbackQuery(cq.id, "Este pago ya no existe");
    await deps.tg.editMessageReplyMarkup(chatId, messageId);
    return;
  }
  if (!(await marcarAjusteResuelto(deps.db, pago.id))) {
    await deps.tg.answerCallbackQuery(cq.id, "Este ajuste ya fue resuelto");
    await deps.tg.editMessageReplyMarkup(chatId, messageId);
    return;
  }
  await deps.tg.answerCallbackQuery(cq.id);

  const diferencia = -(await calcularSaldo(deps.db, pago.tarjeta)).saldo;
  if (diferencia <= 0) {
    await deps.tg.editMessageText(chatId, messageId, "Ya no hay diferencia por ajustar.");
    return;
  }
  if (cb.opcion === "favor") {
    await deps.tg.editMessageText(
      chatId,
      messageId,
      `Queda saldo a favor de ${formatCOP(diferencia)} en ${nombreTarjeta(pago.tarjeta)}.`,
    );
    return;
  }

  const ahora = deps.ahora();
  const { categoria, concepto } = AJUSTES[cb.opcion];
  const gasto = {
    telegram_update_id: updateId,
    linea: 0,
    fecha_gasto: pago.fecha_pago,
    registrado_utc: ahora.toISOString(),
    monto: diferencia,
    concepto,
    categoria,
    tarjeta: pago.tarjeta,
    pago_ajuste_id: pago.id,
    fuente_clasificacion: "ajuste" as const,
    texto_original: concepto,
  };
  const id = await insertarGasto(deps.db, gasto);
  if (id === null) return;
  const hoy = hoyBogota(ahora);

  if (cb.opcion === "int") {
    await deps.tg.editMessageText(chatId, messageId, `Registrado: ${textoConfirmacion(gasto, hoy)}`);
  } else {
    await deps.tg.editMessageText(chatId, messageId, "Registrado como compra no registrada.");
    await deps.tg.sendMessage(chatId, textoConfirmacion(gasto, hoy), tecladoConfirmacion({ id, tarjeta: gasto.tarjeta }, deps.tarjetas));
  }
  await evaluarTope(deps, gasto.fecha_gasto);
}
