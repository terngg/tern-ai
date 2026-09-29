import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  chatStorage,
  preferences,
  type Conversation,
} from "../apps/web/lib/storage.js";
test("IndexedDB commits chats and preferences, loads old history, deletes and resets independently", async () => {
  const chat: Conversation = {
    id: "one",
    title: "Bank",
    createdAt: 1,
    updatedAt: 2,
    summary: "Keep storage keys",
    messages: [
      {
        id: "user",
        role: "user",
        content: "Create bank",
        createdAt: 1,
        attachments: [
          { name: "bank.lua", content: "local balance = 1", size: 17 },
        ],
      },
    ],
  };
  await chatStorage.put(chat);
  await preferences.put("settings", { providerMode: "gemini" });
  assert.deepEqual(await chatStorage.get("one"), chat);
  assert.equal((await chatStorage.all()).length, 1);
  const key = "AIzaSyMockOnlyCredential0123456789ABCDEF";
  await chatStorage.put({
    ...chat,
    title: key,
    messages: [{ ...chat.messages[0]!, content: key }],
  });
  assert.ok(!JSON.stringify(await chatStorage.get("one")).includes(key));
  await chatStorage.put({ ...chat, title: "Renamed" });
  assert.equal((await chatStorage.get("one"))!.title, "Renamed");
  assert.equal(await preferences.get("rememberedKeys"), undefined);
  await chatStorage.remove("one");
  assert.equal(await chatStorage.get("one"), undefined);
  await chatStorage.put(chat);
  await chatStorage.clear();
  assert.deepEqual(await chatStorage.all(), []);
  assert.deepEqual(await preferences.get("settings"), {
    providerMode: "gemini",
  });
  await preferences.clear();
  assert.equal(await preferences.get("settings"), undefined);
});
