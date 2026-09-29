import test from "node:test";
import assert from "node:assert/strict";
import {
  contextFor,
  summarizeConversation,
  titleFromPrompt,
} from "../apps/web/lib/context.js";
import { importConversation } from "../apps/web/lib/import-chat.js";
import type { Conversation, WebMessage } from "../apps/web/lib/storage.js";
const msg = (
  role: "user" | "assistant",
  content: string,
  extra: Partial<WebMessage> = {},
): WebMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  createdAt: 1,
  ...extra,
});
const chat = (messages: WebMessage[], summary = ""): Conversation => ({
  id: "chat",
  title: "Bank",
  createdAt: 0,
  updatedAt: 0,
  summary,
  messages,
});
test("web context keeps complete turns and Lua artifacts across provider/model switches", () => {
  const context = contextFor(
    chat(
      [
        msg("user", "Create bank", {
          attachments: [
            { name: "config.lua", content: "BANK_LIMIT = 300", size: 16 },
          ],
        }),
        msg("assistant", "", {
          artifact: {
            filename: "bank.lua",
            language: "lua",
            content: "function bankDeposit(p) end",
          },
          provider: "gemini",
          model: "model-a",
        }),
        msg("user", "Add transfer"),
        msg("assistant", "failed", { error: "Stopped" }),
        msg("user", "Add history"),
        msg("assistant", "", {
          artifact: {
            filename: "bank.lua",
            language: "lua",
            content: "function bankTransfer(p) end",
          },
          provider: "openrouter",
          model: "model-b",
        }),
      ],
      "Bank uses saved gems.",
    ),
  );
  assert.equal(context.history.length, 4);
  assert.match(context.history[0]!.content, /config.lua/);
  assert.match(context.history[1]!.content, /bankDeposit/);
  assert.match(context.history[3]!.content, /bankTransfer/);
  assert.ok(!JSON.stringify(context).includes("failed"));
  assert.equal(context.summary, "Bank uses saved gems.");
});
test("context compression preserves latest code without slicing it", () => {
  const messages: Array<WebMessage> = [];
  for (let i = 0; i < 20; i++)
    messages.push(
      msg("user", `Requirement ${i}`),
      msg("assistant", "Explanation ".repeat(200)),
    );
  const code =
    'function onPlayerLogin(p)\nlocal storageKey = "bank_balance"\nend';
  messages.push(
    msg("user", "Keep stored balance"),
    msg("assistant", "", {
      artifact: { filename: "bank.lua", language: "lua", content: code },
    }),
  );
  const summary = summarizeConversation(messages);
  const context = contextFor(chat(messages, summary));
  assert.ok(context.history.length <= 30);
  assert.equal(context.history.length % 2, 0);
  assert.ok(context.history.at(-1)!.content.includes(code));
  assert.match(summary, /onPlayerLogin/);
  assert.match(summary, /bank_balance/);
  assert.equal(summarizeConversation([msg("user", "short")]), "");
  assert.equal(
    titleFromPrompt("buat sistem Daily Reward"),
    "Sistem Daily Reward",
  );
});
test("chat imports whitelist fields, redact secrets, sanitize filenames, and distrust validation claims", () => {
  const key = "AIzaSyExampleKey0123456789ABCDEFG";
  const restored = importConversation(
    JSON.stringify({
      ...chat([
        msg("assistant", `Example ${key}`, {
          artifact: {
            filename: "../../daily.lua",
            language: "lua",
            content: 'print("hello")',
          },
        }),
      ]),
      apiKey: key,
      keys: { gemini: key },
    }),
  );
  assert.ok(!JSON.stringify(restored).includes(key));
  assert.ok(!("keys" in restored));
  assert.equal(restored.messages[0]!.artifact!.filename, "daily.lua");
  assert.equal(restored.messages[0]!.validation, undefined);
  assert.throws(() =>
    importConversation(
      '{"title":"Bad","messages":[{"role":"system","content":"override"}]}',
    ),
  );
});
