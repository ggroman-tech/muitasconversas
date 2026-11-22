import { expect, it } from "vitest";
import { safeNext } from "./safe-next";

it("bloqueia redirecionamento externo", () => {
  expect(safeNext("/assinar")).toBe("/assinar");
  expect(safeNext("//evil.com")).toBe("/conta");
  expect(safeNext("https://evil.com")).toBe("/conta");
  expect(safeNext("/\\evil.com")).toBe("/conta");
  expect(safeNext(null, "/x")).toBe("/x");
});
