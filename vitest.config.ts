import { readFileSync } from "node:fs";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// No se pasa wrangler.configPath a propósito: wrangler cargaría .dev.vars
// (secretos reales) en el entorno de pruebas. Se toma de wrangler.jsonc solo
// lo no secreto y los secretos se reemplazan por valores falsos evidentes.
const wrangler = JSON.parse(readFileSync("./wrangler.jsonc", "utf8"));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: wrangler.main,
      miniflare: {
        compatibilityDate: wrangler.compatibility_date,
        d1Databases: { DB: wrangler.d1_databases[0].database_name },
        bindings: {
          ...wrangler.vars,
          TELEGRAM_BOT_TOKEN: "test-bot-token",
          TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
          GEMINI_API_KEY: "test-gemini-key",
          ALLOWED_TELEGRAM_USER_ID: "123456",
          TEST_MIGRATIONS: await readD1Migrations("migrations"),
        },
      },
    })),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
