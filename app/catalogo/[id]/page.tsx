import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook } from "@/lib/catalog/query";
import { catalogClient } from "@/lib/catalog/server";
import { OVERDUE_MESSAGE, statusLabel } from "@/lib/catalog/types";
import { BookCover } from "@/lib/catalog/cover";
import { reservar } from "./actions";
import s from "../catalogo.module.css";
import { PLAN_PRICE } from "@/lib/plan";

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
  if (user) {
    const { data: atrasos } = await sb.from("loans").select("id").eq("status", "overdue").limit(1);
    emAtraso = (atrasos?.length ?? 0) > 0;
  }
  const disponivel = book.copies_available > 0;
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
    <main className={`container ${s.page}`}>
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

          {book.description && <p className={s.synopsis}>{book.description}</p>}

          <dl className={s.meta}>
            {meta.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>

          {emAtraso ? (
            <p role="alert" className={`alert ${s.alertBox}`}>{OVERDUE_MESSAGE}</p>
          ) : (
            !sp.ok && (
              <div className={`card ${s.panel}`}>
                <h2>{user ? (disponivel ? "Reservar este livro" : "Entrar na fila de espera") : "Reserve este livro"}</h2>
                <p>
                  {disponivel
                    ? "Entrega em casa, com frete incluso na assinatura de 30 dias (" + PLAN_PRICE + "). Depois da reserva, escolha a troca de sábado (09h às 14h; pedidos fecham na sexta-feira, às 08h). Você fica com o livro por até 28 dias corridos, um por vez, ou troca aos sábados."
                    : "Avisamos quando chegar a sua vez. Frete incluso na assinatura de 30 dias (" + PLAN_PRICE + "); um livro por vez, por até 28 dias corridos ou troca aos sábados (09h às 14h)."}
                </p>
                <div className="row">
                  <form action={reservar.bind(null, book.id)}>
                    <button className="btn" type="submit">{label}</button>
                  </form>
                  {!user && <Link className="btn2" href="/assinar">Ainda não sou assinante</Link>}
                </div>
              </div>
            )
          )}

          {sp.erro && <p role="alert" className={`alert ${s.alertBox}`}>{sp.erro}</p>}
          {sp.ok && (
            <div role="status" className={`card ${s.panel} ${s.panelOk}`}>
              <h2>{disponivel ? "Livro reservado" : "Você está na fila"}</h2>
              <p>
                {disponivel
                  ? "Reserva feita! Veja os próximos passos na sua conta."
                  : "Você entrou na fila. Avisaremos quando o livro estiver disponível."}
              </p>
              <div className="row">
                <Link className="btn" href="/agendar">Agendar entrega</Link>
                <Link className="btn2" href="/conta">Ver minha conta</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
