import assert from "node:assert/strict";
import test from "node:test";

import { AIProviderError, completeWithGroqFallback } from "../src/lib/ai/provider-client.ts";

const originalEnv = {
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_BASE_URL: process.env.GROQ_BASE_URL,
  GROQ_MODEL: process.env.GROQ_MODEL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
};

test.beforeEach(() => {
  process.env.GROQ_API_KEY = "groq-test-secret";
  process.env.GROQ_BASE_URL = "https://groq.test/openai/v1";
  process.env.GROQ_MODEL = "groq-test-model";
  process.env.GEMINI_API_KEY = "gemini-test-secret";
  process.env.GEMINI_MODEL = "gemini-test-model";
});

test.after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function validJson(content) {
  JSON.parse(content);
}

function responseFor(provider, content) {
  return provider === "groq"
    ? Response.json({ choices: [{ message: { content } }] })
    : Response.json({ candidates: [{ content: { parts: [{ text: content }] } }] });
}

async function complete(fetchImpl) {
  return completeWithGroqFallback({
    systemPrompt: "Return JSON",
    messages: [{ role: "user", content: "hello" }],
    temperature: 0,
    maxOutputTokens: 100,
    validateContent: validJson,
    fetchImpl,
  }, {
    primary: {
      provider: "groq",
      apiKey: process.env.GROQ_API_KEY,
      endpoint: `${process.env.GROQ_BASE_URL}/chat/completions`,
      model: process.env.GROQ_MODEL,
    },
    fallback: {
      provider: "gemini",
      apiKey: process.env.GEMINI_API_KEY,
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL}:generateContent`,
      model: process.env.GEMINI_MODEL,
    },
  });
}

async function completeOrLocal(fetchImpl) {
  try {
    return await complete(fetchImpl);
  } catch (error) {
    return {
      provider: "local",
      reason: error instanceof AIProviderError ? error.reason : "unknown_error",
    };
  }
}

test("Groq remains primary when it succeeds", async () => {
  const calls = [];
  const result = await complete(async (url, init) => {
    calls.push({ url: String(url), init });
    return responseFor("groq", '{"reply":"groq"}');
  });
  assert.equal(result.provider, "groq");
  assert.equal(result.fallbackUsed, false);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /groq\.test/);
});

for (const [label, groqResponse, expectedReason] of [
  ["429", () => new Response("", { status: 429 }), "rate_limit"],
  ["5xx", () => new Response("", { status: 503 }), "server_error"],
  ["empty response", () => responseFor("groq", ""), "empty_response"],
  ["invalid JSON", () => responseFor("groq", "not-json"), "invalid_json"],
]) {
  test(`Gemini is used after Groq ${label}`, async () => {
    const calls = [];
    const result = await complete(async (url, init) => {
      calls.push({ url: String(url), init });
      return calls.length === 1 ? groqResponse() : responseFor("gemini", '{"reply":"gemini"}');
    });
    assert.equal(result.provider, "gemini");
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.fallbackReason, expectedReason);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /groq\.test/);
    assert.match(calls[1].url, /generativelanguage\.googleapis\.com/);
  });
}

test("Gemini is used after a Groq timeout", async () => {
  let calls = 0;
  const result = await complete(async () => {
    calls += 1;
    if (calls === 1) throw new DOMException("timed out", "AbortError");
    return responseFor("gemini", '{"reply":"gemini"}');
  });
  assert.equal(result.provider, "gemini");
  assert.equal(result.fallbackReason, "timeout");
  assert.equal(calls, 2);
});

for (const status of [400, 401, 403, 404]) {
  test(`Gemini is not used after Groq HTTP ${status}`, async () => {
    let calls = 0;
    await assert.rejects(() => complete(async () => {
      calls += 1;
      return new Response("", { status });
    }));
    assert.equal(calls, 1);
  });
}

test("ordinary network errors do not activate Gemini", async () => {
  let calls = 0;
  await assert.rejects(() => complete(async () => {
    calls += 1;
    throw new TypeError("connection reset");
  }));
  assert.equal(calls, 1);
});


for (const status of [401, 403]) {
  test(`Groq HTTP ${status} returns a credential error and local fallback`, async () => {
    let calls = 0;
    const result = await completeOrLocal(async () => {
      calls += 1;
      return new Response("", { status });
    });
    assert.deepEqual(result, { provider: "local", reason: "credential_error" });
    assert.equal(calls, 1);
  });
}

test("an unclassified Groq network error uses local fallback", async () => {
  let calls = 0;
  const result = await completeOrLocal(async () => {
    calls += 1;
    throw new TypeError("connection reset");
  });
  assert.deepEqual(result, { provider: "local", reason: "network_error" });
  assert.equal(calls, 1);
});

test("a Gemini failure after an eligible Groq failure uses local fallback", async () => {
  let calls = 0;
  const result = await completeOrLocal(async () => {
    calls += 1;
    return new Response("", { status: calls === 1 ? 429 : 503 });
  });
  assert.deepEqual(result, { provider: "local", reason: "server_error" });
  assert.equal(calls, 2);
});
test("secrets are sent only in headers and are absent from results and URLs", async () => {
  const calls = [];
  const result = await complete(async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1 ? new Response("", { status: 429 }) : responseFor("gemini", '{"reply":"ok"}');
  });
  assert.ok(calls.every((call) => !call.url.includes("test-secret")));
  assert.doesNotMatch(JSON.stringify(result), /groq-test-secret|gemini-test-secret/);
  assert.equal(calls[0].init.headers.Authorization, "Bearer groq-test-secret");
  assert.equal(calls[1].init.headers["x-goog-api-key"], "gemini-test-secret");
});
