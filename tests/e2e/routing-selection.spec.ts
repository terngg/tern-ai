import { test, expect } from "@playwright/test";

test("Antigravity shows real Gemini models and preserves a saved legacy selection", async ({ page }) => {
  await page.route("**/api/router", (route) => route.fulfill({ json: {
    user: { id: "test-user", email: "test@example.invalid" }, pools: [], traces: [],
    connections: [{ id: "ag", provider: "antigravity", label: "Local", enabled: true,
      model: "gemini-3.8-flash-medium", health: "connected", checkedAt: Date.now(),
      quota: "unknown", cooldownUntil: null,
      models: [
        { id: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Medium)", source: "discovered" },
        { id: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)", source: "discovered" },
        { id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro (High)", source: "discovered" },
      ],
    }],
  } }));
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("tern-ai-web"); r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("preferences", "readwrite");
      tx.objectStore("preferences").put({ model: "ag::antigravity-flash", pool: "", provider: "" }, "routingSelection");
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  const model = page.getByRole("combobox", { name: "Routing model", exact: true });
  await expect(model).toHaveValue("ag::gemini-3.8-flash-medium");
  await expect(model.locator('option[value="ag::gemini-3.8-flash-high"]')).toHaveText("Antigravity / Gemini 3.8 Flash (High) (gemini-3.8-flash-high)");
  await expect(model.locator('option[value="ag::antigravity-flash"]')).toHaveCount(0);
  await model.selectOption("ag::gemini-3.8-flash-high");
  await page.reload();
  await expect(model).toHaveValue("ag::gemini-3.8-flash-high");
});

test("chat selects every discovered model, prefers a provider, persists choices and respects pools on mobile", async ({ page }) => {
  const connection = (id: string, provider: string, models: string[], enabled = true) => ({
    id, provider, label: id, enabled, model: models[0], health: "unknown",
    models: models.map((id) => ({ id, name: id, source: "discovered" })),
    quota: "unknown", cooldownUntil: null, checkedAt: null,
  });
  await page.route("**/api/router", (route) => route.fulfill({ json: {
    user: { id: "test-user", email: "test@example.invalid" },
    connections: [
      connection("ag", "antigravity", ["test-flash", "test-pro"]),
      connection("groq", "groq", ["test-code"]),
      connection("disabled", "openai", ["hidden-model"], false),
      { ...connection("no-default", "openai", ["discovered-only"]), model: "" },
    ],
    pools: [{ id: "coding", name: "Coding only", enabled: true, connections: ["groq"], strategy: "priority" }],
    traces: [],
  } }));
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/ai/generate", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ contentType: "text/event-stream", body:
      'data: {"type":"result","text":"Selection received","explanation":"Selection received"}\n\n' +
      'data: {"type":"done"}\n\n',
    });
  });
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  const model = page.getByRole("combobox", { name: "Routing model", exact: true });
  const provider = page.getByRole("combobox", { name: "Preferred provider" });
  await expect(model.locator('option[value="ag::test-pro"]')).toHaveCount(1);
  await expect(model.locator('option[value="no-default::discovered-only"]')).toHaveCount(1);
  await expect(model.locator('option[value="disabled::hidden-model"]')).toHaveCount(0);
  await provider.selectOption("groq");
  await expect(page.locator(".chat-routing-hint")).toContainText("Groq is tried first");
  await page.reload();
  await expect(provider).toHaveValue("groq");
  await page.locator("textarea").fill("hello");
  await page.getByRole("button", { name: "Send", exact: false }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]!.routerModel).toBe("auto");
  expect(requests[0]!.preferredProvider).toBe("groq");

  await model.selectOption("ag::test-pro");
  await expect(provider).toBeDisabled();
  await expect(page.locator(".chat-routing-hint")).toContainText("exact model and account");
  await page.reload();
  await expect(model).toHaveValue("ag::test-pro");
  await page.locator("textarea").fill("use pro");
  await page.getByRole("button", { name: "Send", exact: false }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]!.routerModel).toBe("ag::test-pro");

  await page.getByRole("combobox", { name: "Routing pool" }).selectOption("coding");
  await expect(model).toHaveValue("auto");
  await expect(provider).toBeEnabled();
  await expect(provider).toHaveValue("");
  await expect(model.locator('option[value="ag::test-pro"]')).toHaveCount(0);
  await expect(model.locator('option[value="groq::test-code"]')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(model).toBeVisible();
  await expect(provider).toBeVisible();
  // Wait for the mobile sidebar transition and verify controls receive pointer input.
  await provider.click({ trial: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/routing-selection-mobile.png", fullPage: true });
});
