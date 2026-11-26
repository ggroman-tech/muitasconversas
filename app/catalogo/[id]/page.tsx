import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook } from "@/lib/catalog/query";
import { catalogClient } from "@/lib/catalog/server";
import { OVERDUE_MESSAGE, statusLabel } from "@/lib/catalog/types";
import type { MyAccountReservation } from "@/lib/auth/database.types";
import { truncateAtSentence } from "@/lib/catalog/text";
import { bookActionKind, reservationNotice } from "@/lib/catalog/book-state";
import { BookCover } from "@/lib/catalog/cover";
import { reservar } from "./actions";
import { ReserveButton } from "./reserve-button";
import s from "../catalogo.module.css";
import { PLAN_PRICE } from "@/lib/plan";
import { deriveSubscriptionState, type DbSubscriptionStatus } from "@/lib/assinatura/state";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> };

export const metadata = { title: "Livro" };

export default function LivroPage(props: Props) {
  return (
    <Suspense
      fallback={
        <main className={`container ${s.page}`}>
          <p className="muted">Carregando…</p>
        </main>
      }
    >
      <LivroConteudo {...props} />
    </Suspense>
  );
}

async function LivroConteudo({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const book = await getBook(id);
  if (!book) notFound();

  const sb = await catalogClient();
  const { data: { user } } = await sb.auth.getUser();
  let emAtraso = false;
  let acesso: ReturnType<typeof deriveSubscriptionState> | null = null;
  let minhaReserva: { status: "queued" | "offered"; position: number | null } | null = null;
  let comOLivro = false;
  if (user) {
    const { data: conta } = await sb
      .from("my_account")
      .select("subscription_status,current_period_end,reservations,loan_book_id,loan_status,blocked_by_overdue")
      .maybeSingle();
    acesso = deriveSubscriptionState({
      status: (conta?.subscription_status ?? null) as DbSubscriptionStatus | null,
      currentPeriodEnd: conta?.current_period_end ?? null,
    });
    emAtraso = conta?.blocked_by_overdue === true;
    const r = ((conta?.reservations ?? []) as MyAccountReservation[]).find((x) => x.book_id === book.id);
    if (r) minhaReserva = { status: r.status, position: r.position };
    comOLivro =
      conta?.loan_book_id === book.id &&
      (conta?.loan_status === "active" || conta?.loan_status === "overdue" || conta?.loan_status === "return_requested" || conta?.loan_status === "scheduled");
  }
  const disponivel = book.copies_available > 0;
  const sinopse = truncateAtSentence(book.description ?? "", 700);
  const kind = bookActionKind({
    loggedIn: !!user,
    hasAccess: acesso?.hasAccess ?? false,
    overdue: emAtraso,
    reservation: minhaReserva,
    borrowing: comOLivro,
    copiesAvailable: book.copies_available,
  });
  const label = user
    ? disponivel ? "Reservar" : "Entrar na fila"
    : "Entrar para reservar";

  const statusClass = disponivel ? "" : book.queue_size > 0 ? s.chipQueue : s.chipOut;
  const statusNote = disponivel
    ? "Pronto para entrega na próxima troca de sábado."
    : book.queue_size > 0
      ? `Há ${book.queue_size} ${book.queue_size === 1 ? "pessoa" : "pessoas"} na fila.`
      : "Emprestado no momento, sem fila.";

  const meta: [string, string][] = [];
  if (book.publisher) meta.push(["Editora", book.publisher]);
  if (book.published_year) meta.push(["Ano", String(book.published_year)]);
  if (book.isbn13) meta.push(["ISBN", book.isbn13]);
  if (book.condition) meta.push(["Conservação", book.condition]);
  meta.push(["Exemplares", `${book.copies_available} ${book.copies_available === 1 ? "disponível" : "disponíveis"}`]);

  return (
    <main id="conteudo" className={`container ${s.page}`}>
      <Link href="/catalogo" className={s.back}>← Voltar ao catálogo</Link>

      <div className={s.detail}>
        <div className={s.coverCol}>
          <BookCover book={book} size="lg" />
        </div>

        <div className={s.info}>
          <div className={s.titleBlock}>
            {book.genre && <span className={s.eyebrow}>{book.genre}</span>}
            <h1 className={`h ${s.bookH1}`}>{book.title}</h1>
            <span className={s.authors}>{book.authors.join(", ")}</span>
          </div>

          <div className={s.statusRow}>
            <span className={`${s.statusChip} ${statusClass}`}>{statusLabel(book)}</span>
            <span className={s.statusNote}>{statusNote}</span>
          </div>

          {book.description ? (
            sinopse.truncated ? (
              <div className={s.synopsisBox}>
                <p className={s.synopsis}>{sinopse.head}</p>
                <details className={s.more}>
                  <summary>Ler a sinopse completa</summary>
                  <p className={s.synopsis}>{book.description}</p>
                </details>
              </div>
            ) : (
              <p className={s.synopsis}>{book.description}</p>
            )
          ) : null}

          <dl className={s.meta}>
            {meta.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>

          {kind === "no_access" && acesso ? (
            <div role="alert" className={`alert ${s.alertBox}`}>
              <p>
                {acesso.key === "none"
                  ? "Para reservar, conclua o seu cadastro de assinante."
                  : `Sua assinatura não está ativa (${acesso.label.toLowerCase()}), por isso não dá para reservar agora.`}
              </p>
              <div className="row">
                <Link className="btn" href={acesso.key === "none" ? "/assinar" : "/assinar/concluir"}>
                  {acesso.key === "none" ? "Concluir cadastro" : acesso.canPay ? "Pagar a assinatura" : "Ver minha assinatura"}
                </Link>
                <Link className="btn2" href="/conta">Minha conta</Link>
              </div>
            </div>
          ) : kind === "overdue" ? (
            <div role="alert" className={`alert ${s.alertBox}`}>
              <p>{OVERDUE_MESSAGE}</p>
              <div className="row">
                <Link className="btn" href="/agendar">Agendar devolução</Link>
                <Link className="btn2" href="/conta">Minha conta</Link>
              </div>
            </div>
          ) : kind === "borrowing" ? (
            <div role="status" className={`card ${s.panel} ${s.panelOk}`}>
              <h2>Este livro está com você</h2>
              <p>Veja o prazo de devolução em Minha conta ou agende a troca de sábado.</p>
              <div className="row">
                <Link className="btn" href="/agendar">Agendar troca ou devolução</Link>
                <Link className="btn2" href="/conta">Minha conta</Link>
              </div>
            </div>
          ) : (kind === "has_offer" || kind === "in_queue") && minhaReserva ? (
            <div role="status" className={`card ${s.panel} ${s.panelOk}`}>
              <h2>{reservationNotice(minhaReserva).title}</h2>
              <p>{reservationNotice(minhaReserva).text}</p>
              <div className="row">
                {kind === "has_offer" ? <Link className="btn" href="/agendar">Agendar entrega</Link> : null}
                <Link className={kind === "has_offer" ? "btn2" : "btn"} href="/conta">Ver minha conta</Link>
              </div>
            </div>
          ) : (
            <div className={`card ${s.panel}`}>
              <h2>{user ? (disponivel ? "Reservar este livro" : "Entrar na fila de espera") : "Reserve este livro"}</h2>
              <p>
                {disponivel
                  ? "Entrega em casa, com frete incluso na assinatura de 30 dias (" + PLAN_PRICE + "). Depois da reserva, escolha a troca de sábado (09h às 14h; pedidos fecham na sexta-feira, às 08h). Você fica com o livro por até 28 dias corridos, um por vez, ou troca aos sábados."
                  : "Avisamos quando chegar a sua vez. Frete incluso na assinatura de 30 dias (" + PLAN_PRICE + "); um livro por vez, por até 28 dias corridos ou troca aos sábados (09h às 14h)."}
              </p>
              <div className="row">
                <form action={reservar.bind(null, book.id)}>
                  <ReserveButton label={label} />
                </form>
                {!user && <Link className="btn2" href="/assinar">Ainda não sou assinante</Link>}
              </div>
            </div>
          )}

          {sp.erro && <p role="alert" className={`alert ${s.alertBox}`}>{sp.erro}</p>}
          {sp.ok && !minhaReserva && !comOLivro ? (
            <p role="status" className={`alert alert-ok ${s.alertBox}`}>
              Pedido recebido. Atualize a página em instantes para ver a situação da sua reserva em Minha conta.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
