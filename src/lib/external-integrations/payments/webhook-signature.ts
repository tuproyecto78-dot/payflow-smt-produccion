import { createHmac, timingSafeEqual } from "node:crypto";

export function signExternalPaymentWebhook(
  rawBody: string,
  secret: string
): string {
  return `sha256=${createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;
}

export function verifyExternalPaymentWebhookSignature(input: {
  rawBody: string;
  receivedSignature: string | null;
  secret: string;
}): boolean {
  if (!input.receivedSignature || input.secret.length < 32) return false;
  const expected = signExternalPaymentWebhook(
    input.rawBody,
    input.secret
  ).slice(7);
  const received = input.receivedSignature.startsWith("sha256=")
    ? input.receivedSignature.slice(7)
    : input.receivedSignature;
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
