import { type Categoria, type CategoriaIA, reglaFija } from "./categorias";
import { normalizar } from "./util/texto";

export interface Clasificacion {
  categoria: Categoria;
  fuente: "regla" | "aprendida" | "ia" | "fallback";
}

export interface DepsClasificacion {
  buscarAprendido(norm: string): Promise<Categoria | null>;
  /** null ante cualquier fallo (error, 429, timeout, respuesta inválida). */
  clasificarIA(concepto: string): Promise<CategoriaIA | null>;
}

/** Regla fija → concepto aprendido → Gemini → Otros (fallback). */
export async function clasificar(concepto: string, deps: DepsClasificacion): Promise<Clasificacion> {
  const fija = reglaFija(concepto);
  if (fija) return { categoria: fija, fuente: "regla" };

  const aprendida = await deps.buscarAprendido(normalizar(concepto));
  if (aprendida) return { categoria: aprendida, fuente: "aprendida" };

  const ia = await deps.clasificarIA(concepto);
  return ia ? { categoria: ia, fuente: "ia" } : { categoria: "Otros", fuente: "fallback" };
}
