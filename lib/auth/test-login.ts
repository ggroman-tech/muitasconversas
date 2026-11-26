"use server";

import { redirect } from "next/navigation";
import { supabaseEnv } from "./env";
import { safeNext } from "./safe-next";
import { createSupabaseServerClient } from "./supabase-server";

/** Só retorna true enquanto o modo teste estiver ligado no banco (settings.test_login_until no futuro). */
export async function isTestLoginEnabled(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    // RPC fora dos tipos gerados (0096): chamada sem tipagem.
    const { data } = await (supabase as unknown as { rpc: (n: string) => Promise<{ data: unknown }> }).rpc("test_login_enabled");
    return data === true;
  } catch {
    return false;
  }
}

/** MODO TESTE: entra como a conta de teste fixa, sem e-mail. Ignorado se o modo estiver desligado. */
export async function testLogin(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? ""), "/conta");
  if (!(await isTestLoginEnabled())) redirect("/entrar");
  const { url, anonKey } = supabaseEnv();
  let hash: string | null = null;
  try {
    const r = await fetch(`${url}/functions/v1/test-login`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    if (r.ok) hash = ((await r.json()) as { token_hash?: string }).token_hash ?? null;
  } catch {
    /* cai no redirect abaixo */
  }
  if (!hash) redirect("/entrar?erro=link");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: hash });
  if (error) redirect("/entrar?erro=link");
  redirect(next);
}
