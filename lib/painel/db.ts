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

/** Papel do usuário logado (RPC mc_staff_role, que lê staff_members); null se não for staff. */
export async function getStaff(): Promise<StaffContext | null> {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await painelClient();
  const { data, error } = await supabase.rpc("mc_staff_role");
  if (error || (data !== "admin" && data !== "ops" && data !== "driver")) return null;
  return { userId: user.id, role: data };
}

export const canManage = (role: StaffRole) => role === "admin" || role === "ops";
