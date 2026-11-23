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
        };
      }
      return {
        key: "active",
        label: "Ativa",
        description: end ? "Sua assinatura está ativa." : "Sua assinatura está ativa.",
        hasAccess: true,
        canPay: false,
        canVerify: false,
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
        };
      }
      if (mpLinked || paidSomething) {
        return {
          key: "verifying",
          label: "Verificando pagamento",
          description:
            "Encontramos o seu pagamento no Mercado Pago e estamos confirmando. Costuma levar poucos instantes.",
          hasAccess: false,
          canPay: false,
          canVerify: true,
        };
      }
      return {
        key: "awaiting_payment",
        label: "Aguardando pagamento",
        description:
          "Sua assinatura foi criada e aguarda o pagamento. Se você já pagou, use “Já paguei, verificar agora”.",
        hasAccess: false,
        canPay: true,
        canVerify: true,
      };
    case "past_due":
      return {
        key: "past_due",
        label: "Pagamento em atraso",
        description:
          "Não identificamos o último pagamento. Enquanto isso, não dá para reservar nem agendar. Se você já pagou, use “Já paguei, verificar agora”.",
        hasAccess: false,
        canPay: true,
        canVerify: true,
      };
    case "paused":
      return {
        key: "paused",
        label: "Pausada",
        description: "Sua assinatura está pausada. Entre em contato para reativar.",
        hasAccess: false,
        canPay: false,
        canVerify: false,
      };
    case "canceled":
      return {
        key: "canceled",
        label: "Cancelada",
        description: "Esta assinatura foi cancelada. Você pode assinar de novo quando quiser.",
        hasAccess: false,
        canPay: true,
        canVerify: false,
      };
    default:
      return {
        key: "none",
        label: "Sem assinatura",
        description: "Você ainda não tem uma assinatura.",
        hasAccess: false,
        canPay: false,
        canVerify: false,
      };
  }
}
