// Rodar: node --test supabase/functions/pagarme-webhook/hmac.test.ts  (Node >= 22.6 com strip-types; ou `deno test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSignature, timingSafeEqualStr, verifyPagarmeSignature } from "./hmac.ts";

const secret = "segredo-de-teste";
const body = '{"id":"hook_1","type":"charge.paid","data":{"id":"ch_1"}}';

test("assinatura sha1 válida", async () => {
  const sig = await computeSignature(body, secret, "sha1");
  assert.equal(await verifyPagarmeSignature(body, `sha1=${sig}`, secret), true);
});
test("vetor conhecido HMAC-SHA1 (RFC 2202 #2)", async () => {
  assert.equal(
    await computeSignature("what do ya want for nothing?", "Jefe", "sha1"),
    "effcdf6ae5eb2fa2d27416d5f184df9c259a7c79",
  );
});
test("sha256 válida e hex maiúsculo", async () => {
  const sig = await computeSignature(body, secret, "sha256");
  assert.equal(await verifyPagarmeSignature(body, `sha256=${sig.toUpperCase()}`, secret), true);
});
test("corpo adulterado é rejeitado", async () => {
  const sig = await computeSignature(body, secret);
  assert.equal(await verifyPagarmeSignature(body + " ", `sha1=${sig}`, secret), false);
});
test("segredo errado, header ausente/malformado, segredo vazio", async () => {
  const sig = await computeSignature(body, secret);
  assert.equal(await verifyPagarmeSignature(body, `sha1=${sig}`, "outro"), false);
  assert.equal(await verifyPagarmeSignature(body, null, secret), false);
  assert.equal(await verifyPagarmeSignature(body, sig, secret), false);
  assert.equal(await verifyPagarmeSignature(body, "md5=abc", secret), false);
  assert.equal(await verifyPagarmeSignature(body, `sha1=${sig}`, ""), false);
  assert.equal(await verifyPagarmeSignature(body, "sha1=", secret), false);
});
test("timingSafeEqualStr", () => {
  assert.equal(timingSafeEqualStr("abc", "abc"), true);
  assert.equal(timingSafeEqualStr("abc", "abd"), false);
  assert.equal(timingSafeEqualStr("abc", "abcd"), false);
});
