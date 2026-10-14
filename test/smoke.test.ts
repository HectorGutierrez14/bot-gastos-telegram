import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("scaffold", () => {
  it("usa secretos de prueba, nunca los de .dev.vars", () => {
    expect(env.TELEGRAM_BOT_TOKEN).toBe("test-bot-token");
    expect(env.ALLOWED_TELEGRAM_USER_ID).toBe("123456");
    expect(env.GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
  });

  it("aplica migraciones", async () => {
    const r = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gastos'").first();
    expect(r).not.toBeNull();
  });

  it("GET / responde 404", async () => {
    const res = await worker.fetch(new Request("https://x/"), env, createExecutionContext());
    expect(res.status).toBe(404);
  });
});
