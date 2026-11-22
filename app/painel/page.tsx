import Link from "next/link";
import { formatDateOnly, formatTime, formatWeekday } from "@/lib/auth/format";
import { canManage, getStaff, painelClient } from "@/lib/painel/db";
import {
  addressLine,
  groupRoute,
  prepLists,
  whatsappLink,
} from "@/lib/painel/route";
import type { RouteLoan, RouteRow } from "@/lib/painel/types";
import {
  CancelVisitStaffForm,
  ConfirmDeliveryForm,
  MarkFailedForm,
  PrintButton,
  RegisterReturnForm,
} from "./action-forms";
import styles from "./painel.module.css";

const VISIT_STATUS: Record<string, string> = {
  requested: "Solicitada",
  confirmed: "Confirmada",
  out_for_delivery: "A caminho",
  done: "Concluída",
};

export default async function RotaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const sp = await searchParams;
  const staff = await getStaff();
  const manage = staff ? canManage(staff.role) : false;
  const supabase = await painelClient();

  const [routeRes, loansRes] = await Promise.all([
    supabase.from("saturday_route").select("*"),
    supabase
      .from("painel_route_loans")
      .select("visit_id, loan_id, direction, loan_status"),
  ]);
  if (routeRes.error) {
    return (
      <p role="alert" className={styles.errorBox}>
        Não foi possível carregar a rota agora. Atualize a página.
      </p>
    );
  }
  const all = (routeRes.data ?? []) as RouteRow[];
  const loanStatus = new Map<string, string>();
  for (const l of (loansRes.data ?? []) as RouteLoan[])
    loanStatus.set(`${l.visit_id}|${l.loan_id}|${l.direction}`, l.loan_status);

  const days = [...new Set(all.map((r) => r.delivery_day))].sort();
  const day = sp.dia && days.includes(sp.dia) ? sp.dia : days[0];
  const rows = all.filter((r) => r.delivery_day === day);
  const groups = groupRoute(rows);
  const prep = prepLists(rows);

  return (
    <>
      <div className={styles.noPrint}>
        <h1 className={styles.h1}>Rota de sábado</h1>
        {days.length > 1 ? (
          <nav aria-label="Sábados com visitas" className={styles.dayTabs}>
            {days.map((d) => (
              <Link
                key={d}
                href={`/painel?dia=${d}`}
                className={styles.navLink}
                aria-current={d === day ? "page" : undefined}
              >
                {formatDateOnly(d)}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {!day ? (
        <p>Nenhuma visita agendada para os próximos sábados.</p>
      ) : (
        <>
          <h1 className={styles.printOnly}>
            Muitas Conversas — rota de {formatDateOnly(day)}
          </h1>
          <p className={styles.summaryLine}>
            <strong>
              {formatWeekday(day)}, {formatDateOnly(day)}
            </strong>{" "}
            · {rows.length} {rows.length === 1 ? "visita" : "visitas"}
          </p>
          <div className={styles.noPrint} style={{ marginBottom: 16 }}>
            <PrintButton />
          </div>

          <section aria-labelledby="preparo">
            <h2 id="preparo" className={styles.h2}>
              Para preparar
            </h2>
            <div className={styles.prepGrid}>
              <div className={styles.prepBox}>
                <h3>Livros a separar ({prep.deliver.length})</h3>
                {prep.deliver.length === 0 ? (
                  <p className={styles.muted}>Nenhuma entrega pendente.</p>
                ) : (
                  <ul>
                    {prep.deliver.map((p, i) => (
                      <li key={i}>
                        ☐ {p.title}{" "}
                        <span className={styles.muted}>
                          ({p.copy_label}) → {p.customer_name}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={styles.prepBox}>
                <h3>Livros a recolher ({prep.collect.length})</h3>
                {prep.collect.length === 0 ? (
                  <p className={styles.muted}>Nenhuma coleta pendente.</p>
                ) : (
                  <ul>
                    {prep.collect.map((p, i) => (
                      <li key={i}>
                        ☐ {p.title}{" "}
                        <span className={styles.muted}>
                          ({p.copy_label}) ← {p.customer_name}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <div className={styles.pageBreak} />
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`g-${g.key}`}>
              <div className={styles.group}>
                <h2 id={`g-${g.key}`} className={styles.h2}>
                  {g.area_name} · {formatTime(g.starts_at)}–
                  {formatTime(g.ends_at)}
                </h2>
                <span className={styles.muted}>
                  {g.rows.length} {g.rows.length === 1 ? "visita" : "visitas"}
                </span>
              </div>
              {g.rows.map((r) => {
                const wa = whatsappLink(r.customer_whatsapp);
                const open = r.visit_status !== "done";
                const hasDeliver = r.items.some(
                  (i) => i.direction === "deliver",
                );
                return (
                  <article
                    key={r.visit_id}
                    className={`${styles.card} ${open ? "" : styles.cardDone}`}
                  >
                    <div className={styles.cardTop}>
                      <span className={styles.stop}>
                        {r.route_order != null ? `${r.route_order}. ` : ""}
                        {r.customer_name}
                      </span>
                      <span className={styles.badge}>
                        {VISIT_STATUS[r.visit_status] ?? r.visit_status}
                      </span>
                    </div>
                    <p style={{ margin: "8px 0 0" }}>
                      {addressLine(r)}
                      {r.reference ? (
                        <span className={styles.muted}>
                          {" "}
                          · ref.: {r.reference}
                        </span>
                      ) : null}
                    </p>
                    {r.customer_whatsapp ? (
                      <p className={styles.muted} style={{ margin: "4px 0 0" }}>
                        WhatsApp:{" "}
                        {wa ? (
                          <a href={wa} className={styles.link}>
                            {r.customer_whatsapp}
                          </a>
                        ) : (
                          r.customer_whatsapp
                        )}
                      </p>
                    ) : null}
                    {r.customer_note ? (
                      <p className={styles.note}>
                        <strong>Recado do cliente:</strong> {r.customer_note}
                      </p>
                    ) : null}
                    <ul className={styles.items}>
                      {r.items.map((it) => {
                        const st = loanStatus.get(
                          `${r.visit_id}|${it.loan_id}|${it.direction}`,
                        );
                        const returned =
                          it.direction === "collect" && st === "returned";
                        return (
                          <li key={`${it.loan_id}-${it.direction}`}>
                            <strong>
                              {it.direction === "deliver"
                                ? "ENTREGAR"
                                : "COLETAR"}
                              :
                            </strong>{" "}
                            {it.title}{" "}
                            <span className={styles.muted}>
                              ({it.copy_label})
                            </span>
                            {returned ? (
                              <span className={styles.badge}> devolvido</span>
                            ) : null}
                            {manage &&
                            it.direction === "collect" &&
                            !returned &&
                            st !== undefined &&
                            r.visit_status === "done" ? (
                              <div className={styles.noPrint}>
                                <RegisterReturnForm
                                  loanId={it.loan_id}
                                  title={it.title}
                                />
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    {open ? (
                      <div className={`${styles.actions} ${styles.noPrint}`}>
                        <ConfirmDeliveryForm
                          visitId={r.visit_id}
                          hasDeliver={hasDeliver}
                        />
                        {manage ? (
                          <MarkFailedForm visitId={r.visit_id} />
                        ) : null}
                        {manage ? (
                          <CancelVisitStaffForm visitId={r.visit_id} />
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ))}
        </>
      )}
    </>
  );
}
