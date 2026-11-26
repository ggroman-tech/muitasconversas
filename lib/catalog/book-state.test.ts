import { describe, expect, it } from "vitest";
import { bookActionKind, reservationNotice, type BookActionInput } from "./book-state";

const base: BookActionInput = {
  loggedIn: true,
  hasAccess: true,
  overdue: false,
  reservation: null,
  borrowing: false,
  copiesAvailable: 1,
};

describe("bookActionKind", () => {
  it("visitante sem login", () => {
    expect(bookActionKind({ ...base, loggedIn: false })).toBe("login");
  });
  it("assinatura sem acesso", () => {
    expect(bookActionKind({ ...base, hasAccess: false })).toBe("no_access");
  });
  it("em atraso", () => {
    expect(bookActionKind({ ...base, overdue: true })).toBe("overdue");
  });
  it("disponível e sem fila: reservar", () => {
    expect(bookActionKind(base)).toBe("reserve");
  });
  it("sem exemplar: entrar na fila", () => {
    expect(bookActionKind({ ...base, copiesAvailable: 0 })).toBe("queue");
  });
  it("já tem oferta ou está na fila", () => {
    expect(bookActionKind({ ...base, reservation: { status: "offered", position: null } })).toBe("has_offer");
    expect(bookActionKind({ ...base, reservation: { status: "queued", position: 2 } })).toBe("in_queue");
  });
  it("a reserva vale mais do que a assinatura vencida (não esconde o que o cliente já tem)", () => {
    expect(bookActionKind({ ...base, hasAccess: false, reservation: { status: "queued", position: 1 } })).toBe("in_queue");
  });
  it("está com o livro em mãos", () => {
    expect(bookActionKind({ ...base, borrowing: true, copiesAvailable: 0 })).toBe("borrowing");
  });
});

describe("reservationNotice", () => {
  it("mostra a posição na fila", () => {
    expect(reservationNotice({ status: "queued", position: 3 }).text).toContain("3º");
  });
  it("oferta", () => {
    expect(reservationNotice({ status: "offered", position: null }).title).toContain("reservado");
  });
});
