/**
 * Traduz erros de schedule_visit (frente C). O código vem no DETAIL do Postgres
 * (supabase-js: error.details); aceitamos também no message por segurança.
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Sua sessão expirou. Entre novamente.",
  customer_not_found: "Não encontramos o seu cadastro. Fale com a gente.",
  window_not_found: "Esse horário não existe mais. Escolha outro.",
  day_closed: "Este sábado não está aberto para agendamento.",
  cutoff_passed: "O prazo para agendar neste sábado já encerrou (08h do sábado). Escolha o próximo sábado, quando abrir.",
  address_not_found: "Endereço inválido. Escolha um dos seus endereços.",
  area_mismatch: "O endereço escolhido não pertence ao bairro desta janela de entrega.",
  already_scheduled: "Você já tem uma visita agendada neste sábado. Cancele em Minha conta para agendar de novo.",
  window_full: "Esta janela está lotada. Escolha outra.",
  nothing_to_do: "Não há entrega nem coleta para agendar agora.",
  no_active_subscription: "É preciso ter uma assinatura ativa para agendar.",
  overdue_blocked:
    "Devolva o livro em atraso para voltar a receber livros. Você ainda pode agendar a coleta dele.",
  config_pending: "O agendamento está temporariamente indisponível. Tente novamente mais tarde.",
};

const GENERIC = "Não foi possível agendar agora. Tente novamente em instantes.";

export function scheduleVisitErrorMessage(err: { message?: string; details?: string | null }): string {
  const text = `${err.details ?? ""} ${err.message ?? ""}`;
  for (const code of Object.keys(MESSAGES)) {
    if (new RegExp(`\\b${code}\\b`).test(text)) return MESSAGES[code];
  }
  return GENERIC;
}
