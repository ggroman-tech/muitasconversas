"use client";

import { useActionState, type ReactNode } from "react";
import { CONDITIONS } from "@/lib/painel/errors";
import type { ActionState } from "@/lib/painel/types";
import {
  cancelVisitAction,
  confirmDeliveryAction,
  generateSaturdaysAction,
  markVisitFailedAction,
  registerReturnAction,
} from "./actions";
import styles from "./painel.module.css";

const initial: ActionState = { status: "idle" };

function Feedback({ state }: { state: ActionState }) {
  if (state.status === "error") {
    return (
      <p role="alert" className={styles.errorBox}>
        {state.message}
      </p>
    );
  }
  if (state.status === "ok") {
    return (
      <p role="status" className={styles.okBox}>
        {state.message}
      </p>
    );
  }
  return null;
}

/** Confirmação em duas etapas via <details> (sem confirm()/alert do navegador). */
function Confirm({
  summary,
  state,
  children,
}: {
  summary: string;
  state: ActionState;
  children: ReactNode;
}) {
  if (state.status === "ok") return <Feedback state={state} />;
  return (
    <div>
      <Feedback state={state} />
      <details className={styles.details}>
        <summary>{summary}</summary>
        {children}
      </details>
    </div>
  );
}

export function ConfirmDeliveryForm({ visitId, hasDeliver }: { visitId: string; hasDeliver: boolean }) {
  const [state, action, pending] = useActionState(confirmDeliveryAction, initial);
  return (
    <Confirm summary={hasDeliver ? "Confirmar entrega" : "Confirmar visita"} state={state}>
      <form action={action}>
        <input type="hidden" name="visit_id" value={visitId} />
        <p>
          {hasDeliver
            ? "O livro foi entregue ao assinante? O prazo de devolução começa a contar a partir de hoje."
            : "Confirmar que a visita foi concluída?"}
        </p>
        <button type="submit" className={styles.btn} disabled={pending}>
          {pending ? "Confirmando…" : "Sim, confirmar"}
        </button>
      </form>
    </Confirm>
  );
}

export function RegisterReturnForm({ loanId, title }: { loanId: string; title: string }) {
  const [state, action, pending] = useActionState(registerReturnAction, initial);
  return (
    <Confirm summary={`Registrar devolução de “${title}”`} state={state}>
      <form action={action}>
        <input type="hidden" name="loan_id" value={loanId} />
        <fieldset className={styles.radios}>
          <legend>Condição do livro devolvido</legend>
          {CONDITIONS.map((c, i) => (
            <label key={c.value}>
              <input type="radio" name="condition" value={c.value} required defaultChecked={i === 0} />
              {c.label}
            </label>
          ))}
        </fieldset>
        <button type="submit" className={styles.btn} disabled={pending}>
          {pending ? "Registrando…" : "Registrar devolução"}
        </button>
      </form>
    </Confirm>
  );
}

export function MarkFailedForm({ visitId }: { visitId: string }) {
  const [state, action, pending] = useActionState(markVisitFailedAction, initial);
  const id = `falha-${visitId}`;
  return (
    <Confirm summary="Marcar como falha" state={state}>
      <form action={action}>
        <input type="hidden" name="visit_id" value={visitId} />
        <div className={styles.fieldRow}>
          <label htmlFor={id}>Motivo da falha (obrigatório)</label>
          <input id={id} name="reason" className={styles.input} required maxLength={500} placeholder="Ex.: ninguém em casa" />
        </div>
        <p className={styles.muted}>O livro volta para a reserva do assinante e a coleta volta a ficar pendente.</p>
        <button type="submit" className={`${styles.btn} ${styles.btnDanger}`} disabled={pending}>
          {pending ? "Registrando…" : "Marcar visita como falha"}
        </button>
      </form>
    </Confirm>
  );
}

export function CancelVisitStaffForm({ visitId }: { visitId: string }) {
  const [state, action, pending] = useActionState(cancelVisitAction, initial);
  const id = `cancelar-${visitId}`;
  return (
    <Confirm summary="Cancelar visita" state={state}>
      <form action={action}>
        <input type="hidden" name="visit_id" value={visitId} />
        <div className={styles.fieldRow}>
          <label htmlFor={id}>Motivo (opcional)</label>
          <input id={id} name="reason" className={styles.input} maxLength={500} placeholder="Ex.: pedido pelo WhatsApp" />
        </div>
        <button type="submit" className={`${styles.btn} ${styles.btnDanger}`} disabled={pending}>
          {pending ? "Cancelando…" : "Sim, cancelar visita"}
        </button>
      </form>
    </Confirm>
  );
}

export function GenerateSaturdaysForm() {
  const [state, action, pending] = useActionState(generateSaturdaysAction, initial);
  return (
    <form action={action}>
      <div className={styles.fieldRow}>
        <label htmlFor="weeks">Quantas semanas gerar a partir do próximo sábado? (1 a 26)</label>
        <input
          id="weeks"
          name="weeks"
          type="number"
          inputMode="numeric"
          min={1}
          max={26}
          defaultValue={8}
          required
          className={styles.input}
          style={{ width: "8rem" }}
        />
      </div>
      <button type="submit" className={styles.btn} disabled={pending}>
        {pending ? "Gerando…" : "Gerar sábados"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function PrintButton() {
  return (
    <button type="button" className={styles.btnGhost} onClick={() => window.print()}>
      Imprimir lista
    </button>
  );
}
