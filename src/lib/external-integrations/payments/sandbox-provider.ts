import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export interface SandboxCheckout {
  providerReference: string;
  paymentLink: string;
  checkoutTokenHash: string;
}

export function hashSandboxCheckoutToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifySandboxCheckoutToken(
  token: string,
  expectedHash: string
): boolean {
  if (!token || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hashSandboxCheckoutToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}

export function createSandboxCheckout(input: {
  requestId: string;
  publicBaseUrl: string;
}): SandboxCheckout {
  const checkoutToken = randomBytes(32).toString("hex");
  const paymentLink = new URL(
    `/api/integrations/payments/sandbox/checkout/${encodeURIComponent(
      input.requestId
    )}`,
    input.publicBaseUrl
  );
  paymentLink.searchParams.set("token", checkoutToken);
  return {
    providerReference: `sandbox_${randomUUID()}`,
    paymentLink: paymentLink.toString(),
    checkoutTokenHash: hashSandboxCheckoutToken(checkoutToken),
  };
}
