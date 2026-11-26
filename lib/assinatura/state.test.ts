import { describe, expect, it } from "vitest";
import { deriveSubscriptionState } from "./state";

const today = "2026-11-22";

describe("deriveSubscriptionState", () => {
  it("pendente sem pagamento: aguardando", () => {
    const s = deriveSubscriptionState({ status: "pending", today });
    expect(s.key).toBe("awaiting_payment");
    expect(s.canPay).toBe(true);
    expect(s.hasAccess).toBe(false);
  });
  it("pendente com assinatura do MP vinculada: verificando", () => {
    const s = deriveSubscriptionState({ status: "pending", payment: { mp_linked: true }, today });
    expect(s.key).toBe("verifying");
    expect(s.canPay).toBe(false);
    expect(s.canVerify).toBe(true);
  });
  it("pendente com retorno do MP: verificando", () => {
    expect(deriveSubscriptionState({ status: "pending", justReturned: true, today }).key).toBe("verifying");
  });
  it("pendente com último pagamento aprovado: verificando", () => {
    const s = deriveSubscriptionState({ status: "pending", payment: { last_payment_status: "approved" }, today });
    expect(s.key).toBe("verifying");
  });
  it("pendente com pagamento recusado: falhou", () => {
    const s = deriveSubscriptionState({ status: "pending", payment: { last_payment_status: "rejected" }, today });
    expect(s.key).toBe("payment_failed");
    expect(s.canPay).toBe(true);
  });
  it("ativa dentro do período", () => {
    const s = deriveSubscriptionState({ status: "active", currentPeriodEnd: "2026-12-22", today });
    expect(s.key).toBe("active");
    expect(s.hasAccess).toBe(true);
  });
  it("ativa no último dia do período ainda tem acesso", () => {
    expect(deriveSubscriptionState({ status: "active", currentPeriodEnd: "2026-11-22", today }).hasAccess).toBe(true);
  });
  it("ativa com período vencido: sem acesso", () => {
    const s = deriveSubscriptionState({ status: "active", currentPeriodEnd: "2026-11-21T03:00:00Z", today });
    expect(s.key).toBe("expired");
    expect(s.hasAccess).toBe(false);
    expect(s.canVerify).toBe(true);
  });
  it("atrasada, pausada, cancelada e sem assinatura", () => {
    expect(deriveSubscriptionState({ status: "past_due", today }).key).toBe("past_due");
    expect(deriveSubscriptionState({ status: "paused", today }).key).toBe("paused");
    expect(deriveSubscriptionState({ status: "canceled", today }).canPay).toBe(true);
    expect(deriveSubscriptionState({ status: null, today }).key).toBe("none");
  });
  it("ativa com cancelamento solicitado: mantém o acesso e sinaliza", () => {
    const s = deriveSubscriptionState({
      status: "active",
      currentPeriodEnd: "2026-12-22",
      payment: { cancel_requested_at: "2026-11-22T12:00:00Z" },
      today,
    });
    expect(s.key).toBe("active");
    expect(s.hasAccess).toBe(true);
    expect(s.cancelRequested).toBe(true);
    expect(s.canPay).toBe(false);
  });
  it("ativa sem pedido de cancelamento não sinaliza", () => {
    expect(deriveSubscriptionState({ status: "active", currentPeriodEnd: "2026-12-22", today }).cancelRequested).toBe(false);
  });
  it("recusado mas com pagamento aprovado depois: verificando, não falhou", () => {
    const s = deriveSubscriptionState({ status: "pending", payment: { last_payment_status: "approved", mp_linked: true }, today });
    expect(s.key).toBe("verifying");
  });
  it("quem cancelou pode assinar de novo, mas não precisa verificar", () => {
    const s = deriveSubscriptionState({ status: "canceled", today });
    expect(s.canPay).toBe(true);
    expect(s.canVerify).toBe(false);
    expect(s.hasAccess).toBe(false);
  });
  it("período vencido sem data conhecida não derruba quem está ativo", () => {
    expect(deriveSubscriptionState({ status: "active", currentPeriodEnd: null, today }).hasAccess).toBe(true);
  });
});
