import { formatDateOnly } from "@/lib/auth/format";
import { painelClient } from "@/lib/painel/db";
import { requireManager } from "@/lib/painel/guard";
import { whatsappLink } from "@/lib/painel/route";
import type { OverdueRow } from "@/lib/painel/types";
import styles from "../painel.module.css";

export const metadata = { title: "Atrasos — Painel" };

export default async function AtrasosPage() {
  await requireManager();
  const supabase = await painelClient();
  const { data, error } = await supabase.from("overdue_loans").select("*");
  if (error) {
    return (
      <p role="alert" className={styles.errorBox}>
        Não foi possível carregar os atrasos agora. Atualize a página.
      </p>
    );
  }
  const rows = (data ?? []) as OverdueRow[];
  return (
    <>
      <h1 className={styles.h1}>Atrasos</h1>
      <p className={styles.lead}>
        Livros com prazo vencido. Não há multa; o assinante fica sem novas
        entregas até devolver.
      </p>
      {rows.length === 0 ? (
        <p>Nenhum livro em atraso.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.muted}>
              {rows.length}{" "}
              {rows.length === 1
                ? "empréstimo em atraso"
                : "empréstimos em atraso"}
            </caption>
            <thead>
              <tr>
                <th scope="col">Assinante</th>
                <th scope="col">Contato</th>
                <th scope="col">Livro</th>
                <th scope="col">Venceu em</th>
                <th scope="col">Dias</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const wa = whatsappLink(r.customer_whatsapp);
                return (
                  <tr key={r.loan_id}>
                    <td>{r.customer_name}</td>
                    <td>
                      <a
                        href={`mailto:${r.customer_email}`}
                        className={styles.link}
                      >
                        {r.customer_email}
                      </a>
                      {r.customer_whatsapp ? (
                        <>
                          <br />
                          {wa ? (
                            <a href={wa} className={styles.link}>
                              {r.customer_whatsapp}
                            </a>
                          ) : (
                            r.customer_whatsapp
                          )}
                        </>
                      ) : null}
                    </td>
                    <td>
                      {r.book_title}{" "}
                      <span className={styles.muted}>({r.label_code})</span>
                    </td>
                    <td>{formatDateOnly(r.due_date)}</td>
                    <td>{r.days_overdue}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
