import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { relayStream, postRelayEvent } from "../src/companion/relay-stream.js";
import type { StreamEvent } from "../src/companion/types.js";

test("Companion batches thousands of tokens behind a slow upload without losing text or ordering completion", async () => {
  const sent: Array<StreamEvent & { sequence: number }> = [];
  let simultaneous = 0, maximum = 0;
  async function* source(): AsyncIterable<StreamEvent> {
    for (let i = 0; i < 3000; i++) yield { type: "token", token: `line ${i} 🌱\n` };
    yield { type: "done" };
  }
  await relayStream(source(), async (event, sequence) => {
    simultaneous++; maximum = Math.max(maximum, simultaneous);
    await delay(25); sent.push({ ...event, sequence }); simultaneous--;
  }, new AbortController());
  assert.equal(maximum, 1);
  assert.ok(sent.length < 8, `Expected coalescing, got ${sent.length} uploads`);
  assert.equal(sent.slice(0, -1).map(e => e.token).join(""), Array.from({ length: 3000 }, (_, i) => `line ${i} 🌱\n`).join(""));
  assert.equal(sent.at(-1)?.type, "done");
  assert.deepEqual(sent.map(e => e.sequence), sent.map((_, i) => i));
});

test("Companion still delivers live tokens before generation finishes", async () => {
  let finished = false, streamed = false;
  async function* source(): AsyncIterable<StreamEvent> {
    yield { type: "token", token: "first " };
    await delay(30);
    finished = true;
    yield { type: "token", token: "last" };
    yield { type: "done" };
  }
  await relayStream(source(), async event => { if (event.type === "token" && !finished) streamed = true; }, new AbortController(), 1);
  assert.equal(streamed, true);
});

test("Companion never posts done after a truncated stream, failed delivery, or cancellation", async () => {
  for (const mode of ["truncated", "delivery", "cancel"] as const) {
    const controller = new AbortController();const types: string[] = [];
    async function* source(): AsyncIterable<StreamEvent> {
      yield { type: "token", token: "partial" };
      if (mode === "cancel") controller.abort();
      if (mode !== "truncated") yield { type: "done" };
    }
    await assert.rejects(relayStream(source(), async event => {
      if (mode === "delivery") throw new Error("upload failed");
      types.push(event.type);
    }, controller));
    assert.equal(types.includes("done"), false);
  }
});

test("relay delivery retries transient failures with the same sequence and validates acknowledgement", async () => {
  const sequences: unknown[] = [];
  const transport = async (_url: unknown, options?: RequestInit) => {
    const data = JSON.parse(String(options?.body));sequences.push(data.sequence);
    if (sequences.length === 1) throw new Error("ack lost after commit");
    return Response.json({ ok: true, sequence: data.sequence });
  };
  await postRelayEvent("https://example.invalid/events", "test-only", { sequence: 4, type: "token", token: "text" }, undefined, transport as typeof fetch);
  assert.deepEqual(sequences, [4, 4]);
  for (const status of [401, 409, 410]) {
    let calls = 0;
    await assert.rejects(postRelayEvent("https://example.invalid/events", "test-only", { sequence: 0 }, undefined, (async () => { calls++; return new Response(null, { status }); }) as typeof fetch));
    assert.equal(calls, 1);
  }
  await assert.rejects(postRelayEvent("https://example.invalid/events", "test-only", { sequence: 2 }, undefined, (async () => Response.json({ ok: true, sequence: 1 })) as typeof fetch));
});
