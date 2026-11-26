import { describe, expect, it } from "vitest";
import { formatCep } from "./cep";
import { formatPhoneBr, formatPhoneDisplay } from "./masks";

describe("formatPhoneBr", () => {
  it("formata celular e fixo", () => {
    expect(formatPhoneBr("21999990000")).toBe("(21) 99999-0000");
    expect(formatPhoneBr("2133334444")).toBe("(21) 3333-4444");
  });
  it("formata enquanto digita", () => {
    expect(formatPhoneBr("")).toBe("");
    expect(formatPhoneBr("2")).toBe("(2");
    expect(formatPhoneBr("21")).toBe("(21");
    expect(formatPhoneBr("219")).toBe("(21) 9");
    expect(formatPhoneBr("21999")).toBe("(21) 999");
  });
  it("aceita entrada já formatada e ignora letras", () => {
    expect(formatPhoneBr("(21) 99999-0000")).toBe("(21) 99999-0000");
    expect(formatPhoneBr("21a99999b0000")).toBe("(21) 99999-0000");
  });
  it("não mexe em número com código do país", () => {
    expect(formatPhoneBr("+55 21 99999-0000")).toBe("+55 21 99999-0000");
  });
});

describe("formatCep", () => {
  it("coloca o hífen", () => {
    expect(formatCep("22281080")).toBe("22281-080");
    expect(formatCep("22281")).toBe("22281");
    expect(formatCep("222810801234")).toBe("22281-080");
  });
});

describe("formatPhoneDisplay", () => {
  it("formata para exibir", () => {
    expect(formatPhoneDisplay("12992175687")).toBe("(12) 99217-5687");
    expect(formatPhoneDisplay("5512992175687")).toBe("+55 (12) 99217-5687");
    expect(formatPhoneDisplay("")).toBe("");
    expect(formatPhoneDisplay(null)).toBe("");
  });
});
