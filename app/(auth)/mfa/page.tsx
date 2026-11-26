import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { safeNext } from "@/lib/auth/safe-next";
import { getAuthUser } from "@/lib/auth/supabase-server";
import styles from "@/lib/auth/ui.module.css";
import { getMfaState, getStaffRole, painelLocalEnabled } from "@/lib/painel/db";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Verificação em duas etapas", robots: { index: false, follow: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function MfaPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <h1 className={styles.h1}>Verificação em duas etapas</h1>
      <Suspense fallback={<p role="status">Carregando…</p>}>
        <Mfa searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Mfa({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  if (!painelLocalEnabled()) notFound();
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, "/painel");
  if (!(await getAuthUser())) redirect(`/entrar?next=${encodeURIComponent(`/mfa?next=${next}`)}`);
  if (!(await getStaffRole())) redirect("/conta");
  const state = await getMfaState();
  if (state === "aal2") redirect(next);
  return (
    <div className={`${styles.card} ${styles.authCard}`}>
      <MfaForm mode={state === "needs_verify" ? "verify" : "enroll"} next={next} />
    </div>
  );
}
