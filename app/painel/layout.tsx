import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import { getAuthUser } from "@/lib/auth/supabase-server";
import { canManage, getMfaState, getStaffRole, painelLocalEnabled } from "@/lib/painel/db";
import { PainelNav } from "./nav";
import styles from "./painel.module.css";

export const metadata: Metadata = {
  title: "Painel",
  robots: { index: false, follow: false },
};

/** Guarda do painel: sem login -> /entrar; logado mas fora de staff_members -> /conta. */
export default function PainelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p role="status">Carregando painel…</p>}>
      <Guarded>{children}</Guarded>
    </Suspense>
  );
}

async function Guarded({ children }: { children: ReactNode }) {
  const user = await getAuthUser();
  if (!painelLocalEnabled()) notFound();
  if (!user) redirect("/entrar?next=/painel");
  const staff = await getStaffRole();
  if (!staff) redirect("/conta");
  if ((await getMfaState()) !== "aal2") redirect("/mfa?next=/painel");

  return (
    <div className={styles.wrap}>
      <header className={`${styles.header} ${styles.noPrint}`}>
        <span className={styles.title}>
          Muitas Conversas<small>Painel da equipe</small>
        </span>
        <div className={styles.nav}>
          <PainelNav manage={canManage(staff.role)} />
          <form action={signOut}>
            <button type="submit" className={styles.btnGhost}>
              Sair
            </button>
          </form>
        </div>
      </header>
      <main id="conteudo">{children}</main>
      <p
        className={`${styles.muted} ${styles.noPrint}`}
        style={{ marginTop: 32 }}
      >
        <Link href="/" className={styles.link}>
          Ir para o site
        </Link>
      </p>
    </div>
  );
}
