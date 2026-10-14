import { contienePalabra, normalizar } from "./util/texto";

/** Categorías que puede asignar Gemini (enum cerrado). */
export const CATEGORIAS_IA = [
  "Comida",
  "Mercado",
  "Transporte",
  "Deporte",
  "Facturas",
  "Viajes",
  "Salud",
  "Hogar",
  "Entretenimiento",
  "Compras",
  "Educación",
  "Financieros",
  "Otros",
] as const;

/** Categorías que solo asigna la regla fija (nunca Gemini). */
export const CATEGORIAS_FIJAS = ["Lau", "Moto", "Apto"] as const;

/** Orden fijo: el índice se usa en el callback_data de los botones. */
export const CATEGORIAS = [...CATEGORIAS_IA, ...CATEGORIAS_FIJAS] as const;

export type CategoriaIA = (typeof CATEGORIAS_IA)[number];
export type CategoriaFija = (typeof CATEGORIAS_FIJAS)[number];
export type Categoria = (typeof CATEGORIAS)[number];

/** Paso 1 de clasificación: palabra completa lau/moto/apto; gana la que aparece primero. */
export function reglaFija(concepto: string): CategoriaFija | null {
  const texto = normalizar(concepto);
  let mejor: { cat: CategoriaFija; pos: number } | null = null;
  for (const cat of CATEGORIAS_FIJAS) {
    const pos = contienePalabra(texto, cat.toLowerCase());
    if (pos >= 0 && (mejor === null || pos < mejor.pos)) mejor = { cat, pos };
  }
  return mejor?.cat ?? null;
}

export function buscarCategoria(texto: string): Categoria | null {
  const t = normalizar(texto);
  return CATEGORIAS.find((c) => normalizar(c) === t) ?? null;
}

export function esCategoriaIA(valor: unknown): valor is CategoriaIA {
  return typeof valor === "string" && (CATEGORIAS_IA as readonly string[]).includes(valor);
}
