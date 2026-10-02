import test from "node:test";
import assert from "node:assert/strict";
import { spawnStreaming } from "../src/companion/adapters/base.js";
import { antigravityPrompt, antigravityText } from "../src/companion/adapters/antigravity-stream.js";

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += chunk;
  return text;
}
async function* chunks(text: string) {
  for (let i = 0; i < text.length; i += 7) yield text.slice(i, i + 7);
}
const delta = (text: string) => JSON.stringify({ event: "step_update", step_update: { step_type: "agent_response", text_delta: text } }) + "\n";
const result = (text: string, status = "SUCCESS") => JSON.stringify({ event: "result", result: { response: text, status } });

test("CLI drains large stderr, preserves split UTF-8 and waits for exit status", async () => {
  const { stream } = spawnStreaming(process.execPath, ["-e", "process.stderr.write('s'.repeat(200000)); const b=Buffer.from('Halo 🌏');process.stdout.write(b.subarray(0,7));setTimeout(()=>process.stdout.write(b.subarray(7)),20)"]);
  assert.equal(await collect(stream), "Halo 🌏");
  const failed = spawnStreaming(process.execPath, ["-e", "process.stderr.write('secret-token');process.exit(2)"]);
  await assert.rejects(collect(failed.stream), (e: Error) => /process failed/.test(e.message) && !e.message.includes("secret-token"));
  await assert.rejects(collect(spawnStreaming("/nonexistent/tern-test-binary", []).stream), /process failed/);
});

test("CLI abort escalates when a process ignores SIGTERM", { skip: process.platform === "win32" }, async () => {
  const abort = new AbortController();
  const child = spawnStreaming(process.execPath, ["-e", "process.on('SIGTERM',()=>{});process.stdout.write('ready');setInterval(()=>{},1000)"], abort.signal);
  const consume = async () => { for await (const text of child.stream) if (text) abort.abort(); };
  await assert.rejects(consume(), /cancelled/);
  assert.equal(child.process.signalCode, "SIGKILL");
});

test("Antigravity receives GTPS system context, files, history and final repair request", () => {
  const messages = [
    { role: "system" as const, content: "Authoritative GTPS documentation" },
    { role: "user" as const, content: "Attached script: print('hello')" },
    { role: "assistant" as const, content: "Prior response" },
    { role: "user" as const, content: "Repair validation errors" },
  ];
  const prompt = antigravityPrompt(messages);
  assert.ok(prompt.endsWith(JSON.stringify(messages)));
  assert.match(prompt, /Do not inspect the local workspace/);
});

test("Antigravity streams response deltas once and hides tools and diagnostics", async () => {
  const input = JSON.stringify({ event: "step_update", step_update: { step_type: "tool", text_delta: "private tool output" } }) + "\n" + delta("hello ") + delta("world") + result("hello world");
  assert.equal(await collect(antigravityText(chunks(input))), "hello world");
  assert.equal(await collect(antigravityText(chunks(result("result only")))), "result only");
  assert.equal(await collect(antigravityText(chunks(delta("hello") + result("hello world")))), "hello world");
});

test("Antigravity rejects empty, failed, truncated and malformed responses", async () => {
  for (const input of ["", result(""), result("private error text", "ERROR"), delta("partial"), "invalid-json\n", delta("one") + result("different")]) {
    await assert.rejects(collect(antigravityText(chunks(input))), (e: Error) => !e.message.includes("private error text"));
  }
});
