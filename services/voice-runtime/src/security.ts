import { createHmac, timingSafeEqual } from "node:crypto";

export interface RoutingClaims {
  providerPhoneId: string;
  businessPhone: string;
  callerPhone: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

export function sha256Signature(rawBody: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createRoutingToken(claims: RoutingClaims, secret: string) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyRoutingToken(token: string, secret: string, now = Date.now()): RoutingClaims {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) throw new Error("INVALID_ROUTING_TOKEN");
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) throw new Error("INVALID_ROUTING_TOKEN");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RoutingClaims;
  if (!claims.nonce || !claims.businessPhone || claims.expiresAt < now) throw new Error("EXPIRED_ROUTING_TOKEN");
  return claims;
}
