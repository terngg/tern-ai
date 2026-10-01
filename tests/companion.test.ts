import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { getLocalAdapters } from "../src/companion/registry.js";
import { detectAllLocalProviders } from "../src/companion/detector.js";
import { CompanionRelay } from "../apps/web/lib/router/companion-relay.js";
import { RouterStore, type Database } from "../apps/web/lib/router/store.js";
import { RoutedClient, eligible, checkConnection, unavailableReason } from "../apps/web/lib/router/engine.js";
import type { DetectedLocalProvider } from "../apps/web/lib/router/types.js";

process.env.TERN_CREDENTIAL_KEY = "ab".repeat(32);

const antigravity: DetectedLocalProvider = {
  id: "antigravity", name: "Antigravity", installed: true, authenticated: true,
  models: [{ id: "test-flash", name: "Test Flash", source: "discovered" }],
  health: { ok: true },
};

test("heartbeat repairs missing defaults and expired cooldowns without bypassing active restrictions", async () => {
  const { pg, db } = await pgFixture();
  try {
    const relay = new CompanionRelay(db);
    const { code } = await relay.generatePairCode("user-1");
    const { companionId } = await relay.redeemPairCode(code, "linux", "test");
    await relay.syncHeartbeat(companionId, "linux", "test", [{ ...antigravity, models: [] }]);
    const store = new RouterStore("user-1", db);
    const [initial] = await store.connections();
    assert.equal(eligible(initial!), false);
    await store.patch(initial!.id, { health: "timeout", timeoutMs: 60_000, cooldownUntil: Date.now() - 1 });
    await relay.syncHeartbeat(companionId, "linux", "test", [antigravity]);
    const ready = await store.connection(initial!.id);
    assert.equal(ready.model, "test-flash");
    assert.equal(ready.timeoutMs, 90_000);
    assert.equal(ready.cooldownUntil, null);
    assert.equal(eligible(ready), true);

    for (const health of ["timeout", "rate_limit", "provider_overload"] as const) {
      const cooldownUntil = Date.now() + 30_000;
      await store.patch(ready.id, { health, cooldownUntil, model: "custom-choice", timeoutMs: 45_000 });
      await relay.syncHeartbeat(companionId, "linux", "test", [antigravity]);
      const cooling = await store.connection(ready.id);
      assert.equal(cooling.health, health);
      assert.equal(cooling.cooldownUntil, cooldownUntil);
      assert.equal(cooling.model, "custom-choice");
      assert.equal(cooling.timeoutMs, 45_000);
      assert.equal(eligible(cooling), false);
      assert.match(unavailableReason([cooling]), /cooling down.*Retry in \d+ seconds/);
    }
    await store.patch(ready.id, { health: "quota_exhausted", quota: "exhausted", cooldownUntil: null });
    await relay.syncHeartbeat(companionId, "linux", "test", [antigravity]);
    const exhausted = await checkConnection(store, ready.id, new AbortController().signal);
    assert.equal(exhausted.quota, "exhausted");
    assert.equal(exhausted.health, "quota_exhausted");
    assert.equal(eligible(exhausted), false);
    assert.deepEqual(await new RouterStore("other-user", db).connections(), []);
  } finally { await pg.close(); }
});

test("companion health check rejects failed local health and does not claim an auth failure", async () => {
  const { pg, db } = await pgFixture();
  try {
    const relay = new CompanionRelay(db);
    const { code } = await relay.generatePairCode("user-1");
    const { companionId } = await relay.redeemPairCode(code, "linux", "test");
    await relay.syncHeartbeat(companionId, "linux", "test", [{ ...antigravity, health: { ok: false } }]);
    const store = new RouterStore("user-1", db);
    const [connection] = await store.connections();
    await assert.rejects(checkConnection(store, connection!.id, new AbortController().signal), /could not be reached/);
    assert.equal((await store.connection(connection!.id)).health, "network");
  } finally { await pg.close(); }
});

test("companion relay waits past the former 60-second cutoff", async (t) => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now });
  let polls = 0;
  const db: Database = {
    async query<T extends Record<string, unknown>>(sql: string) {
      if (sql.includes("FROM tern_companions"))
        return { rows: [{ id: "test-companion", last_heartbeat: now }] as unknown as T[] };
      if (sql.includes("SELECT status, chunks")) {
        polls++;
        if (polls === 1) t.mock.timers.tick(65_000);
        return { rows: [{ status: polls === 1 ? "running" : "completed", chunks: polls === 1 ? [] : ["slow result"], error: null }] as unknown as T[] };
      }
      return { rows: [] };
    },
  };
  const result = await new CompanionRelay(db).dispatchAndStreamJob("user-1", "antigravity", "test-flash", [{ role: "user", content: "test" }]);
  assert.equal(result.text, "slow result");
  assert.equal(polls, 2);
});

async function pgFixture() {
  const pg = new PGlite();
  await pg.exec(
    await readFile(new URL("../migrations/001-router.sql", import.meta.url), "utf8"),
  );
  await pg.exec(
    await readFile(new URL("../migrations/002-companion.sql", import.meta.url), "utf8"),
  );
  const db: Database = {
    async query<T extends Record<string, unknown>>(sql: string, values?: unknown[]) {
      const res = await pg.query(sql, values);
      return { rows: res.rows as T[] };
    },
  };
  await db.query(
    "INSERT INTO tern_users(id, email, password_hash) VALUES('user-1', 'test@user.test', 'hash')",
  );
  return { pg, db };
}

test("local companion registry contains all 11 adapters with correct interface", async () => {
  const adapters = getLocalAdapters();
  assert.equal(adapters.length, 11);
  const ids = adapters.map((a) => a.id);
  assert.ok(ids.includes("ollama"));
  assert.ok(ids.includes("codex"));
  assert.ok(ids.includes("kiro"));
  assert.ok(ids.includes("claude-code"));
  assert.ok(ids.includes("gemini-cli"));
  assert.ok(ids.includes("qwen-code"));
  assert.ok(ids.includes("antigravity"));
  assert.ok(ids.includes("cline"));
  assert.ok(ids.includes("kilo-code"));
  assert.ok(ids.includes("cursor"));
  assert.ok(ids.includes("copilot"));

  for (const a of adapters) {
    assert.equal(typeof a.id, "string");
    assert.equal(typeof a.name, "string");
    assert.equal(typeof a.detect, "function");
    assert.equal(typeof a.authStatus, "function");
    assert.equal(typeof a.listModels, "function");
    assert.equal(typeof a.health, "function");
    assert.equal(typeof a.chat, "function");
    assert.equal(typeof a.cancel, "function");
  }
});

test("detector probes all local providers without throwing", async () => {
  const detected = await detectAllLocalProviders();
  assert.equal(detected.length, 11);
  for (const d of detected) {
    assert.equal(typeof d.id, "string");
    assert.equal(typeof d.name, "string");
    assert.equal(typeof d.installed, "boolean");
    assert.equal(typeof d.authenticated, "boolean");
    assert.ok(Array.isArray(d.models));
    assert.equal(typeof d.health.ok, "boolean");
  }
});

test("companion pairing flow: code generation, redemption, and single-session binding", async () => {
  const { pg, db } = await pgFixture();
  try {
    const relay = new CompanionRelay(db);
    const { code, expiresAt } = await relay.generatePairCode("user-1");
    assert.match(code, /^PAIR-[0-9A-F]{4}-[0-9A-F]{4}$/);
    assert.ok(expiresAt > Date.now());

    // Redeem code
    const paired = await relay.redeemPairCode(code, "linux", "test-workstation");
    assert.equal(paired.userId, "user-1");
    assert.ok(paired.companionId.startsWith("comp_"));
    assert.ok(paired.token.startsWith("tc_"));

    // Code is single-use: second attempt fails
    await assert.rejects(
      relay.redeemPairCode(code, "linux", "test-workstation"),
      /Invalid or expired/,
    );

    // Verify authentication with companion token
    const auth = await relay.authenticateCompanion(paired.companionId, paired.token);
    assert.equal(auth.userId, "user-1");

    // Invalid token rejected
    await assert.rejects(
      relay.authenticateCompanion(paired.companionId, "invalid-token"),
      /Unauthorized/,
    );
  } finally {
    await pg.close();
  }
});

test("companion heartbeat syncs local healthy providers into user connections", async () => {
  const { pg, db } = await pgFixture();
  try {
    const relay = new CompanionRelay(db);
    const { code } = await relay.generatePairCode("user-1");
    const paired = await relay.redeemPairCode(code, "linux", "dev-box");

    // Send heartbeat with detected Codex and Ollama
    await relay.syncHeartbeat(paired.companionId, "linux", "dev-box", [
      {
        id: "codex",
        name: "Codex CLI",
        installed: true,
        version: "0.159.3",
        authenticated: true,
        models: [
          { id: "o3-mini", name: "o3-mini", source: "discovered" },
          { id: "gpt-4o", name: "gpt-4o", source: "discovered" },
        ],
        health: { ok: true, latencyMs: 25 },
      },
      {
        id: "kiro",
        name: "Kiro",
        installed: false,
        authenticated: false,
        models: [],
        health: { ok: false, error: "Not installed" },
      },
    ]);

    // Check store connections: Codex should be auto-registered as a connected connection
    const store = new RouterStore("user-1", db);
    const connections = await store.connections();
    assert.equal(connections.length, 1);
    assert.equal(connections[0]!.provider, "codex");
    assert.equal(connections[0]!.health, "connected");
    assert.equal(connections[0]!.model, "o3-mini");
    assert.equal(connections[0]!.baseUrl, "companion://codex");
    assert.equal(connections[0]!.latencyMs, 25);
  } finally {
    await pg.close();
  }
});

test("companion relay dispatches job, streams chunks, and completes prompt", async () => {
  const { pg, db } = await pgFixture();
  try {
    const relay = new CompanionRelay(db);
    const { code } = await relay.generatePairCode("user-1");
    const paired = await relay.redeemPairCode(code, "linux", "dev-box");

    // Set heartbeat so companion is online
    await relay.syncHeartbeat(paired.companionId, "linux", "dev-box", [
      {
        id: "codex",
        name: "Codex CLI",
        installed: true,
        authenticated: true,
        models: [{ id: "o3-mini", name: "o3-mini", source: "discovered" }],
        health: { ok: true, latencyMs: 15 },
      },
    ]);

    // Background runner simulating companion execution
    const runner = async () => {
      // Poll jobs
      let jobs: Array<{ id: string }> = [];
      for (let i = 0; i < 20; i++) {
        jobs = await relay.pollPendingJobs(paired.companionId);
        if (jobs.length > 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(jobs.length, 1);
      const jobId = jobs[0]!.id;

      // Send tokens
      await relay.appendJobEvent(paired.companionId, jobId, {
        type: "token",
        token: "Hello ",
      });
      await relay.appendJobEvent(paired.companionId, jobId, {
        type: "token",
        token: "from local Codex!",
      });
      await relay.appendJobEvent(paired.companionId, jobId, { type: "done" });
    };

    let streamedTokens = "";
    const [result] = await Promise.all([
      relay.dispatchAndStreamJob(
        "user-1",
        "codex",
        "o3-mini",
        [{ role: "user", content: "Write hello" }],
        undefined,
        undefined,
        (token) => {
          streamedTokens += token;
        },
      ),
      runner(),
    ]);

    assert.equal(result.text, "Hello from local Codex!");
    assert.equal(streamedTokens, "Hello from local Codex!");
  } finally {
    await pg.close();
  }
});

test("shared router routes seamlessly to companion connection and records trace", async () => {
  const { pg, db } = await pgFixture();
  try {
    const relay = new CompanionRelay(db);
    const { code } = await relay.generatePairCode("user-1");
    const paired = await relay.redeemPairCode(code, "linux", "dev-box");

    await relay.syncHeartbeat(paired.companionId, "linux", "dev-box", [
      {
        id: "codex",
        name: "Codex CLI",
        installed: true,
        authenticated: true,
        models: [{ id: "o3-mini", name: "o3-mini", source: "discovered" }],
        health: { ok: true, latencyMs: 10 },
      },
    ]);

    const store = new RouterStore("user-1", db);
    const connections = await store.connections();
    assert.equal(connections.length, 1);

    // Companion worker in background
    const runner = async () => {
      let jobs: Array<{ id: string }> = [];
      for (let i = 0; i < 20; i++) {
        jobs = await relay.pollPendingJobs(paired.companionId);
        if (jobs.length > 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      if (jobs.length > 0) {
        const jobId = jobs[0]!.id;
        await relay.appendJobEvent(paired.companionId, jobId, {
          type: "token",
          token: "print('Lua code from local Codex')",
        });
        await relay.appendJobEvent(paired.companionId, jobId, { type: "done" });
      }
    };

    const client = new RoutedClient(store, "auto");
    let tokens = "";
    const [response] = await Promise.all([
      client.complete({
        model: "auto",
        temperature: 0.7,
        free: false,
        messages: [{ role: "user", content: "generate code" }],
        onToken: (t) => {
          tokens += t;
        },
        stream: true,
      }),
      runner(),
    ]);

    assert.equal(response, "print('Lua code from local Codex')");
    assert.equal(tokens, "print('Lua code from local Codex')");

    // Check trace was recorded
    const traces = await store.traces();
    assert.equal(traces.length, 1);
    assert.equal(traces[0]!.provider, "codex");
    assert.equal(traces[0]!.status, "ok");

    // An explicit discovered model remains routable without a saved default.
    await store.patch(connections[0]!.id, { model: "" });
    const explicit = new RoutedClient(store, `${connections[0]!.id}::o3-mini`);
    const [selected] = await Promise.all([
      explicit.complete({ model: "o3-mini", temperature: 0, free: false,
        messages: [{ role: "user", content: "generate code" }], stream: false }),
      runner(),
    ]);
    assert.equal(selected, "print('Lua code from local Codex')");
  } finally {
    await pg.close();
  }
});
