import { Suspense } from "react";
import Link from "next/link";
import { facetCounts, listConditions, listGenres, searchCatalog, PAGE_SIZE } from "@/lib/catalog/query";
import { statusLabel, type Availability } from "@/lib/catalog/types";
import { BookCover } from "@/lib/catalog/cover";
import s from "./catalogo.module.css";

export const metadata = { title: "Catálogo" };

type SP = { q?: string; genero?: string; cons?: string; disp?: string; p?: string };

export default function CatalogoPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense
      fallback={
        <main className={`container ${s.page}`}>
          <h1 className="page-title">Catálogo</h1>
          <p className="muted">Carregando…</p>
        </main>
      }
    >
      <CatalogoConteudo searchParams={searchParams} />
    </Suspense>
  );
}

const DISP_OPTIONS: { value: Availability; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "disponiveis", label: "Disponíveis agora" },
  { value: "fila", label: "Com fila de espera" },
];

async function CatalogoConteudo({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const disp: Availability = sp.disp === "disponiveis" || sp.disp === "fila" ? sp.disp : "todos";
  const [{ books, total, page }, genres, conditions, counts] = await Promise.all([
    searchCatalog({ q: sp.q, genre: sp.genero, condition: sp.cons, disp, page: Number(sp.p) || 1 }),
    listGenres(),
    listConditions(),
    facetCounts(),
  ]);
  const hasFilters = !!(sp.q?.trim() || sp.genero || sp.cons || disp !== "todos");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number, over: { genero?: string; cons?: string; disp?: Availability } = {}) => {
    const genero = "genero" in over ? over.genero : sp.genero;
    const cons = "cons" in over ? over.cons : sp.cons;
    const d = "disp" in over ? over.disp : disp;
    const u = new URLSearchParams();
    if (sp.q) u.set("q", sp.q);
    if (genero) u.set("genero", genero);
    if (cons) u.set("cons", cons);
    if (d && d !== "todos") u.set("disp", d);
    if (p > 1) u.set("p", String(p));
    return `/catalogo${u.size ? `?${u}` : ""}`;
  };
  const chipCls = (on: boolean) => `${s.chip} ${on ? s.chipOn : ""}`;

  return (
    <main id="conteudo" className={`container ${s.page}`}>
      <div className={s.head}>
        <h1 className="page-title">Catálogo</h1>
        <p className={s.lead} role="status" aria-live="polite">
          {total === 0
            ? ""
            : `${total} ${total === 1 ? "livro encontrado" : "livros encontrados"}. Reserve os disponíveis ou entre na fila dos emprestados.`}
        </p>
      </div>

      <form className={s.search} action="/catalogo" method="get" role="search">
        {sp.genero && <input type="hidden" name="genero" value={sp.genero} />}
        {sp.cons && <input type="hidden" name="cons" value={sp.cons} />}
        {disp !== "todos" && <input type="hidden" name="disp" value={disp} />}
        <div className={`field ${s.searchField}`}>
          <label htmlFor="busca" className={s.searchLabel}>Buscar por título, autor ou assunto</label>
          <input id="busca" className={s.searchInput} type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Ex.: Agatha Christie, Stephen King" />
        </div>
        <button type="submit" className="btn">Buscar</button>
      </form>

      {hasFilters ? (
        <p>
          <Link href="/catalogo" className={s.clear}>Limpar busca e filtros</Link>
        </p>
      ) : null}

      <div className={s.groups}>
        <div className={s.group}>
          <span className={s.groupLabel} id="g-disp">Disponibilidade</span>
          <div className={s.chips} role="group" aria-labelledby="g-disp">
            {DISP_OPTIONS.map((o) => (
              <Link key={o.value} href={href(1, { disp: o.value })} className={chipCls(disp === o.value)} aria-current={disp === o.value ? "true" : undefined}>
                {o.label}
              </Link>
            ))}
          </div>
        </div>
        {genres.length > 0 && (
          <div className={s.group}>
            <span className={s.groupLabel} id="g-gen">Gênero</span>
            <div className={s.chips} role="group" aria-labelledby="g-gen">
              <Link href={href(1, { genero: undefined })} className={chipCls(!sp.genero)} aria-current={!sp.genero ? "true" : undefined}>Todos</Link>
              {genres.map((g) => (
                <Link key={g} href={href(1, { genero: g })} className={chipCls(sp.genero === g)} aria-current={sp.genero === g ? "true" : undefined}>
                  {g}
                  {counts.genre[g] ? <span className={s.count}> ({counts.genre[g]})</span> : null}
                </Link>
              ))}
            </div>
          </div>
        )}
        {conditions.length > 0 && (
          <div className={s.group}>
            <span className={s.groupLabel} id="g-cons">Conservação</span>
            <div className={s.chips} role="group" aria-labelledby="g-cons">
              <Link href={href(1, { cons: undefined })} className={chipCls(!sp.cons)} aria-current={!sp.cons ? "true" : undefined}>Todas</Link>
              {conditions.map((c) => (
                <Link key={c} href={href(1, { cons: c })} className={chipCls(sp.cons === c)} aria-current={sp.cons === c ? "true" : undefined}>
                  {c}
                  {counts.condition[c] ? <span className={s.count}> ({counts.condition[c]})</span> : null}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {books.length > 0 ? (
        <ul className={s.grid}>
          {books.map((b) => (
            <li key={b.id}>
              <Link href={`/catalogo/${b.id}`} className={s.item}>
                <BookCover book={b} lazy decorative />
                <span className={s.bookTitle}>{b.title}</span>
                <span className={s.genre}>{b.authors.join(", ")}</span>
                <span className={`${s.chipStatus} ${b.copies_available > 0 ? "" : b.queue_size > 0 ? s.chipQueue : s.chipOut}`}>
                  {statusLabel(b)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className={s.empty}>
          {page > 1 && total > 0 ? (
            <>
              <p>Essa página não existe mais para a sua busca.</p>
              <p><Link className="btn2" href={href(1)}>Voltar à primeira página</Link></p>
            </>
          ) : (
            <>
              {disp === "fila" && !sp.q?.trim() && !sp.genero && !sp.cons ? (
                <>
                  <p><strong>Nenhum livro está emprestado ou com fila agora.</strong></p>
                  <p>Todos os livros do acervo estão disponíveis para reservar.</p>
                </>
              ) : (
                <>
                  <p><strong>Nenhum livro encontrado{sp.q?.trim() ? ` para “${sp.q.trim()}”` : " com esses filtros"}.</strong></p>
                  <p>Confira a ortografia, busque só pelo sobrenome do autor ou tire algum filtro.</p>
                </>
              )}
              <p><Link className="btn2" href="/catalogo">Limpar filtros</Link></p>
            </>
          )}
        </div>
      )}

      {pages > 1 && (
        <nav className={s.pager} aria-label="Paginação">
          {page > 1 ? <Link href={href(page - 1)}>← Anterior</Link> : <span />}
          <span className="muted">Página {page} de {pages}</span>
          {page < pages ? <Link href={href(page + 1)}>Próxima →</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
