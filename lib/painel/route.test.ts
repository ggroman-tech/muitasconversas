import { expect, it } from "vitest";
import { groupRoute, prepLists, whatsappLink } from "./route";
import type { RouteRow } from "./types";

const base: RouteRow = {
  visit_id: "v", delivery_day: "2026-11-28", window_starts_at: "09:00:00", window_ends_at: "14:00:00",
  area_name: "Botafogo", route_order: null, visit_status: "requested", customer_name: "B", customer_whatsapp: null,
  cep: "22250000", street: "Rua A", number: "1", complement: null, reference: null, customer_note: null, items: [],
};

it("agrupa por bairro/janela e ordena por route_order (nulos por último)", () => {
  const rows: RouteRow[] = [
    { ...base, visit_id: "1", route_order: null, customer_name: "Zé" },
    { ...base, visit_id: "2", route_order: 2, customer_name: "Ana" },
    { ...base, visit_id: "3", route_order: 1, customer_name: "Bia" },
    { ...base, visit_id: "4", area_name: "Leblon", customer_name: "Cris" },
  ];
  const g = groupRoute(rows);
  expect(g.map((x) => x.area_name)).toEqual(["Botafogo", "Leblon"]);
  expect(g[0].rows.map((r) => r.visit_id)).toEqual(["3", "2", "1"]);
});

it("lista de preparo ignora visitas concluídas", () => {
  const rows: RouteRow[] = [
    { ...base, items: [{ direction: "deliver", loan_id: "l1", copy_label: "A-1", title: "Dom Casmurro" }, { direction: "collect", loan_id: "l2", copy_label: "B-1", title: "Capitães" }] },
    { ...base, visit_status: "done", items: [{ direction: "deliver", loan_id: "l3", copy_label: "C-1", title: "Outro" }] },
  ];
  const p = prepLists(rows);
  expect(p.deliver.map((x) => x.title)).toEqual(["Dom Casmurro"]);
  expect(p.collect.map((x) => x.title)).toEqual(["Capitães"]);
});

it("whatsappLink", () => {
  expect(whatsappLink("(21) 99999-1234")).toBe("https://wa.me/5521999991234");
  expect(whatsappLink("+55 21 99999-1234")).toBe("https://wa.me/5521999991234");
  expect(whatsappLink("123")).toBeNull();
});
