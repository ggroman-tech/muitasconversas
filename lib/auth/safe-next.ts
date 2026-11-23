/** Aceita só caminhos internos ("/conta"), evitando open redirect. */
export function safeNext(value: string | null | undefined, fallback = "/conta"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // caracteres de controle (ex.: TAB) são removidos pelo navegador e podem virar "//host"
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  try {
    if (new URL(value, "http://x.invalid").origin !== "http://x.invalid") return fallback;
  } catch {
    return fallback;
  }
  return value;
}
