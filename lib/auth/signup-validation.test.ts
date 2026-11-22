import { describe, expect, it } from "vitest";
import { formatCep, normalizeCep } from "./cep";
import { readSignupForm, signupErrorMessage, validateSignup } from "./signup-validation";

function form(o: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
}
const ok = {
  full_name: "Ana Silva", cep: "22250-040", street: "Rua A", number: "10",
  consent_privacy_policy: "on", consent_service_rules: "on",
};

describe("cep", () => {
  it("normaliza e formata", () => {
    expect(normalizeCep("22250-040")).toBe("22250040");
    expect(normalizeCep("2225")).toBeNull();
    expect(formatCep("22250040")).toBe("22250-040");
  });
});

describe("validateSignup", () => {
  it("aceita formulário válido (whatsapp opcional)", () => {
    const { fields, consents } = readSignupForm(form(ok));
    expect(validateSignup(fields, consents)).toEqual({});
  });
  it("exige consentimentos obrigatórios, mas não o de marketing", () => {
    const { fields, consents } = readSignupForm(form({ ...ok, consent_service_rules: "" }));
    expect(validateSignup(fields, consents).consents).toBeTruthy();
  });
  it("rejeita CEP e WhatsApp inválidos", () => {
    const { fields, consents } = readSignupForm(form({ ...ok, cep: "123", whatsapp: "99" }));
    const e = validateSignup(fields, consents);
    expect(e.cep).toBeTruthy();
    expect(e.whatsapp).toBeTruthy();
  });
});

describe("signupErrorMessage", () => {
  it("traduz fora da área", () => {
    const r = signupErrorMessage("signup:out_of_area");
    expect(r.field).toBe("cep");
    expect(r.message).toMatch(/Ainda não entregamos/);
  });
  it("erro desconhecido não vaza detalhe", () => {
    expect(signupErrorMessage("boom: relation x").code).toBe("unknown");
  });
});
