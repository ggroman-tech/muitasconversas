import { expect, it } from "vitest";
import { cancelVisitErrorMessage } from "./visit-errors";

it("traduz cutoff_passed (DETAIL ou message)", () => {
  const msg = "O prazo para cancelar esta visita já passou.";
  expect(cancelVisitErrorMessage({ message: "erro", details: "cutoff_passed" })).toBe(msg);
  expect(cancelVisitErrorMessage({ message: "cancel_visit: cutoff_passed" })).toBe(msg);
});
it("erro desconhecido não vaza detalhe", () => {
  expect(cancelVisitErrorMessage({ message: "relation x", details: "foo" })).toMatch(/Não foi possível/);
});
