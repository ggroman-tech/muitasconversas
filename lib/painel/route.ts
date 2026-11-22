import type { RouteRow } from "./types";

export type RouteGroup = { key: string; area_name: string; starts_at: string; ends_at: string; rows: RouteRow[] };

/** Agrupa por janela (início/fim) e bairro; dentro, por route_order (nulos por último, depois nome). */
export function groupRoute(rows: RouteRow[]): RouteGroup[] {
  const map = new Map<string, RouteGroup>();
  for (const r of rows) {
    const key = `${r.window_starts_at}|${r.window_ends_at}|${r.area_name}`;
    let g = map.get(key);
    if (!g) {
      g = { key, area_name: r.area_name, starts_at: r.window_starts_at, ends_at: r.window_ends_at, rows: [] };
      map.set(key, g);
    }
    g.rows.push(r);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.rows.sort((a, b) => {
      const ao = a.route_order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.route_order ?? Number.MAX_SAFE_INTEGER;
      return ao - bo || a.customer_name.localeCompare(b.customer_name, "pt-BR");
    });
  }
  groups.sort(
    (a, b) =>
      a.starts_at.localeCompare(b.starts_at) ||
      a.ends_at.localeCompare(b.ends_at) ||
      a.area_name.localeCompare(b.area_name, "pt-BR"),
  );
  return groups;
}

/** Livros a separar (entregas ainda não concluídas) e a receber (coletas), para a lista de preparo. */
export function prepLists(rows: RouteRow[]) {
  const deliver: { title: string; copy_label: string; customer_name: string }[] = [];
  const collect: { title: string; copy_label: string; customer_name: string }[] = [];
  for (const r of rows) {
    if (r.visit_status === "done") continue;
    for (const it of r.items) {
      (it.direction === "deliver" ? deliver : collect).push({
        title: it.title,
        copy_label: it.copy_label,
        customer_name: r.customer_name,
      });
    }
  }
  const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, "pt-BR");
  return { deliver: deliver.sort(byTitle), collect: collect.sort(byTitle) };
}

/** Número de WhatsApp -> link wa.me (assume Brasil se vier só com DDD). null se inválido. */
export function whatsappLink(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const full = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${full}`;
}

export function addressLine(r: Pick<RouteRow, "street" | "number" | "complement" | "cep">): string {
  return [`${r.street}, ${r.number}`, r.complement, `CEP ${r.cep}`].filter(Boolean).join(" — ");
}
