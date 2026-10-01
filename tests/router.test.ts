import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { PGlite } from "@electric-sql/pglite";
import {
  RouterStore,
  rateLimit,
  type Database,
} from "../apps/web/lib/router/store.js";
import { encrypt, decrypt } from "../apps/web/lib/router/crypto.js";
import {
  authenticate,
  signIn,
  signOut,
  sameOrigin,
} from "../apps/web/lib/router/auth.js";
import { providers } from "../apps/web/lib/router/registry.js";
import {
  isPublicAddress,
  parseTarget,
  protectedFetch,
  type Transport,
} from "../apps/web/lib/router/transport.js";
import {
  discover,
  infer,
  consumeSSE,
} from "../apps/web/lib/router/adapters.js";
import {
  RoutedClient,
  checkConnection,
  tokenRedactor,
} from "../apps/web/lib/router/engine.js";
import { classify, RouteError } from "../apps/web/lib/router/errors.js";
import {
  validateHeaders,
  updateConnection,
} from "../apps/web/lib/router/management.js";
import type { Connection, Secret } from "../apps/web/lib/router/types.js";
import { Assistant } from "../src/commands/assistant.js";
import { defaults, type Config } from "../src/config/store.js";
import { ApiIndex, parseDocs } from "../src/gtps/knowledge.js";
const secret: Secret = {
  key: "test-secret-never-expose",
  authHeader: "authorization",
  authPrefix: "Bearer ",
  headers: { "x-secret": "private-header-value" },
};
function connection(provider = "openai"): Connection {
  return {
    id: "test",
    provider,
    label: "Test",
    enabled: true,
    priority: 0,
    model: "test-model",
    baseUrl:
      providers.find((p) => p.id === provider)?.baseUrl ||
      "https://compatible.example/v1",
    timeoutMs: 1000,
    models: [],
    modelsAt: null,
    health: "unknown",
    checkedAt: null,
    latencyMs: null,
    cooldownUntil: null,
    lastUsed: null,
    quota: "unknown",
    maskedCredential: "••••pose",
    hasCredential: true,
  };
}
async function fixture() {
  const pg = new PGlite();
  await pg.exec(
    await readFile(
      new URL("../migrations/001-router.sql", import.meta.url),
      "utf8",
    ),
  );
  const db: Database = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      values?: unknown[],
    ) {
      return pg.query<T>(sql, values);
    },
  };
  await db.query(
    "INSERT INTO tern_users(id,email,password_hash) VALUES('a','a@example.test','unused'),('b','b@example.test','unused')",
  );
  return { pg, db, a: new RouterStore("a", db), b: new RouterStore("b", db) };
}
async function add(store: RouterStore, provider = "openai") {
  const c = connection(provider);
  const { id, ...rest } = c;
  void id;
  return store.create(rest, secret);
}
const json = (value: unknown, status = 200) => Response.json(value, { status });
const sse = (text = "hello", protocol = "openai") =>
  new Response(
    protocol === "anthropic"
      ? `data: ${JSON.stringify({ type: "content_block_delta", delta: { text } })}\n\ndata: {"type":"message_stop"}\n\n`
      : `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 2 } })}\n\ndata: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );
const options = {
  model: "test-model",
  messages: [
    { role: "system" as const, content: "rules" },
    { role: "user" as const, content: "hello" },
  ],
  stream: false,
  signal: new AbortController().signal,
};
process.env.TERN_CREDENTIAL_KEY = "ab".repeat(32);
test("AES-GCM encrypts, authenticates, and binds secrets to both user and connection", () => {
  const cipher = encrypt(secret, "a", "1");
  assert.ok(!cipher.includes(secret.key));
  assert.deepEqual(decrypt(cipher, "a", "1"), secret);
  assert.throws(() => decrypt(cipher, "b", "1"));
  assert.throws(() => decrypt(cipher, "a", "2"));
  assert.throws(() => decrypt(cipher.slice(0, -5) + "AAAAA", "a", "1"));
});
test("SSRF rejects private, reserved, alternative IPv4, IPv6 mapped and metadata addresses", async () => {
  for (const address of [
    "127.0.0.1",
    "0.0.0.0",
    "10.1.1.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "2001:db8::1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  for (const url of [
    "http://example.com",
    "file:///etc/passwd",
    "ftp://example.com",
    "gopher://example.com",
    "https://2130706433",
    "https://0x7f000001",
    "https://0177.0.0.1",
    "https://[::ffff:7f00:1]",
    "https://metadata.google.internal",
    "https://user:pass@example.com",
    "https://example.com:8080",
  ])
    assert.throws(() => parseTarget(url), url);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  await assert.rejects(
    protectedFetch("https://127.0.0.1", { signal: AbortSignal.timeout(100) }),
  );
  assert.throws(() => validateHeaders({ Host: "metadata.google.internal" }));
  assert.throws(() => validateHeaders({ "X-Test": "ok\r\nCookie: bad" }));
});
test("PostgreSQL isolation, encrypted rows, atomic cursors, cooldown claims and limits", async () => {
  const { pg, db, a, b } = await fixture();
  try {
    const c = await add(a);
    assert.equal((await b.connections()).length, 0);
    for (const operation of [
      () => b.connection(c.id),
      () => b.secret(c.id),
      () => b.delete(c.id),
      () => b.patch(c.id, { enabled: false }),
      () =>
        b.savePool({
          id: "p",
          name: "bad",
          connections: [c.id],
          enabled: true,
          strategy: "priority",
        }),
    ])
      await assert.rejects(operation);
    assert.deepEqual(await a.secret(c.id), secret);
    const row = await db.query<{ secret: string }>(
      "SELECT secret FROM tern_connections",
    );
    assert.ok(!row.rows[0]!.secret.includes(secret.key));
    assert.ok(!JSON.stringify(await a.connections()).includes(secret.key));
    const cursors = await Promise.all(
      Array.from({ length: 8 }, () => new RouterStore("a", db).next("shared")),
    );
    assert.equal(new Set(cursors).size, 8);
    assert.deepEqual(
      await Promise.all([
        a.claimTest(c.id),
        new RouterStore("a", db).claimTest(c.id),
      ]),
      [true, false],
    );
    await rateLimit("a:limit", 1, 60000, db);
    await assert.rejects(rateLimit("a:limit", 1, 60000, db));
    await a.patch(c.id, { cooldownUntil: Date.now() + 60000 });
    await assert.rejects(
      new RoutedClient(new RouterStore("a", db)).complete({
        ...options,
        temperature: 0,
        free: false,
      }),
      /cooling down.*Retry in \d+ seconds/,
    );
    await assert.rejects(updateConnection(b, { id: c.id, enabled: false }));
  } finally {
    await pg.close();
  }
});
test("registration, hashed session, password rejection, revocation and CSRF", async () => {
  const { pg, db } = await fixture();
  try {
    const req = new Request("https://tern.test/api/auth", {
      method: "POST",
      headers: { origin: "https://tern.test" },
    });
    const response = await signIn(
      req,
      {
        action: "register",
        email: "new@example.test",
        password: "test-password-strong",
      },
      db,
    );
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    const authenticated = new Request("https://tern.test", {
      headers: { cookie: cookie.split(";")[0]! },
    });
    assert.equal(
      (await authenticate(authenticated, db)).email,
      "new@example.test",
    );
    await assert.rejects(
      signIn(
        req,
        { email: "new@example.test", password: "wrong-password-strong" },
        db,
      ),
      /Invalid email/,
    );
    await assert.rejects(
      authenticate(
        new Request("https://tern.test", { headers: { "x-user-id": "a" } }),
        db,
      ),
    );
    await signOut(authenticated, db);
    await assert.rejects(authenticate(authenticated, db));
    assert.throws(() =>
      sameOrigin(
        new Request("https://tern.test", {
          headers: { origin: "https://evil.test" },
        }),
      ),
    );
  } finally {
    await pg.close();
  }
});
for (const provider of providers.filter(
  (p) => p.adapterStatus === "implemented",
)) {
  test(`${provider.name}: auth headers, discovery, text and stream contract; 401/429/5xx`, async () => {
    const c = connection(provider.id),
      anthropic = provider.protocol === "anthropic";
    const credential = {
      ...secret,
      authHeader: anthropic ? "x-api-key" : "authorization",
      authPrefix: anthropic ? "" : "Bearer ",
    };
    const transport: Transport = async (url, init) => {
      assert.equal(
        init.headers?.[credential.authHeader],
        credential.authPrefix + credential.key,
      );
      if (url.endsWith("/key")) return json({ data: {} });
      if (url.includes("/models"))
        return json({ data: [{ id: "test-model", context_length: 32000 }] });
      const body = JSON.parse(init.body!) as Record<string, unknown>;
      assert.equal(body.model, "test-model");
      if (anthropic) {
        assert.equal(body.system, "rules");
        assert.equal(init.headers?.["anthropic-version"], "2023-06-01");
      }
      return body.stream
        ? sse("hello", anthropic ? "anthropic" : "openai")
        : json(
            anthropic
              ? {
                  content: [{ type: "text", text: "hello" }],
                  usage: { input_tokens: 4, output_tokens: 2 },
                }
              : {
                  choices: [
                    { message: { content: "hello" }, finish_reason: "stop" },
                  ],
                  usage: { prompt_tokens: 4, completion_tokens: 2 },
                },
          );
    };
    assert.equal(
      (await discover(c, credential, options.signal, transport))[0]?.id,
      "test-model",
    );
    assert.equal(
      (await infer(c, credential, options, transport)).text,
      "hello",
    );
    let output = "";
    assert.equal(
      (
        await infer(
          c,
          credential,
          {
            ...options,
            stream: true,
            onToken: (t) => {
              output += t;
            },
          },
          transport,
        )
      ).text,
      "hello",
    );
    assert.equal(output, "hello");
    for (const [status, category] of [
      [401, "auth_failure"],
      [429, "rate_limit"],
      [503, "provider_overload"],
    ] as const)
      await assert.rejects(
        infer(c, credential, options, async () =>
          json({ error: { message: secret.key } }, status),
        ),
        (e) =>
          e instanceof RouteError &&
          e.category === category &&
          !e.message.includes(secret.key),
      );
  });
}
test("OpenAI-compatible local server handles real HTTP streaming and non-streaming through injected test transport", async () => {
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(req.headers.authorization, "Bearer " + secret.key);
    if (req.url === "/v1/models") {
      res.setHeader("content-type", "application/json");
      res.end('{"data":[{"id":"local-model"}]}');
      return;
    }
    const input = JSON.parse(body) as { stream: boolean };
    if (input.stream) {
      res.setHeader("content-type", "text/event-stream");
      res.end(await sse("local server").text());
    } else {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({ choices: [{ message: { content: "local server" } }] }),
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const transport: Transport = async (url, init) =>
    fetch(`http://127.0.0.1:${address.port}${new URL(url).pathname}`, init);
  try {
    const c = {
      ...connection("openai-compatible"),
      baseUrl: "https://fixture.example/v1",
    };
    assert.equal(
      (await discover(c, secret, options.signal, transport))[0]?.id,
      "local-model",
    );
    for (const stream of [false, true])
      assert.equal(
        (await infer(c, secret, { ...options, stream }, transport)).text,
        "local server",
      );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
test("stream framing handles split UTF-8, CRLF and rejects incomplete framing", async () => {
  const bytes = new TextEncoder().encode('data: {"text":"λ"}\r\n\r\n');
  let output = "";
  await consumeSSE(
    new Response(
      new ReadableStream({
        start(c) {
          for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
          c.close();
        },
      }),
    ),
    (d) => {
      output += d;
    },
  );
  assert.equal(output, '{"text":"λ"}');
  await assert.rejects(consumeSSE(new Response("data: {"), () => {}));
});
test("secret split across tokens is redacted before emission", () => {
  let output = "";
  const redactor = tokenRedactor([secret.key], (s) => {
    output += s;
  });
  for (const char of "before " + secret.key + " after") redactor.push(char);
  redactor.flush();
  assert.equal(output, "before [redacted] after");
});
test("bounded fallback persists rate-limit cooldown and trace; partial output never switches accounts", async () => {
  const { pg, a } = await fixture();
  try {
    const first = await add(a),
      second = await add(a);
    await a.savePool({
      id: "p",
      name: "Ordered",
      connections: [first.id, second.id],
      enabled: true,
      strategy: "priority",
    });
    let calls = 0;
    const client = new RoutedClient(a, "auto", "p", async () =>
      ++calls === 1 ? json({}, 429) : sse("working"),
    );
    assert.equal(
      await client.complete({
        ...options,
        stream: true,
        temperature: 0,
        free: false,
      }),
      "working",
    );
    assert.equal(calls, 2);
    assert.equal((await a.connection(first.id)).health, "rate_limit");
    assert.ok((await a.connection(first.id)).cooldownUntil);
    assert.equal((await a.traces()).length, 2);
    await a.patch(first.id, { cooldownUntil: null, health: "unknown" });
    calls = 0;
    const interrupted = new RoutedClient(a, "auto", "p", async () => {
      calls++;
      return new Response(
        "data: " +
          JSON.stringify({
            choices: [
              { delta: { content: "partial visible text ".repeat(20) } },
            ],
          }) +
          "\n\n",
        { headers: { "content-type": "text/event-stream" } },
      );
    });
    let visible = "";
    await assert.rejects(
      interrupted.complete({
        ...options,
        stream: true,
        temperature: 0,
        free: false,
        onToken: (t) => {
          visible += t;
        },
      }),
      (e) => e instanceof RouteError && e.category === "stream_interrupted",
    );
    assert.ok(visible);
    assert.equal(calls, 1);
    calls = 0;
    await assert.rejects(
      new RoutedClient(a, "auto", "p", async () => {
        calls++;
        return json({}, 400);
      }).complete({ ...options, temperature: 0, free: false }),
    );
    assert.equal(calls, 1);
  } finally {
    await pg.close();
  }
});
test("health checks are real, persisted and throttled; timeouts and cancellation terminate inference", async () => {
  const { pg, a } = await fixture();
  try {
    const c = await add(a);
    let count = 0;
    await checkConnection(a, c.id, options.signal, async () => {
      count++;
      return json({ data: [{ id: "test-model" }] });
    });
    assert.equal((await a.connection(c.id)).health, "connected");
    await assert.rejects(
      checkConnection(a, c.id, options.signal, async () => {
        count++;
        return json({});
      }),
    );
    assert.equal(count, 1);
    const slow: Transport = async (_url, init) =>
      new Promise((_resolve, reject) => {
        if (init.signal.aborted) reject(new Error());
        else
          init.signal.addEventListener("abort", () => reject(new Error()), {
            once: true,
          });
      });
    await assert.rejects(
      new RoutedClient(a, "auto", undefined, slow).complete({
        ...options,
        signal: AbortSignal.timeout(30),
        temperature: 0,
        free: false,
      }),
      (e) => e instanceof RouteError && e.category === "cancelled",
    );
    assert.equal(classify(403).category, "permission_denied");
    assert.equal(
      classify(429, "insufficient_quota").category,
      "quota_exhausted",
    );
  } finally {
    await pg.close();
  }
});
test("GTPS retrieval, Lua validation and bounded repair remain around the new router", async () => {
  const { pg, a } = await fixture();
  try {
    await add(a);
    const index = new ApiIndex(
      parseDocs(
        await readFile(
          new URL("../docs/gtps-lua-api.md", import.meta.url),
          "utf8",
        ),
      ),
    );
    let calls = 0;
    const seen: string[] = [];
    const client = new RoutedClient(
      a,
      "auto",
      undefined,
      async (_url, init) => {
        calls++;
        seen.push(init.body || "");
        return sse(
          calls === 1
            ? "```lua\nlocal x = (\n```"
            : "```lua\nplayer:giveItem(242, 1)\n```",
        );
      },
    );
    const config = structuredClone(defaults) as Config;
    const assistant = new Assistant(
      config,
      index,
      client,
      undefined,
      "",
      () => {},
    );
    const result = await assistant.run({
      task: "generate",
      prompt: "Give the player a world lock",
      files: [],
      history: [
        { role: "user", content: "Preserve BANK_KEY" },
        { role: "assistant", content: 'local BANK_KEY = "bank"' },
      ],
    });
    assert.equal(result.validation?.syntaxValid, true);
    assert.equal(result.code, "player:giveItem(242, 1)");
    assert.equal(calls, 2);
    assert.ok(seen[0]?.includes("BANK_KEY"));
    assert.ok(seen[0]?.includes("GTPS"));
    assert.equal((await a.traces()).length, 2);
  } finally {
    await pg.close();
  }
});
