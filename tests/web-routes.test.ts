import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../apps/web/app/api/ai/generate/route.js";
import { GET, POST as manage } from "../apps/web/app/api/router/route.js";
import { POST as models } from "../apps/web/app/api/ai/models/route.js";
import { POST as oldTest } from "../apps/web/app/api/ai/providers/test/route.js";
import { readJson } from "../apps/web/lib/server.js";
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://tern.test/api/ai/generate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
test("direct API bypass: browser keys and client-supplied user IDs cannot authorize inference or management", async () => {
  const body = {
    userId: "victim",
    keys: { gemini: "AIzaNotARealCredential000000000" },
    providerMode: "gemini",
    prompt: "hello",
    history: [],
  };
  assert.equal((await POST(req(body))).status, 401);
  assert.equal(
    (await manage(req({ ...body, action: "delete", id: "victim-connection" })))
      .status,
    401,
  );
  assert.equal((await GET(req(body))).status, 401);
  assert.equal(
    (await POST(req(body, { origin: "https://attacker.test" }))).status,
    403,
  );
});
test("legacy simulated credential and model endpoints cannot report success", async () => {
  assert.equal((await oldTest()).status, 410);
  assert.equal((await models(req({ key: "any-key" }))).status, 410);
});
test("malformed and oversized JSON errors never echo credentials", async () => {
  const secret = "sk-test-sensitive-value";
  await assert.rejects(
    readJson(
      new Request("https://tern.test", {
        method: "POST",
        body: `{"key":"${secret}`,
      }),
    ),
    (e) =>
      e instanceof Error &&
      !e.message.includes(secret) &&
      e.message === "Invalid JSON request.",
  );
  await assert.rejects(
    readJson(req({ data: "x".repeat(300001) })),
    /too large/,
  );
});
