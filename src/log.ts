/** Log mínimo en JSON. Nunca incluir texto de mensajes, tokens ni URLs de Telegram. */
export function log(evento: string, datos: Record<string, string | number> = {}): void {
  console.log(JSON.stringify({ evento, ...datos }));
}
