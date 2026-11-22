import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import styles from "./account-shell.module.css";

/** Moldura das telas logadas (Minha conta, Agendar): conteúdo no container do site + botão Sair. */
export function AccountShell({
  children,
  width = "wide",
}: {
  children: ReactNode;
  width?: "wide" | "medium";
}) {
  return (
    <main
      id="conteudo"
      className={`${styles.shell} ${width === "medium" ? styles.medium : styles.wide}`}
    >
      <div className={styles.topbar}>
        <form action={signOut}>
          <button type="submit" className={styles.signOut}>
            Sair
          </button>
        </form>
      </div>
      {children}
    </main>
  );
}
