/**
 * Traduz erros de cancel_visit (frente C). O código vem no DETAIL do Postgres
 * (supabase-js: error.details); aceitamos também no message por segurança.
 */
export function cancelVisitErrorMessage(err: { message?: string; details?: string | null }): string {
  const text = `${err.details ?? ""} ${err.message ?? ""}`;
  if (/cutoff_passed/.test(text)) return "O prazo para cancelar esta visita já passou.";
  return "Não foi possível cancelar a visita agora. Tente novamente em instantes.";
}
