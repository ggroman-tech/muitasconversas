"use client";

import { useActionState } from "react";
import { requestMagicLink, type MagicLinkState } from "./actions";
import styles from "./ui.module.css";

const initial: MagicLinkState = { status: "idle" };

export function LoginForm({
  next,
  submitLabel = "Enviar link de acesso",
}: {
  next: string;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState(requestMagicLink, initial);

  if (state.status === "sent") {
    return (
      <div className={styles.okBox} role="status">
        <p>
          <strong>Link enviado!</strong> Abra o e-mail enviado para <strong>{state.email}</strong> e
          clique no link para continuar. Pode levar alguns minutos; olhe também o spam.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className={styles.form} noValidate>
      <input type="hidden" name="next" value={next} />
      <div className={styles.field}>
        <label htmlFor="email" className={styles.label}>
          Seu e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.email}
          aria-invalid={state.status === "error"}
          aria-describedby={state.status === "error" ? "email-erro" : "email-dica"}
          className={styles.input}
        />
        <span id="email-dica" className={styles.hint}>
          Sem senha: enviamos um link de acesso para este e-mail.
        </span>
        {state.status === "error" ? (
          <p id="email-erro" role="alert" className={styles.error}>
            {state.message}
          </p>
        ) : null}
      </div>
      <div>
        <button type="submit" className={styles.button} disabled={pending}>
          {pending ? "Enviando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
