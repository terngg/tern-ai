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
import { parseAntigravityModels } from "../src/companion/adapters/antigravity-models.js";
import { canonicalSelection } from "../apps/web/lib/router/model-selection.js";

process.env.TERN_CREDENTIAL_KEY = "ab".repeat(32);

const antigravity: DetectedLocalProvider = {
  id: "antigravity", name: "Antigravity", installed: true, authenticated: true,
  models: [{ id: "test-flash", name: "Test Flash", source: "discovered" }],
  health: { ok: true },
};

test("Antigravity catalogs parse actual CLI model IDs without inventing models or capabilities", () => {
  const models = parseAntigravityModels("Fetching available models...\n" +
    "\u001b[32mgemini-3.8-flash-medium\u001b[0m\tGemini 3.8 Flash (Medium)\r\n" +
    "claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n" +
    "gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\n" +
    "invalid model\tInvalid\nno-name\t\n");
  assert.deepEqual(models, [
    { id: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Medium)" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Thinking)" },
  ]);
  assert.deepEqual(parseAntigravityModels("Authentication required. Sign in locally."), []);
});

test("Antigravity heartbeat replaces legacy aliases with discovered IDs and old selections still route", async () => {
  const { pg, db } = await pgFixture();
  try {
    const relay = new CompanionRelay(db), store = new RouterStore("user-1", db);
    const { code } = await relay.generatePairCode("user-1");
    const paired = await relay.redeemPairCode(code, "linux", "test");
    const legacy: DetectedLocalProvider = { ...antigravity,
      models: [{ id: "antigravity-pro", name: "Antigravity Pro", source: "configured" }] };
    await relay.syncHeartbeat(paired.companionId, "linux", "test", [legacy]);
    const [connection] = await store.connections();
    const discovered: DetectedLocalProvider = { ...antigravity,
      models: [{ id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro (High)", source: "discovered" }] };
    await relay.syncHeartbeat(paired.companionId, "linux", "test", [discovered]);
    const current = await store.connection(connection!.id);
    assert.equal(current.model, "gemini-3.1-pro-high");
    assert.deepEqual(current.models, discovered.models);
    const selected = `${current.id}::antigravity-pro`;
    assert.equal(canonicalSelection(selected, [current]), `${current.id}::gemini-3.1-pro-high`);
    assert.equal(canonicalSelection(selected, []), selected);
    assert.equal(canonicalSelection(selected, [{ ...current, models: [] }]), selected);
    const runner = async () => {
      for (let i = 0; i < 40; i++) {
        const jobs = await relay.pollPendingJobs(paired.companionId);
        if (jobs.length) {
          assert.equal(jobs[0]!.model, "gemini-3.1-pro-high");
          await relay.appendJobEvent(paired.companionId, jobs[0]!.id, { type: "token", token: "model selected" });
          await relay.appendJobEvent(paired.companionId, jobs[0]!.id, { type: "done" });
          return;
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      assert.fail("No companion job dispatched");
    };
    const [text] = await Promise.all([
      new RoutedClient(store, selected).complete({ model: selected, messages: [{ role: "user", content: "hello" }], stream: true, temperature: 0, free: false }),
      runner(),
    ]);
    assert.equal(text, "model selected");
    assert.equal((await store.traces())[0]!.selectedModel, "gemini-3.1-pro-high");
  } finally { await pg.close(); }
});

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

test("relay cancellation reaches only its companion and late events cannot revive a job", async () => {
  const { pg, db } = await pgFixture();
  try {
    const relay = new CompanionRelay(db);
    const { code } = await relay.generatePairCode("user-1");
    const { companionId } = await relay.redeemPairCode(code, "linux", "test");
    await assert.rejects(relay.dispatchAndStreamJob("user-1", "antigravity", "test-flash", [], undefined, undefined, undefined, undefined, 1), /timed out/);
    const cancelled = await relay.pollCancelledJobs(companionId);
    assert.equal(cancelled.length, 1);
    assert.deepEqual(await relay.pollCancelledJobs("other-companion"), []);
    for (const event of [{ type: "token" as const, token: "late" }, { type: "done" as const }, { type: "error" as const, error: "secret" }])
      await relay.appendJobEvent(companionId, cancelled[0]!, event);
    const { rows } = await db.query("SELECT status, chunks, error FROM tern_relay_jobs WHERE id=$1", [cancelled[0]]);
    assert.equal(rows[0]!.status, "cancelled");
    assert.deepEqual(rows[0]!.chunks, []);
    assert.equal(rows[0]!.error, null);
  } finally { await pg.close(); }
});

test("empty companion completions are failures and errors never persist CLI secrets", async () => {
  const { pg, db } = await pgFixture();
  try {
    const relay = new CompanionRelay(db);
    const { code } = await relay.generatePairCode("user-1");
    const { companionId } = await relay.redeemPairCode(code, "linux", "test");
    for (const type of ["done", "error"] as const) {
      const worker = async () => {
        for (let i = 0; i < 50; i++) {
          const jobs = await relay.pollPendingJobs(companionId);
          if (jobs[0]) {
            await relay.appendJobEvent(companionId, jobs[0].id, { type, error: "secret credential diagnostic" });
            return;
          }
          await new Promise(r => setTimeout(r, 20));
        }
        assert.fail("No dispatched job");
      };
      await Promise.all([
        assert.rejects(relay.dispatchAndStreamJob("user-1", "antigravity", "test-flash", []), /server error/),
        worker(),
      ]);
    }
    const { rows } = await db.query("SELECT error FROM tern_relay_jobs WHERE companion_id=$1", [companionId]);
    assert.ok(rows.every(r => !String(r.error).includes("secret")));
  } finally { await pg.close(); }
});

test("Companion quota errors persist a cooldown with unknown remaining quota", async () => {
  const { pg, db } = await pgFixture();
  try {
    const relay = new CompanionRelay(db);
    const { code } = await relay.generatePairCode("user-1");
    const { companionId } = await relay.redeemPairCode(code, "linux", "test");
    await relay.syncHeartbeat(companionId, "linux", "test", [antigravity]);
    const store = new RouterStore("user-1", db);
    const [connection] = await store.connections();
    const worker = async () => {
      for (let i = 0; i < 50; i++) {
        const [job] = await relay.pollPendingJobs(companionId);
        if (job) {
          await relay.appendJobEvent(companionId, job.id, { type: "error", category: "rate_limit", error: "private diagnostic" });
          return;
        }
        await new Promise(r => setTimeout(r, 20));
      }
      assert.fail("No job dispatched");
    };
    await Promise.all([
      assert.rejects(new RoutedClient(store, `${connection!.id}::test-flash`).complete({model:"test-flash",messages:[],stream:true,temperature:0,free:false}), /rate limited/),
      worker(),
    ]);
    const current = await store.connection(connection!.id);
    assert.equal(current.health, "rate_limit");
    assert.ok(current.cooldownUntil! > Date.now());
    assert.equal(current.quota, "unknown");
    assert.equal((await store.traces())[0]?.errorCategory, "rate_limit");
    assert.equal(eligible(current), false);
  } finally { await pg.close(); }
});

test("relay acknowledgements are durable, ordered, idempotent, and scoped to the paired Companion", async () => {
  const { pg, db } = await pgFixture();
  try {
    const relay = new CompanionRelay(db);
    const { code } = await relay.generatePairCode("user-1");
    const { companionId } = await relay.redeemPairCode(code, "linux", "test");
    await db.query("INSERT INTO tern_relay_jobs(id,user_id,companion_id,provider,model,request) VALUES('delivery-job','user-1',$1,'antigravity','test','{}')", [companionId]);
    const append = (sequence: number, type: "token" | "done", token?: string) => relay.appendJobEvent(companionId, "delivery-job", { sequence, type, ...(token === undefined ? {} : { token }) });
    await append(0, "token", "one ");
    await append(0, "token", "one "); // committed upload, lost acknowledgement
    await assert.rejects(append(0, "token", "different"), /out of order/);
    await assert.rejects(append(2, "done"), /out of order/);
    await assert.rejects(relay.appendJobEvent("other-companion", "delivery-job", { sequence: 1, type: "token", token: "foreign" }), /not found/);
    await Promise.all([append(1, "token", "two"), append(1, "token", "two")]);
    await append(2, "done"); await append(2, "done");
    await assert.rejects(append(2, "token", "late"), /out of order/);
    const { rows } = await db.query("SELECT chunks,status FROM tern_relay_jobs WHERE id='delivery-job'");
    assert.deepEqual(rows[0]?.chunks, ["one ", "two"]); assert.equal(rows[0]?.status, "completed");
    await db.query("UPDATE tern_relay_jobs SET status='cancelled' WHERE id='delivery-job'");
    await assert.rejects(append(2, "done"), /cancelled/);
  } finally { await pg.close(); }
});
