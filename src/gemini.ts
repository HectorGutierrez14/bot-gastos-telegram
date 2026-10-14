import { CATEGORIAS_IA, type CategoriaIA, esCategoriaIA } from "./categorias";
import { log } from "./log";

const INSTRUCCION =
  "Clasifica el concepto de un gasto personal en Colombia en exactamente una categoría. " +
  "Financieros cubre intereses, cuota de manejo, comisiones y seguros de tarjetas o créditos.";

export interface OpcionesGemini {
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/** Devuelve una función que clasifica un concepto; null ante cualquier fallo. */
export function crearClasificadorGemini(opts: OpcionesGemini): (concepto: string) => Promise<CategoriaIA | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`;

  return async (concepto) => {
    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: INSTRUCCION }] },
          contents: [{ role: "user", parts: [{ text: concepto }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: { categoria: { type: "STRING", enum: CATEGORIAS_IA } },
              required: ["categoria"],
            },
          },
        }),
      });
      if (!res.ok) {
        log("gemini_error", { status: res.status });
        return null;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof texto !== "string") throw new Error("respuesta sin texto");
      const categoria = (JSON.parse(texto) as { categoria?: unknown }).categoria;
      if (!esCategoriaIA(categoria)) throw new Error("categoría inválida");
      return categoria;
    } catch (e) {
      log("gemini_error", { error: e instanceof Error ? e.name : "desconocido" });
      return null;
    }
  };
}
