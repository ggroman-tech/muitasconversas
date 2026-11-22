"use server";

import { revalidatePath } from "next/cache";
import { cancelVisitErrorMessage } from "@/lib/auth/visit-errors";
import { createSupabaseServerClient, getAuthUser } from "@/lib/auth/supabase-server";

export type CancelVisitState = { status: "idle" | "ok" | "error"; message?: string };

export async function cancelVisit(_prev: CancelVisitState, formData: FormData): Promise<CancelVisitState> {
  if (!(await getAuthUser())) {
    return { status: "error", message: "Sua sessão expirou. Entre novamente." };
  }
  const visitId = String(formData.get("visit_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(visitId)) {
    return { status: "error", message: "Visita inválida." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_visit", { p_visit_id: visitId });
  if (error) return { status: "error", message: cancelVisitErrorMessage(error) };
  revalidatePath("/conta");
  return { status: "ok", message: "Visita cancelada." };
}
