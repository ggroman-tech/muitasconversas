/** Aceita só caminhos internos ("/conta"), evitando open redirect. */
export function safeNext(value: string | null | undefined, fallback = "/conta"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
