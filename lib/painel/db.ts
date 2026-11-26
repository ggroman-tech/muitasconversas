import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient, getAuthUser } from "@/lib/auth/supabase-server";
import type { StaffRole } from "./types";

/**
 * Cliente sem tipos gerados: as views/RPCs do painel não estão em database.types.ts (frente A).
 * Os tipos das linhas ficam em lib/painel/types.ts.
 */
export async function painelClient(): Promise<SupabaseClient> {
  return (await createSupabaseServerClient()) as unknown as SupabaseClient;
}

export type StaffContext = { userId: string; role: StaffRole };

/**
 * O painel só existe no computador da gestão (painel-local.bat define PAINEL_LOCAL=1).
 * No site público a variável não existe: rotas dão 404 e getStaff() devolve sempre null.
 */
export const painelLocalEnabled = () => process.env.PAINEL_LOCAL === "1";

/** Papel do usuário logado (RPC mc_staff_role), SEM exigir MFA. Só para decidir se mostra a tela de MFA. */
export async function getStaffRole(): Promise<StaffContext | null> {
  if (!painelLocalEnabled()) return null;
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await painelClient();
  const { data, error } = await supabase.rpc("mc_staff_role");
  if (error || (data !== "admin" && data !== "ops" && data !== "driver")) return null;
  return { userId: user.id, role: data };
}

export type MfaState = "aal2" | "needs_verify" | "needs_enroll";

/** aal2 = já digitou o código do autenticador nesta sessão. */
export async function getMfaState(): Promise<MfaState> {
  const supabase = await painelClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === "aal2") return "aal2";
  if (data?.nextLevel === "aal2") return "needs_verify";
  return "needs_enroll";
}

/** Staff com MFA concluído (aal2). Usado por todas as páginas e ações do painel. */
export async function getStaff(): Promise<StaffContext | null> {
  const staff = await getStaffRole();
  if (!staff) return null;
  if ((await getMfaState()) !== "aal2") return null;
  return staff;
}

export const canManage = (role: StaffRole) => role === "admin" || role === "ops";
