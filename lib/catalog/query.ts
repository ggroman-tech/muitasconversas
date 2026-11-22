import { catalogClient } from "./server";
import type { Availability, CatalogBook } from "./types";

export const PAGE_SIZE = 24;
const COLS = "id,isbn13,title,authors,publisher,published_year,genres,description,cover_url,copies_available,queue_size";

export async function searchCatalog(opts: { q?: string; genre?: string; disp?: Availability; page?: number }) {
  const sb = await catalogClient();
  const page = Math.max(1, opts.page ?? 1);
  let query = sb.from("catalog_public").select(COLS, { count: "exact" });
  const q = opts.q?.trim();
  if (q) query = query.textSearch("search", q, { type: "websearch", config: "portuguese" });
  if (opts.genre) query = query.contains("genres", [opts.genre]);
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

export async function getBook(id: string): Promise<CatalogBook | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await catalogClient();
  const { data } = await sb.from("catalog_public").select(COLS).eq("id", id).maybeSingle();
  return (data as CatalogBook | null) ?? null;
}
