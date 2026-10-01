import assert from "node:assert/strict";
const origin = new URL(process.argv[2] || "").origin;
if (!origin.startsWith("https://"))
  throw new Error("Use the HTTPS deployment URL.");
const request = (path, init) =>
  fetch(origin + path, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
const home = await request("/");
assert.equal(home.status, 200);
assert.match(await home.text(), /GTPS Lua|GTPS LUA/);
assert.match(
  home.headers.get("content-security-policy") || "",
  /object-src 'none'/,
);
assert.equal(home.headers.get("x-content-type-options"), "nosniff");
console.log("PASS public homepage and security headers");
const docs = await (await request("/api/gtps")).json();
assert.equal(docs.entries?.length, 485);
console.log("PASS serverless GTPS reference: 485 entries");
for (const path of [
  "/api/ai/generate",
  "/api/router",
  "/api/router/chat",
  "/api/router/messages",
]) {
  const response = await request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userId: "other-user",
      keys: { openai: "invalid" },
      prompt: "hello",
    }),
  });
  assert.equal(response.status, 401);
}
console.log(
  "PASS all router entrypoints require authenticated user; no credential/user-ID bypass",
);
const cross = await request("/api/router", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: "https://invalid.example",
  },
  body: "{}",
});
assert.equal(cross.status, 403);
console.log("PASS cross-origin request protection");
assert.equal(
  (await request("/api/ai/providers/test", { method: "POST" })).status,
  410,
);
console.log("PASS simulated testing endpoint retired");
console.log(`Verified ${origin}; no live AI credential was used.`);
