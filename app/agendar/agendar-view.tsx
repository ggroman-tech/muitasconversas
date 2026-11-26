import Link from "next/link";
import { formatDateOnly, formatDateTime } from "@/lib/auth/format";
import type { ScheduleOptions } from "@/lib/schedule/types";
import styles from "./agendar.module.css";
import { ScheduleForm } from "./schedule-form";

/** Tela "Agendar troca ou devolução" (apresentação a partir de schedule_options). */
export function AgendarView({ o }: { o: ScheduleOptions }) {
  const doing: string[] = [];
  if (o.deliver) doing.push(`Entregar o livro reservado: ${o.deliver.title}.`);
  for (const c of o.collect)
    doing.push(`Coletar o livro que está com você: ${c.title}.`);

  return (
    <>
      <section className={`card ${styles.panel}`} aria-labelledby={o.has_active_subscription && doing.length === 0 ? undefined : "oquefazer"} aria-label={o.has_active_subscription && doing.length === 0 ? "Nada para agendar" : undefined}>
        {o.has_active_subscription && doing.length === 0 ? null : (
          <h2 id="oquefazer" className={`h ${styles.h2}`}>
            O que será feito
          </h2>
        )}
        {!o.has_active_subscription ? (
          <>
            <p>
              Sua assinatura não está ativa. É preciso ter uma assinatura ativa
              para agendar.
            </p>
            <p>
              <Link href="/conta" className="btn2">Ver minha assinatura</Link>
            </p>
          </>
        ) : doing.length === 0 ? (
          <>
            <p>
              Não há entrega nem coleta para agendar agora. Reserve um livro no
              catálogo para escolher a entrega.
            </p>
            <p>
              <Link href="/catalogo" className="btn">Ver o catálogo</Link>
            </p>
          </>
        ) : (
          <>
            <ul className={styles.todo}>
              {doing.map((t) => (
                <li key={t}>
                  <span className={styles.todoLabel}>
                    {t.startsWith("Entregar")
                      ? "Vamos entregar"
                      : "Vamos buscar"}
                  </span>
                  <span className={styles.todoValue}>{t}</span>
                </li>
              ))}
            </ul>
            {o.deliver && o.collect.length > 0 ? (
              <p className={styles.hint}>
                É uma troca: levamos o novo e recolhemos o que está com você.
              </p>
            ) : null}
            {o.deliver ? (
              <p className={styles.hint}>
                Livro guardado para você até{" "}
                {formatDateTime(o.deliver.hold_expires_at)}.
              </p>
            ) : null}
          </>
        )}
        {o.blocked_by_overdue ? (
          <p role="alert" className="alert">
            Seu livro está atrasado
            {o.overdue_since ? ` desde ${formatDateOnly(o.overdue_since)}` : ""}
            . Enquanto não devolver, a entrega de novos livros fica suspensa.
            Agende a coleta para devolver; depois disso, o livro reservado volta
            a poder ser entregue.
          </p>
        ) : null}
      </section>

      {!o.has_active_subscription || doing.length === 0 ? null : o.days
          .length === 0 ? (
        <section className="card">
          <p role="status">
            Ainda não há sábado aberto para agendar. Os próximos sábados ainda
            serão abertos.
          </p>
        </section>
      ) : o.addresses.length === 0 ? (
        <p role="alert" className="alert">
          Você não tem endereço cadastrado.
        </p>
      ) : (
        <ScheduleForm addresses={o.addresses} days={o.days} />
      )}
    </>
  );
}
