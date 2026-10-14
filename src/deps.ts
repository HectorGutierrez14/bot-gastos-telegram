import type { CategoriaIA } from "./categorias";
import type { Env } from "./env";
import { crearClasificadorGemini } from "./gemini";
import { parseTarjetas } from "./tarjetas";
import { type TelegramApi, TelegramClient } from "./telegram";

export interface Deps {
  db: D1Database;
  tg: TelegramApi;
  clasificarIA: (concepto: string) => Promise<CategoriaIA | null>;
  ahora: () => Date;
  tarjetas: string[];
  /** Chat del usuario autorizado (en chats privados coincide con su ID). */
  chatId: string;
}

export function crearDeps(env: Env, fetchFn: typeof fetch = fetch): Deps {
  return {
    db: env.DB,
    tg: new TelegramClient(env.TELEGRAM_BOT_TOKEN, fetchFn),
    clasificarIA: crearClasificadorGemini({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, fetchFn }),
    ahora: () => new Date(),
    tarjetas: parseTarjetas(env.TARJETAS_CREDITO),
    chatId: env.ALLOWED_TELEGRAM_USER_ID,
  };
}
