export type Callback =
  | { t: "edit"; gastoId: number }
  | { t: "cancel"; gastoId: number }
  | { t: "cat"; gastoId: number; indice: number }
  | { t: "tc"; gastoId: number; indice: number | "x" }
  | { t: "aj"; pagoId: number; opcion: "int" | "compra" | "favor" };

const MAX_BYTES = 64;

/** Valida estrictamente el callback_data. Nunca confiar en él sin verificar contra la base. */
export function parseCallback(data: string | undefined): Callback | null {
  if (!data || new TextEncoder().encode(data).length > MAX_BYTES) return null;
  let m: RegExpExecArray | null;
  if ((m = /^(edit|cancel):(\d{1,10})$/.exec(data))) return { t: m[1] as "edit" | "cancel", gastoId: Number(m[2]) };
  if ((m = /^cat:(\d{1,10}):(\d{1,2})$/.exec(data))) return { t: "cat", gastoId: Number(m[1]), indice: Number(m[2]) };
  if ((m = /^tc:(\d{1,10}):(\d{1,2}|x)$/.exec(data))) {
    return { t: "tc", gastoId: Number(m[1]), indice: m[2] === "x" ? "x" : Number(m[2]) };
  }
  if ((m = /^aj:(\d{1,10}):(int|compra|favor)$/.exec(data))) {
    return { t: "aj", pagoId: Number(m[1]), opcion: m[2] as "int" | "compra" | "favor" };
  }
  return null;
}
