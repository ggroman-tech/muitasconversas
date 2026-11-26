import { catalogClient } from "./server";
import type { Availability, CatalogBook } from "./types";

export const PAGE_SIZE = 24;
const COLS = "id,isbn13,title,authors,publisher,published_year,genres,genre,condition,description,cover_url,copies_available,queue_size";

export async function searchCatalog(opts: { q?: string; genre?: string; condition?: string; disp?: Availability; page?: number }) {
  const sb = await catalogClient();
  const wanted = Number.isFinite(opts.page) ? Math.max(1, Math.floor(opts.page as number)) : 1;
  const build = () => {
    let query = sb.from("catalog_public").select(COLS, { count: "exact" });
    const q = opts.q?.trim();
    if (q) query = query.textSearch("search", q, { type: "websearch", config: "portuguese" });
    if (opts.genre) query = query.eq("genre", opts.genre);
    if (opts.condition) query = query.eq("condition", opts.condition);
    if (opts.disp === "disponiveis") query = query.gt("copies_available", 0);
    if (opts.disp === "fila") query = query.eq("copies_available", 0);
    return query.order("title");
  };
  const run = (page: number) => build().range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  let page = wanted;
  let res = await run(page);
  if (res.error && page > 1) {
    // página além da última (link antigo ou digitado): descobre o total e cai na última página existente
    const head = await build().range(0, 0);
    const total = head.count ?? 0;
    page = Math.max(1, Math.ceil(total / PAGE_SIZE));
    res = await run(page);
  }
  if (res.error) throw new Error(res.error.message);
  return { books: (res.data ?? []) as unknown as CatalogBook[], total: res.count ?? 0, page };
}

export async function listGenres(): Promise<string[]> {
  const sb = await catalogClient();
  const { data } = await sb.from("catalog_genres").select("genre").order("genre");
  return (data ?? []).map((g: { genre: string }) => g.genre);
}

const CONDITION_ORDER = ["Novo", "Muito bom", "Bom", "Médio"];

export async function listConditions(): Promise<string[]> {
  const sb = await catalogClient();
  const { data } = await sb.from("catalog_conditions").select("condition");
  const found = (data ?? []).map((c: { condition: string }) => c.condition);
  return [...CONDITION_ORDER.filter((c) => found.includes(c)), ...found.filter((c) => !CONDITION_ORDER.includes(c)).sort()];
}

export async function getBook(id: string): Promise<CatalogBook | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await catalogClient();
  const { data } = await sb.from("catalog_public").select(COLS).eq("id", id).maybeSingle();
  return (data as CatalogBook | null) ?? null;
}

/** Livros em destaque para a home: prioriza os que têm capa. `from`/`to` são índices (inclusivos). */
export async function featuredBooks(from: number, to: number): Promise<CatalogBook[]> {
  const sb = await catalogClient();
  const { data } = await sb
    .from("catalog_public")
    .select(COLS)
    .not("cover_url", "is", null)
    .order("title")
    .range(from, to);
  return (data ?? []) as CatalogBook[];
}

/** Contagem de livros por gênero e por conservação (catálogo inteiro), para mostrar nos filtros. */
export async function facetCounts(): Promise<{ genre: Record<string, number>; condition: Record<string, number> }> {
  const sb = await catalogClient();
  const { data } = await sb.from("catalog_public").select("genre,condition").limit(5000);
  const genre: Record<string, number> = {};
  const condition: Record<string, number> = {};
  for (const r of (data ?? []) as { genre: string | null; condition: string | null }[]) {
    if (r.genre) genre[r.genre] = (genre[r.genre] ?? 0) + 1;
    if (r.condition) condition[r.condition] = (condition[r.condition] ?? 0) + 1;
  }
  return { genre, condition };
}
