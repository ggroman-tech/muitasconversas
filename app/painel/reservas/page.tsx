import { formatDateTime } from "@/lib/auth/format";
import { painelClient } from "@/lib/painel/db";
import { requireManager } from "@/lib/painel/guard";
import type { WaitingRow } from "@/lib/painel/types";
import styles from "../painel.module.css";

export const metadata = { title: "Reservas — Painel" };

export default async function ReservasPage() {
  await requireManager();
  const supabase = await painelClient();
  const { data, error } = await supabase
    .from("painel_reservations_waiting")
    .select("*");
  if (error) {
    return (
      <p role="alert" className={styles.errorBox}>
        Não foi possível carregar as reservas agora. Atualize a página.
      </p>
    );
  }
  const rows = (data ?? []) as WaitingRow[];
  return (
    <>
      <h1 className={styles.h1}>Reservas aguardando</h1>
      <p className={styles.lead}>
        Livros reservados e ainda não agendados para entrega, e a fila de
        espera.
      </p>
      {rows.length === 0 ? (
        <p>Nenhuma reserva aguardando.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Livro</th>
                <th scope="col">Assinante</th>
                <th scope="col">Situação</th>
                <th scope="col">Contato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.reservation_id}>
                  <td>{r.book_title}</td>
                  <td>{r.customer_name}</td>
                  <td>
                    {r.reservation_status === "offered"
                      ? `Livro separado; guarda até ${formatDateTime(r.hold_expires_at)}`
                      : `Na fila (${r.queue_position}º)`}
                  </td>
                  <td>
                    {r.customer_email}
                    {r.customer_whatsapp ? (
                      <>
                        <br />
                        {r.customer_whatsapp}
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
