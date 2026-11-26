/**
 * O que a página do livro mostra no lugar do botão "Reservar", conforme a situação do visitante.
 * Função pura (testável): a página só lê os dados e renderiza o que sair daqui.
 */
export type BookActionKind =
  | "login"
  | "no_access"
  | "overdue"
  | "has_offer"
  | "in_queue"
  | "borrowing"
  | "reserve"
  | "queue";

export type BookActionInput = {
  loggedIn: boolean;
  /** Assinatura dá acesso a reservar agora? */
  hasAccess: boolean;
  overdue: boolean;
  /** Situação da reserva DESTE livro para o visitante (my_account.reservations), se houver. */
  reservation: { status: "queued" | "offered"; position: number | null } | null;
  /** O visitante está com este livro em mãos (empréstimo em andamento)? */
  borrowing: boolean;
  copiesAvailable: number;
};

export function bookActionKind(i: BookActionInput): BookActionKind {
  if (!i.loggedIn) return "login";
  // já tem relação com este livro: isso vale mais do que o estado da assinatura
  if (i.borrowing) return "borrowing";
  if (i.reservation?.status === "offered") return "has_offer";
  if (i.reservation?.status === "queued") return "in_queue";
  if (!i.hasAccess) return "no_access";
  if (i.overdue) return "overdue";
  return i.copiesAvailable > 0 ? "reserve" : "queue";
}

export function reservationNotice(r: { status: "queued" | "offered"; position: number | null }): { title: string; text: string } {
  if (r.status === "offered") {
    return {
      title: "Este livro está reservado para você",
      text: "Escolha agora a troca de sábado para receber o livro. A reserva fica guardada por tempo limitado.",
    };
  }
  return {
    title: "Você está na fila deste livro",
    text: r.position
      ? `Sua posição na fila: ${r.position}º. Avisamos por e-mail quando chegar a sua vez.`
      : "Avisamos por e-mail quando chegar a sua vez.",
  };
}
