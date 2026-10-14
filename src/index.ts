import { procesarUpdate } from "./bot";
import { crearDeps } from "./deps";
import type { Env } from "./env";
import { log } from "./log";
import type { TgUpdate } from "./telegram";

const MAX_BODY = 64 * 1024;

async function sha256(texto: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
}

/** Comparación en tiempo constante (se comparan los hashes para igualar longitudes). */
async function secretoValido(recibido: string | null, esperado: string): Promise<boolean> {
  if (recibido === null || esperado === "") return false;
  const [a, b] = await Promise.all([sha256(recibido), sha256(esperado)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/webhook" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }
    if (!(await secretoValido(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.TELEGRAM_WEBHOOK_SECRET))) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
      return new Response("Payload too large", { status: 413 });
    }
    const cuerpo = await request.arrayBuffer();
    if (cuerpo.byteLength > MAX_BODY) return new Response("Payload too large", { status: 413 });

    let update: TgUpdate;
    try {
      update = JSON.parse(new TextDecoder().decode(cuerpo)) as TgUpdate;
    } catch {
      return new Response("ok");
    }
    if (typeof update?.update_id !== "number") return new Response("ok");

    ctx.waitUntil(
      procesarUpdate(update, crearDeps(env), env.ALLOWED_TELEGRAM_USER_ID).catch((e: unknown) => {
        log("error_proceso", { update_id: update.update_id, error: e instanceof Error ? e.name : "desconocido" });
      }),
    );
    return new Response("ok");
  },

  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {},
} satisfies ExportedHandler<Env>;
