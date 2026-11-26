import { describe, expect, it } from "vitest";
import { formatPhoneBR, truncateAtSentence } from "./text";

describe("truncateAtSentence", () => {
  it("não corta texto curto", () => {
    expect(truncateAtSentence("Uma frase.", 100)).toEqual({ head: "Uma frase.", truncated: false });
  });
  it("corta em fim de frase", () => {
    const t = "Primeira frase longa o bastante para ocupar espaço. Segunda frase que passa do limite e continua por muito tempo ainda.";
    const r = truncateAtSentence(t, 80);
    expect(r.truncated).toBe(true);
    expect(r.head.endsWith(".")).toBe(true);
    expect(r.head).toBe("Primeira frase longa o bastante para ocupar espaço.");
  });
  it("sem fim de frase aproveitável, corta na palavra e põe reticências", () => {
    const r = truncateAtSentence("palavra ".repeat(30), 50);
    expect(r.head.endsWith("…")).toBe(true);
    expect(r.head.length).toBeLessThanOrEqual(51);
  });
});

describe("formatPhoneBR", () => {
  it("celular com DDD", () => expect(formatPhoneBR("12992175687")).toBe("(12) 99217-5687"));
  it("com 55 na frente", () => expect(formatPhoneBR("5521987654321")).toBe("(21) 98765-4321"));
  it("fixo", () => expect(formatPhoneBR("2133334444")).toBe("(21) 3333-4444"));
  it("desconhecido volta como veio", () => expect(formatPhoneBR("123")).toBe("123"));
  it("vazio", () => expect(formatPhoneBR(null)).toBe(""));
});
