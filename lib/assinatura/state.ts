/**
 * Estado de assinatura mostrado ao cliente. Função pura (testável) que junta
 * a situação gravada no banco (my_account) com o que sabemos do Mercado Pago.
 */
export type DbSubscriptionStatus = "pending" | "active" | "past_due" | "paused" | "canceled";

/** Resposta (opcional) da RPC my_payment_state(); ver CONTRATO-FRONT-BACK.md. */
export type PaymentInfo = {
  mp_linked?: boolean | null;
  mp_status?: string | null;
  last_payment_status?: string | null;
  last_payment_at?: string | null;
  /** Quando o cliente pediu o cancelamento (acesso segue até o fim do período pago). */
  cancel_requested_at?: string | null;
  /** Política de reembolso: true se um cancelamento agora seria reembolsado (1ª assinatura, até 7 dias da 1ª cobrança). */
  refund_eligible?: boolean | null;
  /** Último dia (yyyy-mm-dd) em que o cancelamento ainda é reembolsado; null se não elegível. */
  refund_until?: string | null;
} | null;

export type SubscriptionStateKey =
  | "none"
  | "awaiting_payment"
  | "verifying"
  | "payment_failed"
  | "active"
  | "expired"
  | "past_due"
  | "paused"
  | "canceled";

export type SubscriptionState = {
  key: SubscriptionStateKey;
  /** Rótulo curto (selo). */
  label: string;
  /** Texto de apoio para o cliente. */
  description: string;
  /** Pode reservar livros / agendar? */
  hasAccess: boolean;
  /** Mostrar "Pagar a assinatura"? */
  canPay: boolean;
  /** Mostrar "Já paguei, verificar agora"? */
  canVerify: boolean;
  /** O cliente pediu cancelamento: a cobrança parou e o acesso segue até o fim do período pago. */
  cancelRequested: boolean;
};

/** Data de hoje (yyyy-mm-dd) em America/Sao_Paulo, o mesmo critério do banco. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

export function deriveSubscriptionState(input: {
  status: DbSubscriptionStatus | null | undefined;
  currentPeriodEnd?: string | null;
  payment?: PaymentInfo;
  /** Quando a página acabou de receber o retorno do Mercado Pago. */
  justReturned?: boolean;
  today?: string;
}): SubscriptionState {
  const { status, currentPeriodEnd, payment, justReturned } = input;
  const today = input.today ?? todayInSaoPaulo();
  const paidSomething =
    payment?.last_payment_status === "approved" || payment?.last_payment_status === "paid";
  const failed =
    payment?.last_payment_status === "rejected" ||
    payment?.last_payment_status === "cancelled" ||
    payment?.last_payment_status === "failed";
  const mpLinked = Boolean(payment?.mp_linked) || justReturned === true;

  switch (status) {
    case "active": {
      const end = currentPeriodEnd ? currentPeriodEnd.slice(0, 10) : null;
      if (end && end < today) {
        return {
          key: "expired",
          label: "Renovação pendente",
          description:
            "O período pago terminou e ainda não identificamos a renovação. Se você já pagou, use “Já paguei, verificar agora”.",
          hasAccess: false,
          canPay: true,
          canVerify: true,
          cancelRequested: false,
        };
      }
      const cancelRequested = Boolean(payment?.cancel_requested_at);
      return {
        key: "active",
        label: cancelRequested ? "Ativa até o fim do período" : "Ativa",
        description: cancelRequested
          ? "Você cancelou: não haverá novas cobranças e seu acesso continua até o fim do período pago."
          : "Sua assinatura está ativa.",
        hasAccess: true,
        canPay: false,
        canVerify: false,
        cancelRequested,
      };
    }
    case "pending":
      if (failed && !paidSomething) {
        return {
          key: "payment_failed",
          label: "Pagamento não aprovado",
          description:
            "O Mercado Pago não aprovou o pagamento. Tente de novo com outro cartão ou confira com o seu banco.",
          hasAccess: false,
          canPay: true,
          canVerify: true,
          cancelRequested: false,
        };
      }
      if (mpLinked || paidSomething) {
        return {
          key: "verifying",
          label: "Verificando pagamento",
          description:
            "Encontramos o seu pagamento no Mercado Pago e estamos confirmando. Costuma levar de alguns segundos a uns 5 minutos; você pode conferir na hora com o botão abaixo.",
          hasAccess: false,
          canPay: false,
          canVerify: true,
          cancelRequested: false,
        };
      }
      return {
        key: "awaiting_payment",
        label: "Aguardando pagamento",
        description:
          "Sua assinatura foi criada e aguarda o pagamento. Se você já pagou, use “Já paguei, verificar agora”: a confirmação automática pode levar até 5 minutos.",
        hasAccess: false,
        canPay: true,
        canVerify: true,
        cancelRequested: false,
      };
    case "past_due":
      return {
        key: "past_due",
        label: "Pagamento em atraso",
        description:
          "Não identificamos o pagamento deste mês, mesmo depois dos 3 dias de carência. Enquanto isso, não dá para reservar nem agendar. Se você já pagou, use “Já paguei, verificar agora”.",
        hasAccess: false,
        canPay: true,
        canVerify: true,
        cancelRequested: false,
      };
    case "paused":
      return {
        key: "paused",
        label: "Pausada",
        description: "Sua assinatura está pausada. Entre em contato para reativar.",
        hasAccess: false,
        canPay: false,
        canVerify: false,
        cancelRequested: false,
      };
    case "canceled":
      return {
        key: "canceled",
        label: "Cancelada",
        description: "Esta assinatura foi cancelada. Você pode assinar de novo quando quiser.",
        hasAccess: false,
        canPay: true,
        canVerify: false,
        cancelRequested: false,
      };
    default:
      return {
        key: "none",
        label: "Sem assinatura",
        description: "Você ainda não tem uma assinatura.",
        hasAccess: false,
        canPay: false,
        canVerify: false,
        cancelRequested: false,
      };
  }
}
