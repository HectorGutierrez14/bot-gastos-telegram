import { env } from "cloudflare:workers";
import { vi } from "vitest";
import type { CategoriaIA } from "../src/categorias";
import type { Deps } from "../src/deps";
import type { InlineKeyboard, TelegramApi, TgCallbackQuery, TgMessage, TgUpdate } from "../src/telegram";

const TABLAS = [
  "gastos",
  "pagos_tarjeta",
  "saldos_iniciales_tarjeta",
  "aprendizaje",
  "config",
  "alertas_enviadas",
  "informes_enviados",
  "updates_procesados",
];

export async function limpiarDB(db: D1Database): Promise<void> {
  await db.batch(TABLAS.map((t) => db.prepare(`DELETE FROM ${t}`)));
}

export interface LlamadaTg {
  metodo: string;
  args: unknown[];
}

/** Telegram falso: registra cada llamada; sendMessage devuelve message_id desde 1000. */
export class FakeTelegram implements TelegramApi {
  llamadas: LlamadaTg[] = [];
  private siguienteId = 1000;

  async sendMessage(chatId: number | string, text: string, teclado?: InlineKeyboard): Promise<number | null> {
    this.llamadas.push({ metodo: "sendMessage", args: [chatId, text, teclado] });
    return this.siguienteId++;
  }
  async editMessageText(chatId: number | string, messageId: number, text: string, teclado?: InlineKeyboard) {
    this.llamadas.push({ metodo: "editMessageText", args: [chatId, messageId, text, teclado] });
    return true;
  }
  async editMessageReplyMarkup(chatId: number | string, messageId: number, teclado?: InlineKeyboard) {
    this.llamadas.push({ metodo: "editMessageReplyMarkup", args: [chatId, messageId, teclado] });
    return true;
  }
  async answerCallbackQuery(id: string, text?: string) {
    this.llamadas.push({ metodo: "answerCallbackQuery", args: [id, text] });
    return true;
  }
  async sendDocument(chatId: number | string, nombre: string, contenido: Uint8Array, caption?: string) {
    this.llamadas.push({ metodo: "sendDocument", args: [chatId, nombre, contenido, caption] });
    return true;
  }

  /** Textos enviados con sendMessage, en orden. */
  textos(): string[] {
    return this.llamadas.filter((l) => l.metodo === "sendMessage").map((l) => l.args[1] as string);
  }
  /** Teclado del último sendMessage. */
  ultimoTeclado(): InlineKeyboard | undefined {
    const envios = this.llamadas.filter((l) => l.metodo === "sendMessage");
    return envios.at(-1)?.args[2] as InlineKeyboard | undefined;
  }
  de(metodo: string): LlamadaTg[] {
    return this.llamadas.filter((l) => l.metodo === metodo);
  }
  limpiar() {
    this.llamadas = [];
  }
}

export type DepsPrueba = Deps & { tg: FakeTelegram; clasificarIA: ReturnType<typeof vi.fn> };

/** Reloj que empieza en `inicio` y avanza 1 s por llamada (orden estable de registrado_utc). */
export function reloj(inicio = "2026-10-14T15:00:00.000Z"): () => Date {
  let t = new Date(inicio).getTime();
  return () => new Date((t += 1000) - 1000);
}

export function crearDepsPrueba(over: Partial<Deps> = {}): DepsPrueba {
  return {
    db: env.DB,
    tg: new FakeTelegram(),
    clasificarIA: vi.fn(async (_c: string): Promise<CategoriaIA | null> => "Comida"),
    ahora: reloj(),
    tarjetas: ["nu", "rappi"],
    chatId: "123456",
    ...over,
  } as DepsPrueba;
}

let siguienteUpdate = 1;
export const USUARIO = 123456;

export function mensaje(
  text: string | undefined,
  opts: { from?: number; chatType?: string; updateId?: number; extra?: Record<string, unknown> } = {},
): TgUpdate {
  const msg: TgMessage = {
    message_id: 1,
    from: { id: opts.from ?? USUARIO },
    chat: { id: opts.from ?? USUARIO, type: opts.chatType ?? "private" },
    ...(text !== undefined ? { text } : {}),
    ...opts.extra,
  };
  return { update_id: opts.updateId ?? siguienteUpdate++, message: msg };
}

export function callback(data: string, opts: { from?: number; messageId?: number; updateId?: number } = {}): TgUpdate {
  const cq: TgCallbackQuery = {
    id: `cq-${siguienteUpdate}`,
    from: { id: opts.from ?? USUARIO },
    message: { message_id: opts.messageId ?? 1000, chat: { id: USUARIO } },
    data,
  };
  return { update_id: opts.updateId ?? siguienteUpdate++, callback_query: cq };
}