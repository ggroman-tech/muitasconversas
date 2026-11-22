// Parser do CSV exportado do Libib. Puro (sem rede/IO) para ser testável.
// Formato real do export ainda NÃO verificado: o mapeamento tolera variações de cabeçalho.
import { createHash } from "node:crypto";

export type StagingRow = {
  libib_ref: string;
  isbn13: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  published_year: number | null;
  genres: string[];
  description: string | null;
  cover_url: string | null;
  copies: number;
  raw: Record<string, string>;
};

export type ParseResult = {
  rows: StagingRow[];
  warnings: string[];
  skipped: number;
  unmappedHeaders: string[];
};

/** CSV RFC 4180: aspas, aspas escapadas, quebras de linha dentro de campo, BOM, delimitador , ou ;. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = count(firstLine, ";") > count(firstLine, ",") ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      out.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return out.filter((r) => r.some((f) => f.trim() !== ""));
}
const count = (s: string, ch: string) => s.split(ch).length - 1;

export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const ALIASES: Record<string, string[]> = {
  title: ["title", "titulo", "nome", "name"],
  creators: ["creators", "creator", "authors", "author", "autor", "autores", "autoria"],
  first_name: ["first_name", "primeiro_nome", "nome_autor"],
  last_name: ["last_name", "sobrenome", "ultimo_nome"],
  isbn13: ["ean_isbn13", "ean_isbn_13", "isbn13", "isbn_13", "ean", "isbn"],
  isbn10: ["upc_isbn10", "upc_isbn_10", "isbn10", "isbn_10"],
  publisher: ["publisher", "editora", "publishers"],
  publish_date: ["publish_date", "published", "publication_date", "data_de_publicacao", "data_publicacao", "ano", "year", "publish_year"],
  tags: ["tags", "tag", "generos", "genero", "genres", "genre", "categorias", "categoria"],
  description: ["description", "descricao", "sinopse", "summary"],
  copies: ["copies", "copias", "exemplares", "quantidade", "qty", "quantity"],
  cover: ["cover", "cover_url", "image", "image_url", "capa", "capa_url"],
  item_type: ["item_type", "type", "tipo"],
};

function buildIndex(headers: string[]): { idx: Record<string, number>; unmapped: string[] } {
  const norm = headers.map(normalizeHeader);
  const idx: Record<string, number> = {};
  const used = new Set<number>();
  for (const [key, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const i = norm.indexOf(n);
      if (i >= 0) { idx[key] = i; used.add(i); break; }
    }
  }
  return { idx, unmapped: headers.filter((_, i) => !used.has(i)) };
}

export function isbn13Checksum(d: string): boolean {
  if (!/^\d{13}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10 === Number(d[12]);
}

/** Aceita ISBN-13 ou ISBN-10 (converte para 13). Devolve null se inválido. */
export function normalizeIsbn(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{13}$/.test(s)) return isbn13Checksum(s) ? s : null;
  if (/^\d{9}[\dX]$/.test(s)) {
    const core = "978" + s.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
    return core + ((10 - (sum % 10)) % 10);
  }
  return null;
}

const splitList = (s: string | undefined, seps: RegExp) =>
  Array.from(new Set((s ?? "").split(seps).map((x) => x.trim()).filter(Boolean)));

export function extractYear(s: string | undefined): number | null {
  const m = (s ?? "").match(/\b(1[5-9]\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : null;
}

const clean = (s: string | undefined) => {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
};

/** Só o título principal: corta subtítulo/sinopse depois de ":", " - " e parênteses finais. */
export function mainTitle(raw: string): string {
  const t = raw.replace(/\s*:.*$/, "").replace(/\s+-\s+.*$/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  return t || raw.trim();
}

export function parseLibibCsv(text: string): ParseResult {
  const table = parseCsv(text);
  const warnings: string[] = [];
  if (table.length === 0) return { rows: [], warnings: ["CSV vazio"], skipped: 0, unmappedHeaders: [] };
  const headers = table[0];
  const { idx, unmapped } = buildIndex(headers);
  if (idx.title === undefined) throw new Error(`Coluna de título não encontrada. Cabeçalhos: ${headers.join(", ")}`);

  const rows: StagingRow[] = [];
  let skipped = 0;
  const seenRef = new Set<string>();
  table.slice(1).forEach((cells, n) => {
    const line = n + 2;
    const get = (k: string) => (idx[k] === undefined ? undefined : cells[idx[k]]);
    const type = clean(get("item_type"));
    if (type && normalizeHeader(type) !== "book" && normalizeHeader(type) !== "livro") { skipped++; return; }
    const title = clean(get("title"));
    if (!title) { warnings.push(`linha ${line}: sem título, ignorada`); skipped++; return; }

    let authors = splitList(get("creators"), /[;|\n]+/);
    if (authors.length === 0) {
      const full = [clean(get("first_name")), clean(get("last_name"))].filter(Boolean).join(" ");
      if (full) authors = [full];
    }

    const rawIsbn = clean(get("isbn13"));
    let isbn13 = normalizeIsbn(rawIsbn ?? undefined);
    if (!isbn13) isbn13 = normalizeIsbn(clean(get("isbn10")) ?? undefined);
    if (!isbn13 && rawIsbn) warnings.push(`linha ${line}: ISBN inválido "${rawIsbn}"`);

    const copiesRaw = clean(get("copies"));
    let copies = 1;
    if (copiesRaw !== null) {
      const c = Number(copiesRaw);
      if (Number.isInteger(c) && c >= 0) copies = c;
      else warnings.push(`linha ${line}: copies "${copiesRaw}" inválido, assumindo 1`);
    }

    const publisher = clean(get("publisher"));
    const libib_ref = isbn13 ?? "lib:" + createHash("sha1")
      .update([title, authors.join(";"), publisher ?? ""].join("|").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())
      .digest("hex").slice(0, 16);
    if (seenRef.has(libib_ref)) warnings.push(`linha ${line}: "${title}" repetido no CSV (copies serão somadas)`);
    seenRef.add(libib_ref);

    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { if (cells[i] !== undefined && cells[i] !== "") raw[h] = cells[i]; });

    rows.push({
      libib_ref, isbn13, title: mainTitle(title), authors, publisher,
      published_year: extractYear(get("publish_date")),
      genres: splitList(get("tags"), /[,;|\n]+/),
      description: clean(get("description")),
      cover_url: clean(get("cover")),
      copies, raw,
    });
  });
  return { rows, warnings, skipped, unmappedHeaders: unmapped };
}
