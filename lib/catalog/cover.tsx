import type { CatalogBook } from "./types";

// Paleta verde/terrosa do mockup; escolha estável a partir do id/título.
const COVER_COLORS = [
  "#1F3D36", "#7A3B12", "#6B4E16", "#3F4F1E", "#234B52",
  "#5A2A3C", "#8A4B0E", "#14523F", "#4A3B2A", "#1E3A5F",
];

export function coverColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COVER_COLORS[h % COVER_COLORS.length];
}

/** Título principal: corta o subtítulo depois de ":" (ex.: "Nome: pequena sinopse"). */
export function shortTitle(title: string): string {
  const i = title.indexOf(":");
  const head = i > 3 ? title.slice(0, i).trim() : title.trim();
  return head || title;
}

const clamp = (lines: number) =>
  ({ display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }) as const;

type Props = {
  book: Pick<CatalogBook, "id" | "title" | "authors" | "cover_url">;
  /** "lg" = página do livro (tipografia maior). */
  size?: "md" | "lg";
  lazy?: boolean;
  /** Capa dentro de um link que já mostra o título: alt vazio evita o leitor de tela repetir o nome. */
  decorative?: boolean;
};

export function BookCover({ book, size = "md", lazy = false, decorative = false }: Props) {
  const radius = size === "lg" ? 8 : 6;
  if (book.cover_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={book.cover_url}
        alt={decorative ? "" : `Capa de ${book.title}`}
        width={300}
        height={400}
        loading={lazy ? "lazy" : undefined}
        decoding="async"
        referrerPolicy="no-referrer"
        style={{ display: "block", width: "100%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: radius, background: "#e4e8e6" }}
      />
    );
  }
  const big = size === "lg";
  return (
    <div
      className="cover"
      aria-hidden="true"
      style={{
        background: coverColor(book.id || book.title),
        borderRadius: radius,
        padding: big ? 24 : 14,
      }}
    >
      <span className="t" style={{ fontSize: big ? 32 : 19, lineHeight: big ? 1.15 : 1.2, ...clamp(big ? 6 : 5) }}>{shortTitle(book.title)}</span>
      <span className="a" style={{ fontSize: big ? 15 : 12, ...clamp(2) }}>{book.authors.join(", ")}</span>
    </div>
  );
}
