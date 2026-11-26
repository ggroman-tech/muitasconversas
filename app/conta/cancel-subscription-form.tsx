"use client";

import { useActionState } from "react";
import { cancelSubscription, type CancelSubscriptionState } from "./cancelar-assinatura-actions";
import styles from "./conta.module.css";

const initial: CancelSubscriptionState = { status: "idle" };

/** Confirmação simples via <details> (sem diálogo bloqueante de JS). */
export function CancelSubscriptionForm({
  accessUntil,
  refundEligible,
  refundUntil,
}: {
  accessUntil?: string | null;
  /** true: o cancelamento agora é reembolsado (1ª assinatura, até 7 dias da 1ª cobrança); false/undefined: não. */
  refundEligible?: boolean | null;
  refundUntil?: string | null;
}) {
  const [state, action, pending] = useActionState(cancelSubscription, initial);

  return (
    <div className={styles.cancel}>
      {state.status === "error" ? (
        <p role="alert" className="alert" style={{ marginBottom: 12 }}>
          {state.message}
        </p>
      ) : null}
      {state.status === "ok" ? (
        <p role="status" className="alert alert-ok">
          {state.message}
        </p>
      ) : (
        <details>
          <summary>Cancelar assinatura</summary>
          <form action={action} className={styles.cancelBody}>
            <p>
              <strong>Tem certeza que quer cancelar?</strong>
            </p>
            <ul style={{ margin: "0 0 12px 18px" }}>
              <li>A cobrança é interrompida agora: não haverá novas cobranças.</li>
              {refundEligible ? (
                <>
                  <li>
                    <strong>Você está no prazo de 7 dias da primeira cobrança{refundUntil ? ` (até ${refundUntil})` : ""}:</strong> devolvemos o
                    valor pago por inteiro.
                  </li>
                  <li>Nesse caso o acesso termina agora, e as reservas na fila são canceladas.</li>
                </>
              ) : (
                <>
                  <li>
                    {accessUntil
                      ? `Você continua com acesso (reservas, fila e trocas) até ${accessUntil}.`
                      : "Sua assinatura será encerrada agora."}
                  </li>
                  {/* POLÍTICA DE REEMBOLSO: integral só na 1ª assinatura, em até 7 dias da 1ª cobrança (refundEligible). */}
                  <li>O período já pago não é reembolsado (o reembolso vale só na primeira assinatura, em até 7 dias da primeira cobrança).</li>
                </>
              )}
              {refundEligible ? null : <li>Reservas que ainda estiverem na fila nessa data serão canceladas.</li>}
              <li>Para voltar depois, é só assinar de novo, a qualquer momento após o fim do período.</li>
            </ul>
            <button type="submit" className="btn-danger" disabled={pending} aria-busy={pending}>
              {pending ? "Cancelando…" : "Sim, cancelar assinatura"}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
