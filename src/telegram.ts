import { log } from "./log";

export interface TgUser {
  id: number;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  [k: string]: unknown;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  [k: string]: unknown;
}

export interface InlineKeyboard {
  inline_keyboard: { text: string; callback_data: string }[][];
}

type ChatId = number | string;

export interface TelegramApi {
  /** Devuelve el message_id enviado, o null si falló. */
  sendMessage(chatId: ChatId, text: string, teclado?: InlineKeyboard): Promise<number | null>;
  editMessageText(chatId: ChatId, messageId: number, text: string, teclado?: InlineKeyboard): Promise<boolean>;
  editMessageReplyMarkup(chatId: ChatId, messageId: number, teclado?: InlineKeyboard): Promise<boolean>;
  answerCallbackQuery(id: string, text?: string): Promise<boolean>;
  sendDocument(chatId: ChatId, nombre: string, contenido: Uint8Array, caption?: string): Promise<boolean>;
}

const TECLADO_VACIO: InlineKeyboard = { inline_keyboard: [] };

/** Cliente de la Bot API. Nunca loguea la URL (contiene el token) y nunca lanza. */
export class TelegramClient implements TelegramApi {
  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async llamar(metodo: string, body: Record<string, unknown> | FormData): Promise<unknown | null> {
    try {
      const esForm = body instanceof FormData;
      // fetch debe llamarse como función suelta: en Workers, `this.fetchFn(...)` lanza "Illegal invocation".
      const fetchFn = this.fetchFn;
      const res = await fetchFn(`https://api.telegram.org/bot${this.token}/${metodo}`, {
        method: "POST",
        headers: esForm ? undefined : { "content-type": "application/json" },
        body: esForm ? body : JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string };
      if (!res.ok || !data.ok) {
        log("telegram_error", { metodo, status: res.status, descripcion: String(data.description ?? "") });
        return null;
      }
      return data.result ?? true;
    } catch (e) {
      log("telegram_error", { metodo, error: e instanceof Error ? e.name : "desconocido" });
      return null;
    }
  }

  async sendMessage(chatId: ChatId, text: string, teclado?: InlineKeyboard): Promise<number | null> {
    const r = (await this.llamar("sendMessage", {
      chat_id: chatId,
      text,
      ...(teclado ? { reply_markup: teclado } : {}),
    })) as { message_id?: number } | null;
    return r?.message_id ?? null;
  }

  async editMessageText(chatId: ChatId, messageId: number, text: string, teclado?: InlineKeyboard) {
    const r = await this.llamar("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: teclado ?? TECLADO_VACIO,
    });
    return r !== null;
  }

  async editMessageReplyMarkup(chatId: ChatId, messageId: number, teclado?: InlineKeyboard) {
    const r = await this.llamar("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: teclado ?? TECLADO_VACIO,
    });
    return r !== null;
  }

  async answerCallbackQuery(id: string, text?: string) {
    const r = await this.llamar("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
    return r !== null;
  }

  async sendDocument(chatId: ChatId, nombre: string, contenido: Uint8Array, caption?: string) {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("document", new Blob([contenido], { type: "text/csv" }), nombre);
    if (caption) form.append("caption", caption);
    return (await this.llamar("sendDocument", form)) !== null;
  }
}
