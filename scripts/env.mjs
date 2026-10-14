// Utilidades de los scripts de configuración. Nunca imprimir valores de secretos.
import { readFileSync } from "node:fs";

/** Parsea líneas CLAVE=valor de un archivo .dev.vars (ignora vacías y comentarios). */
export function parseDevVars(contenido) {
  const vars = {};
  for (const linea of contenido.split(/\r?\n/)) {
    const t = linea.trim();
    if (t === "" || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let valor = t.slice(i + 1).trim();
    if (/^(["']).*\1$/.test(valor)) valor = valor.slice(1, -1);
    vars[t.slice(0, i).trim()] = valor;
  }
  return vars;
}

/** Carga las variables pedidas: process.env tiene prioridad sobre .dev.vars. */
export function cargarVariables(nombres, { leerArchivo = () => readFileSync(".dev.vars", "utf8") } = {}) {
  let archivo = {};
  try {
    archivo = parseDevVars(leerArchivo());
  } catch (e) {
    if (e?.code !== "ENOENT") throw new Error("No se pudo leer .dev.vars");
  }
  const vars = {};
  for (const nombre of nombres) {
    const valor = process.env[nombre] || archivo[nombre];
    if (!valor) throw new Error(`Falta la variable ${nombre}`);
    vars[nombre] = valor;
  }
  return vars;
}

/** Reemplaza cada secreto presente en el texto por ***. */
export function redactar(texto, secretos) {
  let r = String(texto);
  for (const s of secretos) if (s) r = r.split(s).join("***");
  return r;
}

/**
 * Llama a un método de la Bot API. Ante error lanza un Error con solo el método,
 * el status y la descripción de Telegram (nunca la URL, que contiene el token).
 */
export async function llamarTelegram(token, metodo, body) {
  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch (e) {
    throw new Error(`${metodo}: error de red (${e?.name ?? "desconocido"})`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(`${metodo}: ${res.status} ${data.description ?? ""}`.trim());
  return data.result;
}
