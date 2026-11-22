"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, getAuthUser } from "@/lib/auth/supabase-server";
import { scheduleVisitErrorMessage } from "@/lib/schedule/errors";

export type ScheduleState = { status: "idle" | "ok" | "error"; message?: string };

const UUID = /^[0-9a-f-]{36}$/i;

export async function scheduleVisit(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  if (!(await getAuthUser())) return { status: "error", message: "Sua sessão expirou. Entre novamente." };

  const windowId = Number(formData.get("window_id"));
  const addressId = String(formData.get("address_id") ?? "");
  const noteRaw = String(formData.get("note") ?? "").trim();
  if (!Number.isInteger(windowId) || windowId <= 0) {
    return { status: "error", message: "Escolha um horário de atendimento." };
  }
  if (!UUID.test(addressId)) return { status: "error", message: "Escolha o endereço." };
  if (noteRaw.length > 500) return { status: "error", message: "O recado pode ter no máximo 500 caracteres." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("schedule_visit", {
    p_window_id: windowId,
    p_address_id: addressId,
    p_note: noteRaw || null,
  });
  if (error) return { status: "error", message: scheduleVisitErrorMessage(error) };

  revalidatePath("/conta");
  revalidatePath("/agendar");
  return { status: "ok", message: "Visita agendada! Você pode ver os detalhes em Minha conta." };
}
