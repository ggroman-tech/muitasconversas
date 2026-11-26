import Link from "next/link";
import { VerifyPayment } from "@/app/assinar/verify-payment";
import { deriveSubscriptionState, type PaymentInfo } from "@/lib/assinatura/state";
import type { MyAccountRow } from "@/lib/auth/database.types";
import {
  formatBRL,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatTime,
  formatWeekday,
} from "@/lib/auth/format";
import { formatPhoneDisplay } from "@/lib/auth/masks";
import { CancelVisitForm } from "./cancel-visit-form";
import { CancelSubscriptionForm } from "./cancel-subscription-form";
import styles from "./conta.module.css";

const LOAN_STATUS: Record<string, string> = {
  scheduled: "Entrega agendada",
  active: "Com você",
  return_requested: "Devolução solicitada",
  overdue: "Prazo vencido",
};

const VISIT_STATUS: Record<string, string> = {
  requested: "Solicitada",
  confirmed: "Confirmada",
  out_for_delivery: "A caminho",
};

const DIRECTION = { deliver: "Entrega", collect: "Coleta" } as const;
const HISTORY_STATUS: Record<string, string> = {
  returned: "Devolvido",
  lost: "Extraviado",
};
const LOAN_DAYS = 28;

function daysLeftText(n: number): string {
  if (n > 1) return `faltam ${n} dias`;
  if (n === 1) return "falta 1 dia";
  if (n === 0) return "vence hoje";
  return `vencido há ${-n} ${n === -1 ? "dia" : "dias"}`;
}

/** Tela "Minha conta" (apresentação pura, a partir da linha da view my_account). */
export function ContaView({
  a,
  pay = null,
  justActivated = false,
}: {
  a: MyAccountRow;
  pay?: PaymentInfo;
  justActivated?: boolean;
}) {
  return (
    <div className={styles.page}>
      <h1 className="h page-title">Olá, {a.full_name.split(" ")[0]}</h1>
      {justActivated ? (
        <div role="status" className="alert alert-ok">
          <p>
            <strong>Pagamento confirmado!</strong> Sua assinatura está ativa
            {a.current_period_end ? ` até ${formatDateOnly(a.current_period_end)}` : ""}. Já dá para escolher seu
            primeiro livro.
          </p>
          <Link href="/catalogo" className="btn">
            Ver o catálogo
          </Link>
        </div>
      ) : null}
      {(() => {
        const st = deriveSubscriptionState({
          status: a.subscription_status,
          currentPeriodEnd: a.current_period_end,
          payment: pay,
        });
        return st.hasAccess || st.key === "none" || st.key === "canceled" || st.key === "paused" ? null : (
          <div role="status" className={`alert ${styles.alertBox}`}>
            <p>
              <strong>{st.label}.</strong> Enquanto a assinatura não estiver ativa, não dá para reservar livros nem
              agendar entregas.
            </p>
          </div>
        );
      })()}
      {a.blocked_by_overdue ? (
        <div role="alert" className={`alert ${styles.alertBox}`}>
          <p>
            Seu livro está atrasado desde {formatDateOnly(a.overdue_since)}.
            Enquanto não devolver, não dá para reservar nem receber outro livro;
            agende a devolução.
          </p>
          <Link href="/agendar" className="btn">
            Agendar a devolução
          </Link>
        </div>
      ) : null}
      <div className={styles.cols}>
        <div className={styles.main}>
          <LoanSection a={a} />
          <QueuesSection a={a} />
          <HistorySection a={a} />
        </div>
        <aside className={styles.aside} aria-label="Resumo da conta">
          <VisitSection a={a} />
          <PlanSection a={a} pay={pay} />
          <RemindersSection a={a} />
          <AddressSection a={a} />
          <DataSection a={a} />
        </aside>
      </div>
    </div>
  );
}

function LoanSection({ a }: { a: MyAccountRow }) {
  const left = a.loan_days_left;
  const showProgress = a.loan_id && a.loan_due_date && left != null;
  const elapsed =
    left != null ? Math.min(LOAN_DAYS, Math.max(0, LOAN_DAYS - left)) : 0;
  const week = Math.min(4, Math.floor(elapsed / 7) + 1);
  const late = left != null && left < 0;
  return (
    <section className={`card ${styles.panel}`} aria-labelledby="livro">
      <h2 id="livro" className={`h ${styles.h2}`}>
        Livro atual
      </h2>
      {a.loan_id ? (
        <div className={styles.loan}>
          <div className={`cover ${styles.cover}`} aria-hidden="true">
            <span className="t">{a.loan_title}</span>
            <span className="a">{a.loan_authors?.join(", ")}</span>
          </div>
          <div className={styles.loanInfo}>
            <div>
              <p className={styles.loanTitle}>{a.loan_title}</p>
              {a.loan_authors?.length ? (
                <p className={styles.meta}>{a.loan_authors.join(", ")}</p>
              ) : null}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className={`badge ${late ? "badge-warn" : ""}`}>
                {a.loan_status ? LOAN_STATUS[a.loan_status] : ""}
              </span>
              {a.loan_delivered_at ? (
                <span className={styles.small}>
                  Entregue em {formatDate(a.loan_delivered_at)}
                </span>
              ) : null}
            </div>
            {a.loan_due_date ? (
              <p>
                Devolver até <strong>{formatDateOnly(a.loan_due_date)}</strong>
                {left != null ? ` (${daysLeftText(left)})` : ""}
              </p>
            ) : null}
            {showProgress ? (
              <div className={styles.progressWrap}>
                <div
                  className={styles.bar}
                  role="progressbar"
                  aria-label="Prazo de leitura"
                  aria-valuemin={0}
                  aria-valuemax={LOAN_DAYS}
                  aria-valuenow={elapsed}
                >
                  <div
                    className={`${styles.barFill} ${late ? styles.barLate : ""}`}
                    style={{
                      width: `${Math.round((elapsed / LOAN_DAYS) * 100)}%`,
                    }}
                  />
                </div>
                <span className={styles.progressText}>
                  Semana {week} de 4 · {daysLeftText(left)}
                </span>
              </div>
            ) : null}
            <div className={styles.actions}>
              <Link href="/agendar" className="btn">
                Agendar devolução
              </Link>
              {a.blocked_by_overdue ? null : (
                <Link href="/catalogo" className="btn2">
                  Escolher o próximo livro
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.empty}>
          <p>Você não está com nenhum livro agora.</p>
          <Link href="/catalogo" className="btn2">
            Ver o catálogo
          </Link>
        </div>
      )}
    </section>
  );
}

function QueuesSection({ a }: { a: MyAccountRow }) {
  return (
    <section className={`card ${styles.panel}`} aria-labelledby="filas">
      <h2 id="filas" className={`h ${styles.h2}`}>
        Reservas e fila
      </h2>
      {a.reservations.length === 0 ? (
        <p>Você não está em nenhuma fila.</p>
      ) : (
        <ul className={styles.plain}>
          {a.reservations.map((r) => (
            <li key={r.reservation_id} className={styles.line}>
              <div className={styles.lineMain}>
                <strong className={styles.lineTitle}>{r.title}</strong>
                {r.authors?.length ? (
                  <span className={styles.lineSub}>{r.authors.join(", ")}</span>
                ) : null}
              </div>
              {r.status === "offered" ? (
                <span className="badge" style={{ background: "var(--tint-2)" }}>
                  reservado para você
                  {r.hold_expires_at
                    ? ` até ${formatDateTime(r.hold_expires_at)}`
                    : ""}
                </span>
              ) : (
                <span className="badge badge-warn">
                  posição {r.position} na fila
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HistorySection({ a }: { a: MyAccountRow }) {
  return (
    <section className={`card ${styles.panel}`} aria-labelledby="historico">
      <h2 id="historico" className={`h ${styles.h2}`}>
        Histórico
      </h2>
      {a.history.length === 0 ? (
        <p>Você ainda não devolveu nenhum livro.</p>
      ) : (
        <ul className={styles.plain}>
          {a.history.map((h) => (
            <li key={h.loan_id} className={styles.histLine}>
              <span>
                <strong>{h.title}</strong>
                {h.authors?.length ? ` · ${h.authors.join(", ")}` : ""}
              </span>
              <span className={styles.meta}>
                {HISTORY_STATUS[h.status]}
                {h.delivered_at
                  ? ` · entregue em ${formatDate(h.delivered_at)}`
                  : ""}
                {h.returned_at
                  ? ` · devolvido em ${formatDate(h.returned_at)}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function VisitSection({ a }: { a: MyAccountRow }) {
  const has = a.next_visit_id && a.next_visit_day;
  return (
    <section
      className={has ? styles.next : `card ${styles.panelSm}`}
      aria-labelledby="visita"
    >
      <h2
        id="visita"
        className={has ? styles.nextLabel : `h ${styles.h2sm}`}
        style={has ? { fontFamily: "var(--font-body)" } : undefined}
      >
        Próxima visita
      </h2>
      {has ? (
        <>
          <p className={styles.nextDay}>
            {formatWeekday(a.next_visit_day!)},{" "}
            {formatDateOnly(a.next_visit_day)}
          </p>
          <p>
            Entre {formatTime(a.next_visit_starts_at)} e{" "}
            {formatTime(a.next_visit_ends_at)}
            {a.next_visit_status
              ? ` (${VISIT_STATUS[a.next_visit_status]})`
              : ""}
            .
          </p>
          {a.next_visit_items.length > 0 ? (
            <ul className={styles.nextItems}>
              {a.next_visit_items.map((i) => (
                <li key={`${i.loan_id}-${i.direction}`}>
                  {DIRECTION[i.direction]}: {i.title}
                </li>
              ))}
            </ul>
          ) : null}
          {a.next_visit_status === "requested" ||
          a.next_visit_status === "confirmed" ? (
            <CancelVisitForm visitId={a.next_visit_id!} />
          ) : null}
        </>
      ) : (
        <p>Nenhuma visita agendada.</p>
      )}
      <Link href="/agendar" className={styles.link}>
        Agendar troca ou devolução
      </Link>
    </section>
  );
}

function PlanSection({ a, pay }: { a: MyAccountRow; pay: PaymentInfo }) {
  const status = a.subscription_status;
  const st = deriveSubscriptionState({
    status,
    currentPeriodEnd: a.current_period_end,
    payment: pay,
  });
  return (
    <section className={`card ${styles.panelSm}`} aria-labelledby="plano">
      <h2 id="plano" className={`h ${styles.h2sm}`}>
        Plano
      </h2>
      <dl className={styles.dl}>
        <dt>Situação</dt>
        <dd>
          <span className={`badge ${st.hasAccess ? "" : "badge-warn"}`}>{st.label}</span>
        </dd>
        <dt>Valor</dt>
        <dd>{formatBRL(a.plan_price_cents)} a cada 30 dias</dd>
        {a.current_period_end && st.key !== "awaiting_payment" && st.key !== "verifying" ? (
          <>
            <dt>{st.key === "active" ? "Válida até" : "Pago até"}</dt>
            <dd>{formatDateOnly(a.current_period_end)}</dd>
          </>
        ) : null}
        {status === "paused" && a.paused_until ? (
          <>
            <dt>Pausada até</dt>
            <dd>{formatDateOnly(a.paused_until)}</dd>
          </>
        ) : null}
      </dl>
      {st.key !== "active" ? <p className="muted">{st.description}</p> : null}
      {st.canPay ? (
        <p>
          <Link href="/assinar/concluir" className="btn">
            {st.key === "canceled" ? "Assinar de novo" : "Pagar a assinatura"}
          </Link>
        </p>
      ) : null}
      {st.canVerify ? (
        <VerifyPayment auto buttonClass="btn2" textClass="muted" />
      ) : null}
      {st.cancelRequested && status !== "canceled" ? (
        <p className="muted" role="status">
          Cancelamento solicitado: não haverá novas cobranças
          {a.current_period_end ? ` e seu acesso vai até ${formatDateOnly(a.current_period_end)}` : ""}.
          {a.current_period_end ? ` Depois dessa data, você poderá assinar de novo.` : ""}
          {/* POLÍTICA DE REEMBOLSO: A DEFINIR PELO GABRIEL (hoje: sem reembolso do período já pago). */}
        </p>
      ) : status === "active" || status === "past_due" || status === "pending" ? (
        <CancelSubscriptionForm
          accessUntil={status === "active" && a.current_period_end ? formatDateOnly(a.current_period_end) : null}
        />
      ) : null}
    </section>
  );
}

function RemindersSection({ a }: { a: MyAccountRow }) {
  const days = a.reminder_days_before ?? [];
  return (
    <section className={`card ${styles.panelSm}`} aria-labelledby="lembretes">
      <h2 id="lembretes" className={`h ${styles.h2sm}`}>
        Lembretes
      </h2>
      {days.length > 0 ? (
        <>
          <p style={{ fontSize: 15 }}>
            Enviamos lembretes por e-mail {days.join(", ")}{" "}
            {days.length > 1 || days[0] !== 1 ? "dias" : "dia"} antes do prazo
            de devolução.
          </p>
          <div className={styles.chips} aria-hidden="true">
            {days.map((d) => (
              <span key={d} className="badge">
                {d} {d === 1 ? "dia" : "dias"} antes
              </span>
            ))}
          </div>
        </>
      ) : (
        <p>Nenhum lembrete configurado.</p>
      )}
      {a.recent_reminders.length > 0 ? (
        <>
          <p className="muted" style={{ fontSize: 14 }}>
            Últimos e-mails enviados:
          </p>
          <ul className={styles.list}>
            {a.recent_reminders.map((r, i) => (
              <li key={`${r.sent_at}-${i}`}>
                {formatDateTime(r.sent_at)} — {r.subject ?? r.kind}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function AddressSection({ a }: { a: MyAccountRow }) {
  return (
    <section className={`card ${styles.panelSm}`} aria-labelledby="endereco">
      <h2 id="endereco" className={`h ${styles.h2sm}`}>
        Endereço de entrega
      </h2>
      {a.street ? (
        <address className={styles.addr}>
          {a.street}, {a.number}
          {a.complement ? ` — ${a.complement}` : ""}
          <br />
          {a.area_name} — CEP {a.cep?.replace(/^(\d{5})(\d{3})$/, "$1-$2")}
          {a.reference ? (
            <>
              <br />
              <span className="muted">Referência: {a.reference}</span>
            </>
          ) : null}
        </address>
      ) : (
        <p>Nenhum endereço cadastrado.</p>
      )}
    </section>
  );
}

function DataSection({ a }: { a: MyAccountRow }) {
  return (
    <section className={`card ${styles.panelSm}`} aria-labelledby="dados">
      <h2 id="dados" className={`h ${styles.h2sm}`}>
        Seus dados
      </h2>
      <dl className={styles.dl}>
        <dt>Nome</dt>
        <dd>{a.full_name}</dd>
        <dt>E-mail</dt>
        <dd style={{ overflowWrap: "anywhere" }}>{a.email}</dd>
        <dt>WhatsApp</dt>
        <dd>{a.whatsapp ? formatPhoneDisplay(a.whatsapp) : "não informado"}</dd>
      </dl>
    </section>
  );
}
