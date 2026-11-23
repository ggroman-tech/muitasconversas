import { catalogClient } from "./server";
import type { Availability, CatalogBook } from "./types";

export const PAGE_SIZE = 24;
const COLS = "id,isbn13,title,authors,publisher,published_year,genres,genre,condition,description,cover_url,copies_available,queue_size";

export async function searchCatalog(opts: { q?: string; genre?: string; condition?: string; disp?: Availability; page?: number }) {
  const sb = await catalogClient();
  const page = Math.max(1, opts.page ?? 1);
  let query = sb.from("catalog_public").select(COLS, { count: "exact" });
  const q = opts.q?.trim();
  if (q) query = query.textSearch("search", q, { type: "websearch", config: "portuguese" });
  if (opts.genre) query = query.eq("genre", opts.genre);
  if (opts.condition) query = query.eq("condition", opts.condition);
  if (opts.disp === "disponiveis") query = query.gt("copies_available", 0);
  if (opts.disp === "fila") query = query.eq("copies_available", 0);
  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.order("title").range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return { books: (data ?? []) as CatalogBook[], total: count ?? 0, page };
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
