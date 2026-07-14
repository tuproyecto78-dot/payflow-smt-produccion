import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySha256Signature(rawBody: string, received: string | null, secret: string): boolean {
  if (!received || !secret) return false;
  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const normalized = received.startsWith("sha256=") ? received.slice(7) : received;
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(normalized, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifySharedSecret(received: string | null, secret: string): boolean {
  if (!received || !secret) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(received);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
