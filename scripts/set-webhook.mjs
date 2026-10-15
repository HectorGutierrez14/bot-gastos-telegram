// Configura el webhook y el menú de comandos del bot. Uso: npm run set-webhook
import { cargarVariables, llamarTelegram, redactar } from "./env.mjs";

const COMANDOS = [
  { command: "start", description: "Cómo usar el bot" },
  { command: "ayuda", description: "Formato de gastos y comandos" },
  { command: "informe", description: "Informe: semana, mes, mes pasado o <mes> [año]" },
  { command: "exportar", description: "Exportar a CSV: mes pasado, <mes> [año] o todo" },
  { command: "tope", description: "Ver o definir el tope mensual (off para quitarlo)" },
  { command: "pagotc", description: "Registrar pago de tarjeta: <tarjeta> <monto> [fecha]" },
  { command: "saldotc", description: "Saldo inicial de tarjeta: <tarjeta> <monto>" },
  { command: "tarjeta", description: "Saldos estimados de las tarjetas" },
  { command: "cambiar", description: "Cambiar la categoría del último gasto" },
  { command: "deshacer", description: "Eliminar el último movimiento" },
  { command: "categorias", description: "Ver las categorías" },
  { command: "aprendido", description: "Ver los conceptos aprendidos" },
  { command: "olvidar", description: "Olvidar un concepto aprendido" },
];

let secretos = [];
try {
  const v = cargarVariables(["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "WORKER_URL"]);
  secretos = [v.TELEGRAM_BOT_TOKEN, v.TELEGRAM_WEBHOOK_SECRET];
  if (!v.WORKER_URL.startsWith("https://")) throw new Error("WORKER_URL debe empezar por https://");
  const url = `${v.WORKER_URL.replace(/\/+$/, "")}/webhook`;

  await llamarTelegram(v.TELEGRAM_BOT_TOKEN, "setWebhook", {
    url,
    secret_token: v.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  console.log(redactar(`Webhook configurado en ${url}`, secretos));
  await llamarTelegram(v.TELEGRAM_BOT_TOKEN, "setMyCommands", { commands: COMANDOS });
  console.log(`Menú de comandos actualizado (${COMANDOS.length} comandos).`);
} catch (e) {
  console.error(redactar(`Error: ${e?.message ?? e}`, secretos));
  process.exit(1);
}
