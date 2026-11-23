"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/painel/types";
import { linkMpPreapprovalAction } from "../actions";
import styles from "../painel.module.css";

const initial: ActionState = { status: "idle" };

export function LinkMpForm({ preapprovalId, customers }: { preapprovalId: string; customers: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(linkMpPreapprovalAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="preapproval_id" value={preapprovalId} />
      <label>
        <span className={styles.muted}>Cliente </span>
        <select name="customer_id" required defaultValue="">
          <option value="" disabled>Escolher…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </label>{" "}
      <button type="submit" disabled={pending}>{pending ? "Vinculando…" : "Vincular"}</button>
      {state.status === "error" ? <p role="alert" className={styles.errorBox}>{state.message}</p> : null}
      {state.status === "ok" ? <p role="status" className={styles.okBox}>{state.message}</p> : null}
    </form>
  );
}
