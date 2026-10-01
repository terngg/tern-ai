// Run with node --import tsx. All credentials stay in memory; output is pass/fail only.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { decrypt } from "../apps/web/lib/router/crypto.ts";
const base = new URL(process.argv[2] || "").origin;
if (
  !base.startsWith("https://") ||
  !process.env.DATABASE_URL ||
  !process.env.TERN_CREDENTIAL_KEY
)
  throw new Error("HTTPS deployment and server environment required.");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const users = [];
const request = async (
  path,
  body,
  cookie = "",
  method = body ? "POST" : "GET",
) => {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  return { response, data };
};
try {
  await db.connect();
  const tables = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'tern_%'",
  );
  assert.equal(tables.rows.length, 7);
  console.log("PASS managed PostgreSQL connectivity and seven router tables");
  const accounts = [];
  for (let i = 0; i < 2; i++) {
    const email =
        "tern-verification-" +
        randomBytes(10).toString("hex") +
        "@example.invalid",
      password = randomBytes(32).toString("hex");
    const { response, data } = await request("/api/auth", {
      action: "register",
      email,
      password,
    });
    assert.equal(response.status, 200, "Registration failed");
    assert.ok(data.user?.id);
    users.push(data.user.id);
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    accounts.push({ cookie, id: data.user.id });
  }
  const credential = "invalid-verification-" + randomBytes(16).toString("hex");
  const create = await request(
    "/api/router",
    {
      action: "create",
      provider: "openai",
      label: "Temporary persistence verification",
      key: credential,
      model: "verification-model",
    },
    accounts[0].cookie,
  );
  assert.equal(create.response.status, 201);
  const id = create.data.connection.id;
  assert.equal(create.data.connection.health, "unknown");
  assert.ok(!JSON.stringify(create.data).includes(credential));
  const row = await db.query(
    "SELECT secret,metadata FROM tern_connections WHERE user_id=$1 AND id=$2",
    [accounts[0].id, id],
  );
  assert.equal(row.rows.length, 1);
  assert.ok(!row.rows[0].secret.includes(credential));
  assert.equal(decrypt(row.rows[0].secret, accounts[0].id, id).key, credential);
  console.log(
    "PASS AES-256-GCM encrypted persistence, authenticated roundtrip, metadata-only response",
  );
  const second = await request("/api/router", undefined, accounts[1].cookie);
  assert.equal(second.data.connections.length, 0);
  for (const action of ["update", "delete", "test"]) {
    const denied = await request(
      "/api/router",
      { action, id, enabled: false },
      accounts[1].cookie,
    );
    assert.equal(denied.response.status, 404);
  }
  console.log("PASS cross-user list, update, delete and test isolation");
  const pool = await request(
    "/api/router",
    {
      action: "savePool",
      name: "Temporary verification pool",
      connections: [id],
      strategy: "round_robin",
      enabled: true,
    },
    accounts[0].cookie,
  );
  assert.equal(pool.response.status, 200);
  const check = await request(
    "/api/router",
    { action: "test", id },
    accounts[0].cookie,
  );
  assert.equal(
    check.response.status,
    401,
    "Negative credential test must fail authentication",
  );
  const snapshot = await request("/api/router", undefined, accounts[0].cookie);
  assert.equal(snapshot.data.connections[0].health, "auth_failure");
  assert.ok(snapshot.data.connections[0].checkedAt);
  assert.equal(snapshot.data.pools.length, 1);
  console.log(
    "PASS real negative provider check persists auth_failure and measured latency; pool persists",
  );
  await db.query(
    "INSERT INTO tern_cursors(user_id,scope,cursor) VALUES($1,'verification',1) ON CONFLICT(user_id,scope) DO UPDATE SET cursor=tern_cursors.cursor+1",
    [accounts[0].id],
  );
  const cursor = await db.query(
    "SELECT cursor FROM tern_cursors WHERE user_id=$1 AND scope='verification'",
    [accounts[0].id],
  );
  assert.equal(Number(cursor.rows[0].cursor), 1);
  console.log("PASS durable routing cursor");
  console.log(
    "PASS deployed account/provider persistence; no successful AI inference claimed",
  );
} catch {
  console.error(
    "FAIL deployed database/router verification. Secrets suppressed.",
  );
  process.exitCode = 1;
} finally {
  for (const id of users)
    await db.query("DELETE FROM tern_users WHERE id=$1", [id]).catch(() => {
      process.exitCode = 1;
    });
  await db.end();
}
