import "server-only";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import type { ScheduleOptions } from "./types";

export async function getScheduleOptions(): Promise<{ data: ScheduleOptions | null; error: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("schedule_options");
  if (error || !data) return { data: null, error: true };
  return { data: data as unknown as ScheduleOptions, error: false };
}
