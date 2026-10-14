export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

export type Fuente = "regla" | "aprendida" | "ia" | "fallback" | "manual" | "ajuste";

export interface Gasto {
  id: number;
  telegram_update_id: number;
  linea: number;
  fecha_gasto: string;
  registrado_utc: string;
  monto: number;
  concepto: string;
  categoria: string;
  tarjeta: string | null;
  pago_ajuste_id: number | null;
  fuente_clasificacion: Fuente;
  texto_original: string;
}

export interface PagoTarjeta {
  id: number;
  telegram_update_id: number;
  tarjeta: string;
  monto: number;
  fecha_pago: string;
  registrado_utc: string;
  ajuste_resuelto: number;
}
