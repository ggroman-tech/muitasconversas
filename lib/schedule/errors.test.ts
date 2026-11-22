import { expect, it } from "vitest";
import { scheduleVisitErrorMessage } from "./errors";

it("traduz códigos do DETAIL", () => {
  expect(scheduleVisitErrorMessage({ message: "x", details: "window_full" })).toMatch(/lotada/);
  expect(scheduleVisitErrorMessage({ message: "x", details: "cutoff_passed" })).toMatch(/encerrou/);
  expect(scheduleVisitErrorMessage({ message: "x", details: "overdue_blocked" })).toMatch(/atraso/);
  expect(scheduleVisitErrorMessage({ message: "x", details: "no_active_subscription" })).toMatch(/assinatura/);
  expect(scheduleVisitErrorMessage({ message: "x", details: "already_scheduled" })).toMatch(/já tem/);
});
it("aceita o código no message e não vaza erro desconhecido", () => {
  expect(scheduleVisitErrorMessage({ message: "schedule_visit: nothing_to_do" })).toMatch(/Não há entrega/);
  expect(scheduleVisitErrorMessage({ message: "relation x", details: "foo" })).toMatch(/Não foi possível/);
});
