import { expect, it } from "vitest";
import { painelErrorMessage } from "./errors";

it("traduz códigos do DETAIL", () => {
  expect(painelErrorMessage({ message: "x", details: "invalid_visit_status" })).toMatch(/não pode receber/);
  expect(painelErrorMessage({ message: "x", details: "forbidden" })).toMatch(/permissão/);
  expect(painelErrorMessage({ message: "x", details: "invalid_loan_status" })).toMatch(/devolvido/);
});
it("config_pending cita a configuração", () => {
  const m = painelErrorMessage({ message: "Configuração window_capacity pendente.", details: "config_pending" });
  expect(m).toMatch(/Configuração pendente/);
  expect(m).toMatch(/window_capacity/);
});
it("erro desconhecido não vaza detalhe técnico", () => {
  expect(painelErrorMessage({ message: "relation x does not exist", details: "foo" })).toMatch(/Não foi possível/);
});
