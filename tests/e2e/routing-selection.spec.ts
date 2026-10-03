import { test, expect } from "@playwright/test";
import { pick } from "./ui-helpers.js";

test("Antigravity shows real Gemini models and preserves a saved legacy selection", async ({
  page,
}) => {
  await page.route("**/api/router", (route) =>
    route.fulfill({
      json: {
        user: { id: "test-user", email: "test@example.invalid" },
        pools: [],
        traces: [],
        connections: [
          {
            id: "ag",
            provider: "antigravity",
            label: "Local",
            enabled: true,
            model: "gemini-3.8-flash-medium",
            health: "connected",
            checkedAt: Date.now(),
            quota: "unknown",
            cooldownUntil: null,
            models: [
              {
                id: "gemini-3.8-flash-medium",
                name: "Gemini 3.8 Flash (Medium)",
                source: "discovered",
              },
              {
                id: "gemini-3.8-flash-high",
                name: "Gemini 3.8 Flash (High)",
                source: "discovered",
              },
              {
                id: "gemini-3.1-pro-high",
                name: "Gemini 3.1 Pro (High)",
                source: "discovered",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("tern-ai-web");
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("preferences", "readwrite");
      tx.objectStore("preferences").put(
        { model: "ag::antigravity-flash", pool: "", provider: "" },
        "routingSelection",
      );
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  const model = page.getByRole("combobox", {
    name: "Routing model",
    exact: true,
  });
  await expect(model).toHaveAttribute(
    "data-value",
    "ag::gemini-3.8-flash-medium",
  );
  await model.click();
  await expect(
    page.locator('[role="option"][data-value="ag::gemini-3.8-flash-high"]'),
  ).toContainText("Gemini 3.8 Flash (High)");
  await expect(
    page.locator('[role="option"][data-value="ag::antigravity-flash"]'),
  ).toHaveCount(0);
  await page
    .locator('[role="option"][data-value="ag::gemini-3.8-flash-high"]')
    .click();
  await page.reload();
  await expect(model).toHaveAttribute(
    "data-value",
    "ag::gemini-3.8-flash-high",
  );
});

test("chat selects every discovered model, prefers a provider, persists choices and respects pools on mobile", async ({
  page,
}) => {
  const connection = (
    id: string,
    provider: string,
    models: string[],
    enabled = true,
  ) => ({
    id,
    provider,
    label: id,
    enabled,
    model: models[0],
    health: "unknown",
    models: models.map((id) => ({ id, name: id, source: "discovered" })),
    quota: "unknown",
    cooldownUntil: null,
    checkedAt: null,
  });
  await page.route("**/api/router", (route) =>
    route.fulfill({
      json: {
        user: { id: "test-user", email: "test@example.invalid" },
        connections: [
          connection("ag", "antigravity", ["test-flash", "test-pro"]),
          connection("groq", "groq", ["test-code"]),
          connection("disabled", "openai", ["hidden-model"], false),
          {
            ...connection("no-default", "openai", ["discovered-only"]),
            model: "",
          },
        ],
        pools: [
          {
            id: "coding",
            name: "Coding only",
            enabled: true,
            connections: ["groq"],
            strategy: "priority",
          },
        ],
        traces: [],
      },
    }),
  );
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/ai/generate", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      contentType: "text/event-stream",
      body:
        'data: {"type":"result","text":"Selection received","explanation":"Selection received"}\n\n' +
        'data: {"type":"done"}\n\n',
    });
  });
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  const model = page.getByRole("combobox", {
    name: "Routing model",
    exact: true,
  });
  const provider = page.getByRole("combobox", { name: "Preferred provider" });
  await model.click();
  await expect(
    page.locator('[role="option"][data-value="ag::test-pro"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[role="option"][data-value="no-default::discovered-only"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[role="option"][data-value="disabled::hidden-model"]'),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await pick(page, "Preferred provider", "groq");
  await expect(page.locator(".chat-routing-hint")).toContainText(
    "Groq is tried first",
  );
  await page.reload();
  await expect(provider).toHaveAttribute("data-value", "groq");
  await page.locator("textarea").fill("hello");
  await page.getByRole("button", { name: "Send", exact: false }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]!.routerModel).toBe("auto");
  expect(requests[0]!.preferredProvider).toBe("groq");

  await pick(page, "Routing model", "ag::test-pro");
  await expect(provider).toBeDisabled();
  await expect(page.locator(".chat-routing-hint")).toContainText(
    "exact model and account",
  );
  await page.reload();
  await expect(model).toHaveAttribute("data-value", "ag::test-pro");
  await page.locator("textarea").fill("use pro");
  await page.getByRole("button", { name: "Send", exact: false }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]!.routerModel).toBe("ag::test-pro");

  await pick(page, "Routing pool", "coding");
  await expect(model).toHaveAttribute("data-value", "auto");
  await expect(provider).toBeEnabled();
  await expect(provider).toHaveAttribute("data-value", "");
  await model.click();
  await expect(
    page.locator('[role="option"][data-value="ag::test-pro"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('[role="option"][data-value="groq::test-code"]'),
  ).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(model).toBeVisible();
  await expect(provider).toBeVisible();
  // Wait for the mobile sidebar transition and verify controls receive pointer input.
  await provider.click({ trial: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/routing-selection-mobile.png",
    fullPage: true,
  });
});

for (const width of [1440, 390, 360]) test(`Codex catalog preserves all models and supported reasoning choices at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  const models=Array.from({length:8},(_,i)=>({id:`test-codex-${i}`,name:`Codex model ${i}`,source:"discovered",defaultReasoningEffort:"low",reasoningEfforts:i===0?["low","medium","high","ultra"]:["low"]}));
  await page.route("**/api/router",r=>r.fulfill({json:{connections:[{id:"cx",provider:"codex",label:"Own CLI",enabled:true,model:models[0]!.id,models,health:"connected",quota:"unknown"}],pools:[],traces:[]}}));
  const requests:Record<string,unknown>[]=[];
  await page.route("**/api/ai/generate",r=>{requests.push(r.request().postDataJSON());return r.fulfill({contentType:"text/event-stream",body:'data: {"type":"result","text":"hello","explanation":"hello"}\n\ndata: {"type":"done"}\n\n'})});
  await page.goto("/");await expect(page.locator("main")).toHaveAttribute("data-ready","true");
  await page.getByRole("combobox",{name:"Routing model",exact:true}).click();
  for(const m of models) await expect(page.locator(`[role="option"][data-value="cx::${m.id}"]`)).toHaveCount(1);
  await expect(page.locator('[role="option"][data-value="cx::test-codex-1::ultra"]')).toHaveCount(0);
  await page.getByPlaceholder("Search models…").fill("Ultra");
  await page.locator('[role="option"][data-value="cx::test-codex-0::ultra"]').click();
  await expect(page.locator(".chat-routing-hint")).toContainText("higher effort may use more quota");
  await page.reload();await expect(page.getByRole("combobox",{name:"Routing model",exact:true})).toHaveAttribute("data-value","cx::test-codex-0::ultra");
  await page.locator("textarea").fill("hello");await page.getByRole("button",{name:"Send",exact:false}).click();
  await expect.poll(()=>requests.length).toBe(1);expect(requests[0]!.routerModel).toBe("cx::test-codex-0::ultra");
  await page.getByRole("combobox",{name:"Routing model",exact:true}).click();
  await page.screenshot({path:`test-results/codex-picker-${width}.png`,fullPage:true,animations:"disabled"});
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("select,option")).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
