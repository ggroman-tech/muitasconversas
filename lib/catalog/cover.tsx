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

type Props = {
  book: Pick<CatalogBook, "id" | "title" | "authors" | "cover_url">;
  /** "lg" = página do livro (tipografia maior). */
  size?: "md" | "lg";
  lazy?: boolean;
};

export function BookCover({ book, size = "md", lazy = false }: Props) {
  const radius = size === "lg" ? 8 : 6;
  if (book.cover_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={book.cover_url}
        alt={`Capa de ${book.title}`}
        loading={lazy ? "lazy" : undefined}
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
      <span className="t" style={{ fontSize: big ? 32 : 19, lineHeight: big ? 1.15 : 1.2 }}>{book.title}</span>
      <span className="a" style={{ fontSize: big ? 15 : 12 }}>{book.authors.join(", ")}</span>
    </div>
  );
}
