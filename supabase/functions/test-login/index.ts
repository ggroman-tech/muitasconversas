// MODO TESTE: devolve um token de login (sem e-mail) para UMA conta de teste fixa.
// Só funciona enquanto settings.test_login_until estiver no futuro. Desligar: apagar essa linha de settings.
import { createClient } from "npm:@supabase/supabase-js@2";

const TEST_EMAIL = "gabrielgarciaroman+teste@gmail.com";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: on } = await sb.rpc("test_login_enabled");
  if (on !== true) return json({ error: "disabled" }, 403);
  const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email: TEST_EMAIL });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) return json({ error: "link_failed" }, 500);
  return json({ token_hash: hash });
});
