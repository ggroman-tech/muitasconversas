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
              Tem certeza? A cobrança é interrompida agora
              {accessUntil ? ` e você continua com acesso até ${accessUntil}` : ""}. Depois disso, para
              voltar, será preciso assinar de novo.
            </p>
            <button type="submit" className="btn-danger" disabled={pending}>
              {pending ? "Cancelando…" : "Sim, cancelar assinatura"}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
