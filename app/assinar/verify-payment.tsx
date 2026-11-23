"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import styles from "@/lib/auth/ui.module.css";
import { verifyPayment, type VerifyState } from "./verificar-actions";

const initial: VerifyState = { status: "idle", nonce: 0 };

/**
 * Botão "Já paguei, verificar agora". Com `auto`, também confere sozinho
 * (ao abrir e a cada 20 s, no máximo 6 vezes) e atualiza a página quando ativar.
 */
export function VerifyPayment({
  preapprovalId,
  auto = false,
  buttonClass,
  textClass,
}: {
  preapprovalId?: string;
  auto?: boolean;
  buttonClass?: string;
  textClass?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(verifyPayment, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const tries = useRef(0);

  useEffect(() => {
    if (!auto) return;
    const run = () => {
      if (tries.current >= 6) return;
      tries.current += 1;
      formRef.current?.requestSubmit();
    };
    const first = setTimeout(run, 1500);
    const timer = setInterval(run, 20000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [auto]);

  useEffect(() => {
    if (state.status === "active") router.replace("/conta");
  }, [state.status, router]);

  return (
    <form ref={formRef} action={action} style={{ marginTop: "0.75rem" }}>
      {preapprovalId ? <input type="hidden" name="preapproval_id" value={preapprovalId} /> : null}
      <button type="submit" className={buttonClass ?? styles.button} disabled={pending}>
        {pending ? "Verificando…" : "Já paguei, verificar agora"}
      </button>
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"} className={textClass ?? styles.muted} style={{ marginTop: "0.5rem" }}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
