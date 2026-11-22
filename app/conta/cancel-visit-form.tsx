"use client";

import { useActionState } from "react";
import { cancelVisit, type CancelVisitState } from "./actions";
import styles from "./conta.module.css";

const initial: CancelVisitState = { status: "idle" };

/** Confirmação simples via <details> (sem diálogo bloqueante de JS). */
export function CancelVisitForm({ visitId }: { visitId: string }) {
  const [state, action, pending] = useActionState(cancelVisit, initial);

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
          <summary>Cancelar visita</summary>
          <form action={action} className={styles.cancelBody}>
            <input type="hidden" name="visit_id" value={visitId} />
            <p>Tem certeza de que quer cancelar esta visita?</p>
            <button type="submit" className="btn-danger" disabled={pending}>
              {pending ? "Cancelando…" : "Sim, cancelar visita"}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
