import {
  formatDateOnly,
  formatDateTime,
  formatWeekday,
} from "@/lib/auth/format";
import { painelClient } from "@/lib/painel/db";
import { requireManager } from "@/lib/painel/guard";
import type { SaturdayRow } from "@/lib/painel/types";
import { GenerateSaturdaysForm } from "../action-forms";
import styles from "../painel.module.css";

export const metadata = { title: "Sábados — Painel" };

export default async function SabadosPage() {
  await requireManager();
  const supabase = await painelClient();
  const { data, error } = await supabase.from("painel_saturdays").select("*");
  const rows = (data ?? []) as SaturdayRow[];
  return (
    <>
      <h1 className={styles.h1}>Sábados</h1>
      <p className={styles.lead}>
        Entregas e coletas aos sábados, das 09h às 14h. Os pedidos fecham na sexta-feira, às 08h
        (horário de Brasília).
      </p>
      <h2 className={styles.h2}>Gerar próximos sábados</h2>
      <p className={styles.muted}>
        Só cria o que ainda não existe; pode repetir sem problema.
      </p>
      <GenerateSaturdaysForm />

      <h2 className={styles.h2}>Próximos sábados abertos</h2>
      {error ? (
        <p role="alert" className={styles.errorBox}>
          Não foi possível carregar os sábados agora. Atualize a página.
        </p>
      ) : rows.length === 0 ? (
        <p>Nenhum sábado aberto. Gere os próximos sábados acima.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Sábado</th>
                <th scope="col">Pedidos fecham em</th>
                <th scope="col">Visitas</th>
                <th scope="col">Janelas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.delivery_day_id}>
                  <td>
                    {formatDateOnly(r.day)}{" "}
                    <span className={styles.muted}>
                      ({formatWeekday(r.day)})
                    </span>
                  </td>
                  <td>
                    {formatDateTime(r.cutoff_at)}
                    {r.cutoff_passed ? (
                      <span className={styles.badge}> fechado</span>
                    ) : null}
                  </td>
                  <td>{r.visits_count}</td>
                  <td>{r.windows_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
