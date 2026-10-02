import type { ChatMessage } from "../types.js";

// Headless CLI accepts one prompt. Preserve the entire supplied conversation,
// including authoritative GTPS documentation, attachments and repair feedback.
export function antigravityPrompt(messages: ChatMessage[]): string {
  return "Answer the final user turn in the following JSON conversation. " +
    "Apply its system instructions and use its conversation history and supplied reference documentation. " +
    "This is a text-only chat: return the answer or requested code directly. " +
    "Do not inspect the local workspace, use tools, execute commands, or create files.\n" +
    JSON.stringify(messages);
}

// Official stream-json protocol. Never forward init, tool output, diagnostics or
// internal reasoning to the web client. A process exit alone is not success.
export async function* antigravityText(stream: AsyncIterable<string>): AsyncIterable<string> {
  let buffer = "", emitted = "";
  let completed = false;
  function parse(line: string): string {
    if (!line.trim()) return "";
    if (completed) throw new Error("Antigravity returned events after completion.");
    let event;
    try { event = JSON.parse(line); }
    catch { throw new Error("Antigravity returned an invalid stream."); }
    if (event?.event === "step_update" && event.step_update?.step_type === "agent_response") {
      const delta = event.step_update.text_delta;
      if (typeof delta === "string") { emitted += delta; return delta; }
    }
    if (event?.event === "result") {
      const result = event.result;
      if (result?.status !== "SUCCESS") throw new Error("Antigravity could not complete the response.");
      const response = typeof result.response === "string" ? result.response : "";
      if (!response.trim()) throw new Error("Antigravity returned an empty response.");
      if (!response.startsWith(emitted)) throw new Error("Antigravity returned an inconsistent response.");
      completed = true;
      const remainder = response.slice(emitted.length);
      emitted = response;
      return remainder;
    }
    return "";
  }
  for await (const chunk of stream) {
    buffer += chunk;
    if (buffer.length > 2_000_000) throw new Error("Antigravity stream exceeded its size limit.");
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const text = parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (text) yield text;
    }
  }
  if (buffer.trim()) { const text = parse(buffer); if (text) yield text; }
  if (!completed) throw new Error("Antigravity stream ended before completion.");
}
