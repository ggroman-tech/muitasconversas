// Validação HMAC do webhook do Pagar.me (módulo puro, sem dependências).
// Header: X-Hub-Signature: "sha1=<hex>" (HMAC do corpo BRUTO com o segredo do webhook).
// Aceita também "sha256=<hex>" caso a conta/versão envie assim. Veja docs/pagarme-integracao.md.

const ALGOS: Record<string, string> = { sha1: "SHA-1", sha256: "SHA-256" };

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparação em tempo constante (tempo depende só do tamanho, não do conteúdo). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function computeSignature(
  rawBody: string,
  secret: string,
  algo: "sha1" | "sha256" = "sha1",
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: ALGOS[algo] },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
}

/** true somente se o header corresponde ao HMAC do corpo bruto. Nunca lança. */
export async function verifyPagarmeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | null | undefined,
): Promise<boolean> {
  if (!secret || !header) return false;
  const m = /^\s*(sha1|sha256)=([0-9a-fA-F]+)\s*$/.exec(header);
  if (!m) return false;
  const expected = await computeSignature(rawBody, secret, m[1].toLowerCase() as "sha1" | "sha256");
  return timingSafeEqualStr(expected, m[2].toLowerCase());
}
