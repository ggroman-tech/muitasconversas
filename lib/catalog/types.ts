export type CatalogBook = {
  id: string;
  isbn13: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  published_year: number | null;
  genres: string[];
  genre: string | null;
  condition: string | null;
  description: string | null;
  cover_url: string | null;
  copies_available: number;
  queue_size: number;
};

export type Availability = "todos" | "disponiveis" | "fila";

export function statusLabel(b: Pick<CatalogBook, "copies_available" | "queue_size">): string {
  if (b.copies_available > 0) {
    return b.copies_available === 1 ? "Disponível" : `Disponível (${b.copies_available} exemplares)`;
  }
  return b.queue_size > 0 ? `Fila de ${b.queue_size}` : "Emprestado, sem fila";
}

/**
 * Traduz erros da RPC reserve_book (frente C). A RPC levanta P0001 com mensagem em pt-BR
 * em `message` e o código em `details` (not_authenticated, no_active_subscription, already_reserved...).
 */
export const OVERDUE_MESSAGE = "Você tem um livro em atraso. Devolva-o para fazer novas reservas.";

const SHOW_AS_IS = new Set([
  "not_authenticated", "customer_not_found", "no_active_subscription", "book_not_found",
  "already_reserved", "already_borrowed", "reserve_while_reading_off",
]);

export const NO_SUBSCRIPTION_MESSAGE =
  "Sua assinatura não está ativa. Confirme o pagamento em Minha conta para reservar.";

export function reserveErrorMessage(err: { code?: string; message?: string; details?: string } | null): string {
  if (err?.details === "overdue_blocked") return OVERDUE_MESSAGE;
  if (err?.details === "no_active_subscription") return NO_SUBSCRIPTION_MESSAGE;
  if (err?.details && SHOW_AS_IS.has(err.details) && err.message) return err.message;
  return "Não foi possível reservar agora. Tente novamente em instantes.";
}
