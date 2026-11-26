"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/safe-next";
import { getStaffRole, painelClient, painelLocalEnabled } from "@/lib/painel/db";

export type EnrollState = { status: "idle" | "ready" | "error"; factorId?: string; qr?: string; secret?: string; message?: string };
export type VerifyState = { status: "idle" | "error"; message?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_PERMISSION = "Sem permissão.";

async function allowed() {
  return painelLocalEnabled() && !!(await getStaffRole());
}

/** Gera o QR Code do autenticador. Só enquanto NÃO existe autenticador confirmado. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function startEnroll(_prev: EnrollState): Promise<EnrollState> {
  if (!(await allowed())) return { status: "error", message: NO_PERMISSION };
  const supabase = await painelClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp?.length) {
    return { status: "error", message: "Já existe um autenticador confirmado. Use a tela de verificação." };
  }
  // limpa tentativas antigas não confirmadas
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Painel local",
    issuer: "Muitas Conversas",
  });
  if (error || !data) return { status: "error", message: "Não foi possível gerar o código agora. Tente de novo." };
  return { status: "ready", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

function readCode(fd: FormData) {
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/** Confirma o autenticador recém-cadastrado com o primeiro código. */
export async function confirmEnroll(_prev: VerifyState, fd: FormData): Promise<VerifyState> {
  if (!(await allowed())) return { status: "error", message: NO_PERMISSION };
  const factorId = String(fd.get("factorId") ?? "");
  const code = readCode(fd);
  if (!UUID_RE.test(factorId)) return { status: "error", message: "Cadastro inválido. Gere o QR Code de novo." };
  if (!code) return { status: "error", message: "Digite os 6 números que aparecem no aplicativo." };
  const supabase = await painelClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { status: "error", message: "Código incorreto ou expirado. Confira o relógio do celular e tente de novo." };
  redirect(safeNext(String(fd.get("next") ?? ""), "/painel"));
}

/** Login: pede o código do autenticador já cadastrado. */
export async function verifyCode(_prev: VerifyState, fd: FormData): Promise<VerifyState> {
  if (!(await allowed())) return { status: "error", message: NO_PERMISSION };
  const code = readCode(fd);
  if (!code) return { status: "error", message: "Digite os 6 números que aparecem no aplicativo." };
  const supabase = await painelClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) return { status: "error", message: "Nenhum autenticador cadastrado." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { status: "error", message: "Código incorreto ou expirado. Tente o próximo código do aplicativo." };
  redirect(safeNext(String(fd.get("next") ?? ""), "/painel"));
}
