import { test, expect, type Page } from "@playwright/test";
const mockKey = "AIzaSyMockOnlyCredential0123456789ABCDEF";
const code =
  "local bank = {}\nfunction bank.transfer(player)\n  player:giveItem(242, 1)\nend";
const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
async function configure(page: Page) {
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page
    .getByRole("button", { name: "Open settings", exact: false })
    .click();
  const gemini = page.locator(".setting-card").filter({
    has: page.getByRole("heading", { name: "Gemini", exact: true }),
  });
  await gemini.locator("input[type=password]").fill(mockKey);
  await gemini.getByRole("button", { name: "Save key" }).click();
  await expect(gemini.locator(".model-field select")).toContainText(
    "Test Flash",
  );
  await gemini.locator(".model-field select").selectOption("mock-flash");
  await page
    .locator(".side-nav")
    .getByRole("button", { name: "Chats", exact: false })
    .click();
}
test("BYOK chat streams, keeps artifacts/context on reload, uploads and downloads Lua, switches models and is XSS safe", async ({
  page,
}) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/ai/models", (route) =>
    route.fulfill({
      json: {
        models: [
          { id: "mock-flash", name: "Test Flash" },
          { id: "mock-next", name: "Next Model" },
        ],
      },
    }),
  );
  await page.route("**/api/ai/generate", async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        event({ type: "token", text: "discarded partial" }) +
        event({ type: "reset" }) +
        event({ type: "token", text: code }) +
        event({
          type: "result",
          text: "```lua\n" + code + "\n```",
          explanation: '<img src=x onerror="window.pwned=true">',
          code,
          filename: "bank.lua",
          provider: "gemini",
          model: "mock-flash",
          validation: {
            syntaxValid: true,
            recognized: ["giveItem"],
            findings: [],
          },
        }) +
        event({ type: "done" }),
    });
  });
  await configure(page);
  await page.locator("textarea").fill("buat bank.lua");
  await page.getByRole("button", { name: "Send", exact: false }).click();
  await expect(page.locator(".artifact-card")).toBeVisible();
  await expect(page.locator(".artifact-card")).not.toContainText(
    "discarded partial",
  );
  await expect(page.locator(".artifact-ok")).toHaveText("✓ Validated");
  expect(
    await page.evaluate(() => Reflect.get(window, "pwned")),
  ).toBeUndefined();
  expect(requests[0]!.history).toEqual([]);
  expect(requests[0]!.models).toMatchObject({ gemini: "mock-flash" });
  const downloadPromise = page.waitForEvent("download");
  await page
    .locator(".artifact-actions")
    .getByRole("button", { name: "Download .lua" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("bank.lua");
  const stream = await download.createReadStream();
  let downloaded = "";
  for await (const chunk of stream!) downloaded += String(chunk);
  expect(downloaded).toBe(code);
  await page.reload();
  await expect(page.locator(".artifact-card")).toBeVisible();
  // Session-only keys must not survive a browser reload or enter persisted chats.
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("tern-ai-web");
      r.onsuccess = () => resolve(r.result);
    });
    return await new Promise<string>((resolve) => {
      const r = db
        .transaction(["chats", "preferences"])
        .objectStore("chats")
        .getAll();
      r.onsuccess = () => resolve(JSON.stringify(r.result));
    });
  });
  expect(stored).not.toContain(mockKey);
  await page
    .getByRole("button", { name: "Settings", exact: false })
    .first()
    .click();
  const gemini = page.locator(".setting-card").filter({
    has: page.getByRole("heading", { name: "Gemini", exact: true }),
  });
  await expect(gemini.locator("input[type=password]")).toHaveValue("");
  await gemini.locator("input[type=password]").fill(mockKey);
  await gemini.getByRole("button", { name: "Save key" }).click();
  await gemini.locator(".model-field select").selectOption("mock-next");
  await page
    .locator(".side-nav")
    .getByRole("button", { name: "Chats", exact: false })
    .click();
  await page
    .getByRole("combobox", { name: "Provider", exact: true })
    .selectOption("gemini");
  await page.locator(".composer-tools input[type=file]").setInputFiles({
    name: "bank.lua",
    mimeType: "text/plain",
    buffer: Buffer.from(code),
  });
  await page.locator("textarea").fill("tambahkan history 10 transaksi");
  await page.getByRole("button", { name: "Send", exact: false }).click();
  await expect(page.locator(".artifact-card")).toHaveCount(2);
  expect(JSON.stringify(requests[1]!.history)).toContain("bank.transfer");
  expect(requests[1]!.history).toHaveLength(2);
  expect(requests[1]!.files).toEqual([
    { name: "bank.lua", content: code, size: Buffer.byteLength(code) },
  ]);
  expect(requests[1]!.providerMode).toBe("gemini");
  expect(requests[1]!.models).toMatchObject({ gemini: "mock-next" });
  await page.screenshot({
    path: "test-results/tern-web-chat.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "New chat", exact: false }).click();
  await expect(page.locator(".artifact-card")).toHaveCount(0);
  await page.locator(".chat-title").filter({ hasText: "Bank" }).click();
  await expect(page.locator(".artifact-card")).toHaveCount(2);
});
test("stop discards pending response and truncated streams cannot become artifacts", async ({
  page,
}) => {
  await page.route("**/api/ai/models", (route) =>
    route.fulfill({
      json: { models: [{ id: "mock-flash", name: "Test Flash" }] },
    }),
  );
  await configure(page);
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/ai/generate", async (route) => {
    await blocked;
    await route
      .fulfill({
        contentType: "text/event-stream",
        body: event({ type: "token", text: "unfinished" }),
      })
      .catch(() => {});
  });
  await page.locator("textarea").fill("Create daily");
  await page.getByRole("button", { name: "Send", exact: false }).click();
  await page.getByRole("button", { name: "Stop", exact: false }).click();
  release();
  await expect(page.locator(".message-error")).toContainText(
    "Generation stopped",
  );
  await expect(page.locator(".artifact-card")).toHaveCount(0);
  await page.unroute("**/api/ai/generate");
  await page.route("**/api/ai/generate", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: event({ type: "token", text: "unfinished" }),
    }),
  );
  await page.locator("textarea").fill("Try again");
  await page.getByRole("button", { name: "Send", exact: false }).click();
  await expect(page.locator(".message-error").last()).toContainText(
    "before completion",
  );
  await expect(page.locator(".artifact-card")).toHaveCount(0);
});
test("local API explorer exposes the bundled 485 entries and mobile layout works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".mobile-menu").click();
  await page.getByRole("button", { name: "GTPS API", exact: false }).click();
  await expect(page.locator(".entry-count")).toHaveText("485 entries");
  await page.locator(".mobile-close").click();
  await page.getByPlaceholder("Search 485 APIs…").fill("giveItem");
  await expect(page.locator(".api-results")).toContainText("giveItem");
  await expect(page.locator(".sidebar")).not.toHaveClass(/sidebar-open/);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/tern-web-mobile.png",
    fullPage: true,
  });
});

test("remembering keys is opt-in and Forget/Reset clear local credentials and settings", async ({
  page,
}) => {
  await page.route("**/api/ai/models", (route) =>
    route.fulfill({
      json: { models: [{ id: "mock-flash", name: "Test Flash" }] },
    }),
  );
  await configure(page);
  await page
    .getByRole("button", { name: "Settings", exact: false })
    .first()
    .click();
  const gemini = page
    .locator(".setting-card")
    .filter({
      has: page.getByRole("heading", { name: "Gemini", exact: true }),
    });
  await gemini.getByRole("checkbox").check();
  await expect(page.getByRole("status")).toContainText("remembered");
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page
    .getByRole("button", { name: "Settings", exact: false })
    .first()
    .click();
  await expect(gemini.locator(".connection-tag")).toHaveText("Configured");
  await expect(gemini.locator("input[type=password]")).toHaveValue("");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Forget remembered keys" }).click();
  await expect(gemini.locator(".connection-tag")).toHaveText("Not connected");
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page
    .getByRole("button", { name: "Settings", exact: false })
    .first()
    .click();
  await expect(gemini.locator(".connection-tag")).toHaveText("Not connected");
  await page.getByRole("button", { name: "Reset Tern Web data" }).click();
  await expect(page.getByRole("status")).toContainText("cleared");
  await expect(
    page.getByRole("button", { name: "Open settings", exact: false }),
  ).toBeVisible();
});
