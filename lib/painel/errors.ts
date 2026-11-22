/**
 * Traduz erros das RPCs do painel. O código de máquina vem no DETAIL do Postgres
 * (supabase-js: error.details); a mensagem em pt-BR já vem no message, mas só
 * repassamos mensagens de códigos conhecidos (nada de erro técnico para a tela).
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Sua sessão expirou. Entre novamente.",
  forbidden: "Você não tem permissão para esta ação.",
  visit_not_found: "Visita não encontrada.",
  loan_not_found: "Empréstimo não encontrado.",
  invalid_visit_status: "Esta visita não pode receber essa ação no status atual. Atualize a página.",
  invalid_loan_status: "O empréstimo deste livro não está no status esperado (talvez já tenha sido devolvido). Atualize a página.",
  copy_not_held: "O exemplar não está reservado para esta entrega. Atualize a página e confira.",
  invalid_condition: "Escolha a condição do livro: bom, regular ou danificado.",
  invalid_weeks: "Informe um número de semanas entre 1 e 26.",
  cutoff_passed: "O prazo para esta operação já encerrou.",
};

export function painelErrorMessage(err: { message?: string | null; details?: string | null }): string {
  const text = `${err.details ?? ""} ${err.message ?? ""}`;
  if (/config_pending/.test(text)) {
    // a mensagem da RPC é em pt-BR e cita a configuração faltante (ex.: "Configuração window_capacity pendente.")
    const m = /Configuração [\w_]+ pendente\.?|Configuração de horário de sábado inválida\.?/.exec(text);
    return `Configuração pendente: ${m ? m[0] : "falta definir uma configuração (settings)"} Defina o valor em settings e tente de novo.`;
  }
  for (const [code, msg] of Object.entries(MESSAGES)) {
    if (new RegExp(`\\b${code}\\b`).test(text)) return msg;
  }
  return "Não foi possível concluir a ação agora. Tente novamente em instantes.";
}

export const CONDITIONS = [
  { value: "good", label: "Bom" },
  { value: "fair", label: "Regular" },
  { value: "damaged", label: "Danificado" },
] as const;

export function isCondition(v: string): v is (typeof CONDITIONS)[number]["value"] {
  return CONDITIONS.some((c) => c.value === v);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
