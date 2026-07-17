import assert from "node:assert/strict";
import test from "node:test";
import { createRoutingToken, sha256Signature, verifyRoutingToken } from "./security.js";

const secret = "a".repeat(40);

test("firma cuerpos PayFlow con sha256", () => {
  assert.match(sha256Signature('{"ok":true}', secret), /^sha256=[a-f0-9]{64}$/);
});

test("el token de enrutamiento conserva la ruta y expira", () => {
  const now = Date.now();
  const token = createRoutingToken({
    providerPhoneId: "PN123",
    businessPhone: "+13137892778",
    callerPhone: "+593999999999",
    issuedAt: now,
    expiresAt: now + 60_000,
    nonce: "test-nonce",
  }, secret);
  assert.equal(verifyRoutingToken(token, secret, now).providerPhoneId, "PN123");
  assert.throws(() => verifyRoutingToken(token, secret, now + 120_000), /EXPIRED_ROUTING_TOKEN/);
});

test("rechaza tokens manipulados", () => {
  const token = createRoutingToken({
    providerPhoneId: "",
    businessPhone: "+13137892778",
    callerPhone: "",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    nonce: "test-nonce",
  }, secret);
  assert.throws(() => verifyRoutingToken(`${token}x`, secret), /INVALID_ROUTING_TOKEN/);
});
