"use client";

import { useActionState } from "react";
import styles from "@/lib/auth/ui.module.css";
import { confirmEnroll, startEnroll, verifyCode, type EnrollState, type VerifyState } from "./actions";

const enrollInitial: EnrollState = { status: "idle" };
const verifyInitial: VerifyState = { status: "idle" };

function CodeField({ error }: { error?: string }) {
  return (
    <div className={styles.field}>
      <label htmlFor="code" className={styles.label}>
        Código de 6 números
      </label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        required
        className={styles.input}
      />
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function MfaForm({ mode, next }: { mode: "enroll" | "verify"; next: string }) {
  const [enroll, enrollAction, enrolling] = useActionState(startEnroll, enrollInitial);
  const [confirm, confirmAction, confirming] = useActionState(confirmEnroll, verifyInitial);
  const [verify, verifyAction, verifying] = useActionState(verifyCode, verifyInitial);

  if (mode === "verify") {
    return (
      <form action={verifyAction} className={styles.form} noValidate>
        <p className={styles.lead}>Abra o aplicativo autenticador no celular e digite o código atual.</p>
        <input type="hidden" name="next" value={next} />
        <CodeField error={verify.status === "error" ? verify.message : undefined} />
        <div>
          <button type="submit" className={styles.button} disabled={verifying}>
            {verifying ? "Verificando…" : "Entrar no painel"}
          </button>
        </div>
      </form>
    );
  }

  if (enroll.status !== "ready") {
    return (
      <form action={enrollAction} className={styles.form}>
        <p className={styles.lead}>
          Primeira vez aqui: vamos ligar a verificação em duas etapas. Tenha no celular o Google Authenticator,
          Microsoft Authenticator ou similar.
        </p>
        {enroll.status === "error" ? (
          <p role="alert" className={styles.error}>
            {enroll.message}
          </p>
        ) : null}
        <div>
          <button type="submit" className={styles.button} disabled={enrolling}>
            {enrolling ? "Gerando…" : "Gerar QR Code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={confirmAction} className={styles.form} noValidate>
      <p className={styles.lead}>1) No aplicativo, escolha &quot;adicionar conta&quot; e leia este QR Code.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enroll.qr} alt="QR Code para o aplicativo autenticador" width={200} height={200} />
      <p className={styles.hint}>
        Se não conseguir ler, digite esta chave no aplicativo: <code>{enroll.secret}</code>
      </p>
      <p className={styles.lead}>2) Digite o código de 6 números que o aplicativo mostrar.</p>
      <input type="hidden" name="factorId" value={enroll.factorId} />
      <input type="hidden" name="next" value={next} />
      <CodeField error={confirm.status === "error" ? confirm.message : undefined} />
      <div>
        <button type="submit" className={styles.button} disabled={confirming}>
          {confirming ? "Confirmando…" : "Ativar e entrar"}
        </button>
      </div>
    </form>
  );
}
