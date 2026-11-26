"use client";

import { useActionState } from "react";
import { cancelSubscription, type CancelSubscriptionState } from "./cancelar-assinatura-actions";
import styles from "./conta.module.css";

const initial: CancelSubscriptionState = { status: "idle" };

/** Confirmação simples via <details> (sem diálogo bloqueante de JS). */
export function CancelSubscriptionForm({ accessUntil }: { accessUntil?: string | null }) {
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
              <li>
                {accessUntil
                  ? `Você continua com acesso (reservas, fila e trocas) até ${accessUntil}.`
                  : "Sua assinatura será encerrada agora."}
              </li>
              {/* POLÍTICA DE REEMBOLSO: A DEFINIR PELO GABRIEL. Hoje o texto abaixo diz que NÃO há reembolso do período já pago;
                  se a decisão for outra (ex.: proporcional), ajustar aqui e em app/regras. */}
              <li>O período já pago não é reembolsado.</li>
              <li>Reservas que ainda estiverem na fila nessa data serão canceladas.</li>
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
