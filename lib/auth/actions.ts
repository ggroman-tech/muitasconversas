"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { siteUrl } from "./env";
import { safeNext } from "./safe-next";
import { createSupabaseServerClient } from "./supabase-server";

export type MagicLinkState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Envia o link mágico. Mesma resposta para e-mail novo ou existente. */
export async function requestMagicLink(_prev: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(String(formData.get("next") ?? ""), "/conta");
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { status: "error", message: "Informe um e-mail válido.", email };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : null;
  const redirectTo = `${siteUrl(origin)}/auth/callback?next=${encodeURIComponent(next)}`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) {
    const limited = error.status === 429 || /rate|seconds/i.test(error.message);
    return {
      status: "error",
      email,
      message: limited
        ? "Muitas tentativas. Aguarde um minuto e peça um novo link."
        : "Não foi possível enviar o link agora. Tente novamente em instantes.",
    };
  }
  return { status: "sent", email };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
