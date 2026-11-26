import { formatDateOnly, formatBRL } from "@/lib/auth/format";
import { painelClient } from "@/lib/painel/db";
import { formatPhoneBR } from "@/lib/catalog/text";
import { requireManager } from "@/lib/painel/guard";
import { whatsappLink } from "@/lib/painel/route";
import styles from "../painel.module.css";
import { LinkMpForm } from "./link-form";

export const metadata = { title: "Assinaturas — Painel" };

type SubRow = {
  customer_id: string; full_name: string; email: string; whatsapp: string | null; status: string;
  current_period_end: string | null; days_left: number | null; mp_preapproval_id: string | null;
  mp_status: string | null; last_paid_at: string | null; last_amount_cents: number | null; paid_count: number;
};
type Unlinked = { id: string; status: string | null; payer_email: string | null; updated_at: string };

const STATUS: Record<string, string> = {
  active: "Ativa", pending: "Aguardando pagamento", past_due: "Em atraso", paused: "Pausada", canceled: "Cancelada",
};
const ORDER = ["active", "pending", "past_due", "paused", "canceled"];

export default async function AssinaturasPage() {
  await requireManager();
  const supabase = await painelClient();
  const [subsRes, unlinkedRes] = await Promise.all([
    supabase.from("painel_subscriptions").select("*").order("created_at", { ascending: false }),
    supabase.from("painel_mp_unlinked").select("*").order("updated_at", { ascending: false }),
  ]);
  if (subsRes.error) {
    return <p role="alert" className={styles.errorBox}>Não foi possível carregar as assinaturas agora. Atualize a página.</p>;
  }
  const rows = ((subsRes.data ?? []) as SubRow[]).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const unlinked = (unlinkedRes.data ?? []) as Unlinked[];
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const emAnalise = rows.filter((r) => r.status === "pending" && r.mp_preapproval_id);
  const openCustomers = rows
    .filter((r) => r.status !== "canceled" && !r.mp_preapproval_id)
    .map((r) => ({ id: r.customer_id, label: `${r.full_name} (${r.email})` }));

  return (
    <>
      <h1 className={styles.h1}>Assinaturas</h1>
      <p className={styles.lead}>
        {count("active")} ativas · {count("pending")} aguardando pagamento ({emAnalise.length} em análise) · {count("past_due")} em atraso ·{" "}
        {count("canceled")} canceladas. O acesso para reservar vale só para assinaturas ativas dentro do período pago.
      </p>

      {unlinked.length > 0 || emAnalise.length > 0 ? (
        <p role="alert" className={styles.errorBox} style={{ marginBottom: "1rem" }}>
          Atenção:{" "}
          {unlinked.length > 0
            ? `${unlinked.length} ${unlinked.length === 1 ? "pagamento sem cliente" : "pagamentos sem cliente"} (vincule abaixo)`
            : ""}
          {unlinked.length > 0 && emAnalise.length > 0 ? " · " : ""}
          {emAnalise.length > 0
            ? `${emAnalise.length} ${emAnalise.length === 1 ? "assinatura em análise" : "assinaturas em análise"} (paga no Mercado Pago, aguardando confirmação)`
            : ""}
          .
        </p>
      ) : null}

      {unlinked.length > 0 ? (
        <section aria-labelledby="sem-vinculo" style={{ borderLeft: "4px solid #b45309", paddingLeft: "1rem", marginBottom: "1.5rem" }}>
          <h2 id="sem-vinculo" className={styles.h1}>Pagamentos sem cliente</h2>
          <p className={styles.lead}>
            O Mercado Pago confirmou estas assinaturas, mas o e-mail usado no pagamento não bate com nenhum cadastro. Vincule ao cliente certo.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th scope="col">E-mail no Mercado Pago</th><th scope="col">Situação</th><th scope="col">Atualizada</th><th scope="col">Vincular</th></tr>
              </thead>
              <tbody>
                {unlinked.map((u) => (
                  <tr key={u.id}>
                    <td>{u.payer_email ?? "—"}</td>
                    <td>{u.status ?? "—"}</td>
                    <td>{formatDateOnly(u.updated_at.slice(0, 10))}</td>
                    <td><LinkMpForm preapprovalId={u.id} customers={openCustomers} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <p>Nenhuma assinatura ainda.</p>
      ) : (
        <div className={styles.tableWrap} role="region" aria-label="Assinaturas (role para o lado se precisar)" tabIndex={0}>
          <table className={`${styles.table} ${styles.tableWide}`}>
            <thead>
              <tr>
                <th scope="col">Assinante</th><th scope="col">Contato</th><th scope="col">Situação</th>
                <th scope="col">Pago até</th><th scope="col">Último pagamento</th><th scope="col">Cobranças</th><th scope="col">Mercado Pago</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const wa = r.whatsapp ? whatsappLink(r.whatsapp) : null;
                return (
                  <tr key={r.customer_id}>
                    <td>{r.full_name}</td>
                    <td>
                      {r.email}
                      {wa ? <><br /><a href={wa} className={styles.touch}>WhatsApp {formatPhoneBR(r.whatsapp)}</a></> : null}
                    </td>
                    <td>
                      {r.status === "pending" && r.mp_preapproval_id
                        ? <strong>Em análise</strong>
                        : STATUS[r.status] ?? r.status}
                    </td>
                    <td>
                      {r.current_period_end ? formatDateOnly(r.current_period_end) : "—"}
                      {r.status === "active" && r.days_left != null ? ` (${r.days_left} d)` : ""}
                    </td>
                    <td>
                      {r.last_paid_at ? `${formatDateOnly(r.last_paid_at.slice(0, 10))} · ${formatBRL(r.last_amount_cents ?? 0)}` : "—"}
                    </td>
                    <td>{r.paid_count}</td>
                    <td>{r.mp_preapproval_id ? `${r.mp_status ?? "?"}` : "não vinculada"}</td>
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
