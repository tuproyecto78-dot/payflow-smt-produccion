import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeConfig } from "./config.js";
import { PayFlowClient } from "./payflow.js";
import { sha256Signature } from "./security.js";

const config = {
  PAYFLOW_BASE_URL: "https://payflow.example",
  VOICE_RUNTIME_WEBHOOK_SECRET: "s".repeat(40),
} as RuntimeConfig;

test("resuelve el negocio por la ruta telefónica y nunca acepta clientId", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "https://payflow.example/api/voice/runtime/context");
    assert.equal(init?.method, "POST");
    const body = String(init?.body || "");
    const parsed = JSON.parse(body) as Record<string, unknown>;
    assert.deepEqual(parsed, {
      provider: "twilio",
      providerPhoneId: "PN123",
      businessPhone: "+13137892778",
    });
    assert.equal("clientId" in parsed, false);
    assert.equal(
      new Headers(init?.headers).get("x-payflow-signature"),
      sha256Signature(body, config.VOICE_RUNTIME_WEBHOOK_SECRET),
    );
    return new Response(JSON.stringify({ clientId: "tenant-resuelto-en-payflow" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const response = await new PayFlowClient(config).getContext({
    providerPhoneId: "PN123",
    businessPhone: "+13137892778",
  });
  assert.equal(response.clientId, "tenant-resuelto-en-payflow");
});
