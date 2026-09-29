import test from "node:test";
import assert from "node:assert/strict";
import { maskSecret, redactSecrets } from "../apps/web/lib/secrets.js";
import {
  validKey,
  validModel,
  MAX_BODY,
  MAX_UPLOAD,
  guardRequest,
  providerErrorMessage,
} from "../apps/web/lib/server.js";

test("BYOK keys remain masked and server errors are centrally redacted", () => {
  const key = "AIzaSyExampleKey0123456789ABCDEFG";
  assert.equal(maskSecret(key), "AIza••••DEFG");
  assert.equal(
    redactSecrets(`request rejected ${key}`, [key]),
    "request rejected [redacted]",
  );
  assert.match(
    providerErrorMessage({ kind: "auth", message: `Invalid ${key}` }, [key]),
    /Settings/,
  );
  assert.ok(
    !providerErrorMessage({ kind: "auth", message: `Invalid ${key}` }, [
      key,
    ]).includes(key),
  );
  assert.equal(validKey("gemini", key), true);
  const aqKey = "AQ.Ab8ExampleModernGeminiKey0123456789ABCDEF";
  assert.equal(validKey("gemini", aqKey), true);
  assert.equal(validKey("gemini", `  ${aqKey}  `), true);
  assert.equal(
    redactSecrets(`request rejected ${aqKey}`, [aqKey]),
    "request rejected [redacted]",
  );
  assert.equal(
    validKey("openrouter", "sk-or-v1-1234567890abcdef1234567890"),
    true,
  );
  assert.equal(validKey("openrouter", key), false);
  assert.equal(validKey("openrouter", aqKey), false);
});
test("model IDs and request/file byte bounds are validated locally", () => {
  assert.equal(validModel("gemini-3.8-flash"), true);
  assert.equal(validModel("../../secret"), false);
  assert.equal(MAX_BODY, 300_000);
  assert.equal(MAX_UPLOAD, 16_384);
});
test("provider endpoints reject cross-origin requests and apply a bounded local request rate", () => {
  const cross = new Request("https://tern.test/api/ai/generate", {
    method: "POST",
    headers: { origin: "https://attacker.test", host: "tern.test" },
  });
  assert.equal(guardRequest(cross, "generate")?.status, 403);
  const ip = `test-${Math.random()}`;
  for (let i = 0; i < 12; i++)
    assert.equal(
      guardRequest(
        new Request("https://tern.test/api/ai/generate", {
          method: "POST",
          headers: { "x-forwarded-for": ip },
        }),
        "generate",
      ),
      undefined,
    );
  const limited = guardRequest(
    new Request("https://tern.test/api/ai/generate", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
    }),
    "generate",
  );
  assert.equal(limited?.status, 429);
  assert.equal(limited?.headers.get("retry-after"), "60");
});
