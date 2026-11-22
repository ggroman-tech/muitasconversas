import Link from "next/link";
import type {
  MyAccountRow,
  SubscriptionStatus,
} from "@/lib/auth/database.types";
import {
  formatBRL,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatTime,
  formatWeekday,
} from "@/lib/auth/format";
import { CancelVisitForm } from "./cancel-visit-form";
import styles from "./conta.module.css";

const STATUS: Record<SubscriptionStatus, string> = {
  pending: "Aguardando pagamento",
  active: "Ativa",
  past_due: "Pagamento em atraso",
  paused: "Pausada",
  canceled: "Cancelada",
};

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
export function ContaView({ a }: { a: MyAccountRow }) {
  return (
    <div className={styles.page}>
      <h1 className="h page-title">Olá, {a.full_name.split(" ")[0]}</h1>
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
          <PlanSection a={a} />
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

function PlanSection({ a }: { a: MyAccountRow }) {
  const status = a.subscription_status;
  return (
    <section className={`card ${styles.panelSm}`} aria-labelledby="plano">
      <h2 id="plano" className={`h ${styles.h2sm}`}>
        Plano
      </h2>
      <dl className={styles.dl}>
        <dt>Situação</dt>
        <dd>
          <span className="badge">
            {status ? STATUS[status] : "Sem assinatura"}
          </span>
        </dd>
        <dt>Valor</dt>
        <dd>{formatBRL(a.plan_price_cents)} a cada 30 dias</dd>
        {a.current_period_end ? (
          <>
            <dt>Pago até</dt>
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
      {status === "pending" ? (
        <p className="muted">
          Sua assinatura foi criada e aguarda a confirmação do pagamento.
        </p>
      ) : null}
      {status === "past_due" ? (
        <p className="muted">
          Não identificamos o último pagamento. Assim que for confirmado, sua
          assinatura volta ao normal.
        </p>
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
        <dd>{a.whatsapp ?? "não informado"}</dd>
      </dl>
    </section>
  );
}
