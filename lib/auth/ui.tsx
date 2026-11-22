import type { ReactNode } from "react";
import { signOut } from "./actions";
import styles from "./ui.module.css";

/** Contêiner das telas de conta/autenticação. O cabeçalho e o rodapé vêm do layout global. */
export function Shell({
  children,
  account = false,
  wide = false,
}: {
  children: ReactNode;
  account?: boolean;
  wide?: boolean;
}) {
  return (
    <main id="conteudo" className={`${styles.page} ${wide ? styles.pageWide : ""}`}>
      {account ? (
        <div className={styles.accountBar}>
          <form action={signOut}>
            <button type="submit" className={styles.buttonGhost}>
              Sair
            </button>
          </form>
        </div>
      ) : null}
      {children}
    </main>
  );
}
