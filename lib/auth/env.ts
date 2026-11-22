// Variáveis de ambiente da frente A. Lidas só em tempo de requisição
// (nunca no import), para o build passar sem .env.
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (veja .env.example).",
    );
  }
  return { url, anonKey };
}

/** URL pública do site, usada no redirecionamento do link mágico. */
export function siteUrl(requestOrigin?: string | null): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  const base = fromEnv || requestOrigin || "http://localhost:3000";
  return base.replace(/\/+$/, "");
}
