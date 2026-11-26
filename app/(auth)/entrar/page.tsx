import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/lib/auth/login-form";
import { safeNext } from "@/lib/auth/safe-next";
import { getAuthUser } from "@/lib/auth/supabase-server";
import { isTestLoginEnabled, testLogin } from "@/lib/auth/test-login";
import styles from "@/lib/auth/ui.module.css";

export const metadata: Metadata = { title: "Entrar" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function EntrarPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <h1 className={styles.h1}>Entrar</h1>
      <p className={styles.lead}>Acesse sua conta de assinante com um link enviado por e-mail.</p>
      <Suspense fallback={<p role="status">Carregando…</p>}>
        <Entrar searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Entrar({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, "/conta");
  if (await getAuthUser()) redirect(next);
  const testMode = await isTestLoginEnabled();

  return (
    <>
      {sp.erro === "link" ? (
        <p role="alert" className={styles.errorBox} style={{ marginBottom: "1rem" }}>
          Esse link expirou ou já foi usado. Peça um novo abaixo.
        </p>
      ) : null}
      <div className={`${styles.card} ${styles.authCard}`}>
        <LoginForm next={next} />
      </div>
      {testMode ? (
        <form action={testLogin} className={styles.card} style={{ marginTop: "1rem" }}>
          <input type="hidden" name="next" value={next} />
          <p className={styles.muted}>Modo teste ligado (temporário): entra sem e-mail na conta de teste.</p>
          <button type="submit" className={styles.button}>
            Entrar como cliente de teste
          </button>
        </form>
      ) : null}
      <p className={styles.muted} style={{ marginTop: "1.5rem" }}>
        Ainda não é assinante?{" "}
        <Link href="/assinar" className={styles.link}>
          Assine
        </Link>
      </p>
    </>
  );
}
