import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { POST } from "../apps/web/app/api/ai/generate/route.js";
import { POST as models } from "../apps/web/app/api/ai/models/route.js";
import { POST as connection } from "../apps/web/app/api/ai/test/route.js";
import { readJson } from "../apps/web/lib/server.js";
process.chdir(resolve("apps/web"));
const key = "AIzaSyMockCredential0123456789ABCDEF";
const routerKey = "sk-or-v1-MockCredential0123456789ABCDEF";
const base = {
  providerMode: "auto",
  keys: { gemini: key, openrouter: routerKey },
  models: { gemini: "test-flash", openrouter: "openrouter/free" },
  prompt: "Create daily.lua",
  history: [],
  files: [],
  task: "generate",
};
const req = (body: unknown, signal?: AbortSignal) =>
  new Request("https://tern.test/api/ai/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
const events = async (response: Response) =>
  (await response.text())
    .split("\n\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
const lua = "```lua\nplayer:giveItem(242, 1)\n```";
const gemini = (text: string) =>
  new Response(
    "data: " +
      JSON.stringify({
        candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
      }) +
      "\n\n",
    { headers: { "content-type": "text/event-stream" } },
  );
test("BYOK route shares real adapters, retrieval, fallback, stream reset, context and validation", async (t) => {
  const seen: Array<Record<string, unknown>> = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("generativelanguage")) {
        assert.equal(new Headers(init?.headers).get("x-goog-api-key"), key);
        // A truncated SDK stream first emits visible text, then fails completion.
        return new Response(
          "data: " +
            JSON.stringify({
              candidates: [
                {
                  content: { parts: [{ text: "failed partial ".repeat(100) }] },
                },
              ],
            }) +
            "\n\n",
          { headers: { "content-type": "text/event-stream" } },
        );
      }
      assert.ok(String(url).startsWith("https://openrouter.ai/"));
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Bearer ${routerKey}`,
      );
      seen.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        "data: " +
          JSON.stringify({
            choices: [{ delta: { content: lua }, finish_reason: "stop" }],
          }) +
          "\n\ndata: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  );
  const output = await events(
    await POST(
      req({
        ...base,
        history: [
          { role: "user", content: "Keep BANK_KEY" },
          { role: "assistant", content: 'local BANK_KEY = "bank"' },
        ],
        files: [{ name: "bank.lua", content: "local bank = 1" }],
      }),
    ),
  );
  assert.ok(
    output.some((e) => e.type === "reset"),
    JSON.stringify(output),
  );
  const result = output.find((e) => e.type === "result")!;
  assert.equal(result.provider, "openrouter");
  assert.equal(result.filename, "daily.lua");
  assert.equal(result.code, "player:giveItem(242, 1)");
  assert.equal(
    (result.validation as { syntaxValid: boolean }).syntaxValid,
    true,
  );
  assert.equal(seen[0]!.model, "openrouter/free");
  assert.deepEqual(seen[0]!.provider, {
    max_price: { prompt: 0, completion: 0, request: 0, image: 0 },
  });
  const context = JSON.stringify(seen[0]!.messages);
  assert.match(context, /Authoritative GTPS API/);
  assert.match(context, /BANK_KEY/);
  assert.match(context, /bank.lua/);
  assert.ok(!JSON.stringify(output).includes(key));
  assert.ok(!JSON.stringify(output).includes(routerKey));
  assert.equal((await POST(req({ ...base, keys: {} }))).status, 401);
});
test("bounded repair resets drafts and refuses invalid final artifacts", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return gemini("```lua\nplayer:inventedApi(1)\n```");
  });
  const output = await events(
    await POST(req({ ...base, providerMode: "gemini" })),
  );
  assert.equal(count, 3, JSON.stringify(output));
  assert.equal(output.filter((e) => e.type === "reset").length, 2);
  assert.ok(output.some((e) => e.type === "error"));
  assert.ok(!output.some((e) => e.type === "result"));
});
test("server rejects paid automatic fallback, excessive attachments and aborted requests", async (t) => {
  assert.equal(
    (
      await POST(
        req({
          ...base,
          models: { openrouter: "vendor/paid", gemini: "test-flash" },
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await POST(
        req({
          ...base,
          files: [{ name: "bank.lua", content: "a".repeat(16385) }],
        }),
      )
    ).status,
    400,
  );
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return gemini(lua);
  });
  const abort = new AbortController();
  abort.abort();
  const output = await events(await POST(req(base, abort.signal)));
  assert.equal(calls, 0);
  assert.ok(output.some((e) => e.type === "stopped"));
});
test("model listing and connection routes call official endpoints with request keys", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.ok(
        String(url).startsWith("https://generativelanguage.googleapis.com/"),
      );
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), key);
      return Response.json(
        String(url).includes("test-flash")
          ? { name: "models/test-flash" }
          : {
              models: [
                {
                  name: "models/test-flash",
                  displayName: "Test Flash",
                  supportedActions: ["generateContent"],
                },
              ],
            },
      );
    },
  );
  const response = await models(req({ provider: "gemini", key }));
  const body = await response.text();
  assert.equal(response.status, 200, body);
  assert.match(body, /test-flash/);
  assert.equal(
    (await connection(req({ provider: "gemini", key, model: "test-flash" })))
      .status,
    200,
  );
});
test("malformed request errors cannot echo credentials from JSON parser diagnostics", async () => {
  await assert.rejects(
    () =>
      readJson(
        new Request("https://tern.test", {
          method: "POST",
          body: `{"key":"${key}" broken`,
        }),
      ),
    (error) => error instanceof Error && !error.message.includes(key),
  );
});

test("request credentials never become server defaults or leak through SDK errors/logs", async (t) => {
  const old = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = key;
  t.after(() => {
    if (old === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = old;
  });
  const logs: string[] = [];
  t.mock.method(console, "log", (...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  t.mock.method(console, "error", (...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  t.mock.method(console, "warn", (...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: { code: 401, message: `Invalid API key ${key}` } },
      { status: 401 },
    ),
  );
  assert.equal((await POST(req({ ...base, keys: {} }))).status, 401);
  const output = await events(
    await POST(req({ ...base, providerMode: "gemini" })),
  );
  assert.ok(output.some((e) => e.type === "error" && e.code === "auth"));
  assert.ok(!JSON.stringify(output).includes(key));
  assert.ok(!logs.join("\n").includes(key));
});

test("openrouter providerMode ignores invalid or missing Gemini key", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (url: RequestInfo | URL) => {
      assert.ok(String(url).startsWith("https://openrouter.ai/"));
      return new Response(
        "data: " +
          JSON.stringify({
            choices: [{ delta: { content: lua }, finish_reason: "stop" }],
          }) +
          "\n\ndata: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  );
  const output = await events(
    await POST(
      req({
        ...base,
        providerMode: "openrouter",
        keys: { gemini: "invalid-short-key", openrouter: routerKey },
      }),
    ),
  );
  const result = output.find((e) => e.type === "result");
  assert.ok(result, JSON.stringify(output));
  assert.equal(result.provider, "openrouter");
});

test("modern Gemini key starting with AQ. is accepted by models and connection endpoints", async (t) => {
  const aqKey = "AQ.Ab8ModernGeminiKey0123456789ABCDEF12345";
  t.mock.method(
    globalThis,
    "fetch",
    async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.ok(
        String(url).startsWith("https://generativelanguage.googleapis.com/"),
      );
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), aqKey);
      return Response.json(
        String(url).includes("test-flash")
          ? { name: "models/test-flash" }
          : {
              models: [
                {
                  name: "models/test-flash",
                  displayName: "Test Flash",
                  supportedActions: ["generateContent"],
                },
              ],
            },
      );
    },
  );
  const response = await models(req({ provider: "gemini", key: `  ${aqKey}  ` }));
  const body = await response.text();
  assert.equal(response.status, 200, body);
  assert.match(body, /test-flash/);
  assert.equal(
    (await connection(req({ provider: "gemini", key: aqKey, model: "test-flash" })))
      .status,
    200,
  );
});

