import { test, expect } from "@playwright/test";
import { installUIFixture } from "./ui-fixture.js";
import { pick } from "./ui-helpers.js";

for (const width of [1440, 390, 360]) {
  test(`custom model picker supports search, keyboard, scroll, dismissal and focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 360 ? 800 : 844 });
    await installUIFixture(page, true);
    page.on("dialog", () => {
      throw new Error("Native browser dialog opened");
    });
    await page.goto("/");
    const model = page.getByRole("combobox", {
      name: "Routing model",
      exact: true,
    });
    await expect(model).toBeVisible();
    await model.click();
    const dialog = page.getByRole("dialog", {
      name: "Select model",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(page.locator("select, option, datalist")).toHaveCount(0);
    const search = dialog.getByRole("combobox", {
      name: "Search models",
      exact: true,
    });
    await expect(search).toBeFocused();
    await search.fill("flash high");
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await search.press("Enter");
    await expect(model).toHaveAttribute(
      "data-value",
      "qa-ag::gemini-3.8-flash-high",
    );
    await expect(model).toBeFocused();
    await model.press("ArrowDown");
    await expect(search).toBeFocused();
    await search.press("End");
    await expect
      .poll(() => dialog.getByRole("listbox").evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(model).toBeFocused();
    await model.click();
    await page
      .locator(".ui-overlay-picker .ui-backdrop")
      .click({ position: { x: 4, y: 4 } });
    await expect(dialog).toHaveCount(0);
    await expect(model).toBeFocused();
    await model.click();
    await page.locator(".ui-picker-panel").evaluate(async (el) => {
      await Promise.all(
        el.getAnimations().map((animation) => animation.finished),
      );
    });
    const box = await page.locator(".ui-picker-panel").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    if (width < 768) {
      expect(Math.round(box!.width)).toBe(width);
      expect(box!.y + box!.height).toBeCloseTo(width === 360 ? 800 : 844, 0);
    }
    for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
    await page.screenshot({
      animations: "disabled",
      path: `test-results/model-picker-${width < 768 ? `mobile-${width}` : "desktop"}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(page.locator("main")).not.toHaveAttribute("inert");
  });
}

test("chat menus use custom rename/delete dialogs, restore focus and show stacked toasts", async ({
  page,
}) => {
  await installUIFixture(page);
  page.on("dialog", () => {
    throw new Error("Native browser dialog opened");
  });
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  const menu = page.getByRole("button", {
    name: "Chat actions: New chat",
    exact: true,
  });
  await menu.click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "Rename chat", exact: true });
  await expect(
    rename.getByRole("textbox", { name: "Chat name" }),
  ).toBeFocused();
  await rename.getByRole("textbox").fill("Picker audit");
  await rename.getByRole("button", { name: "Save name" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Chat renamed" }),
  ).toBeVisible();
  const renamed = page.getByRole("button", {
    name: "Chat actions: Picker audit",
    exact: true,
  });
  await renamed.click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const deletion = page.getByRole("dialog", {
    name: "Delete chat?",
    exact: true,
  });
  await expect(deletion.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(renamed).toBeVisible();
  await expect(renamed).toBeFocused();
  await renamed.click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await deletion.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(renamed).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Chat deleted" }),
  ).toBeVisible();
  await expect(page.locator(".ui-toast")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Dismiss notification" })
    .first()
    .click();
  await expect(page.locator(".ui-toast")).toHaveCount(1);
  await expect(page.locator(".ui-toast")).toHaveCount(0, { timeout: 8000 });
});

test("nested provider model picker, confirmations, form validation, secrets and pool order preserve API behavior", async ({
  page,
}) => {
  const { actions } = await installUIFixture(page);
  page.on("dialog", () => {
    throw new Error("Native browser dialog opened");
  });
  await page.goto("/?screen=providers");
  await page
    .getByRole("button", { name: "Manage OpenAI", exact: true })
    .click();
  const drawer = page.getByRole("dialog");
  await pick(page, "Model for QA Work", "gpt-test");
  await expect(drawer).toBeVisible();
  await expect(drawer).not.toHaveAttribute("inert");
  await drawer
    .getByRole("button", { name: "Save encrypted connection" })
    .click();
  await expect(drawer.getByRole("alert")).toContainText("required");
  await drawer.locator('input[name="key"]').fill("QA_TEST_ONLY_NOT_A_SECRET");
  await drawer.getByRole("button", { name: "Show secret" }).click();
  await expect(drawer.locator('input[name="key"]')).toHaveAttribute(
    "type",
    "text",
  );
  await drawer.getByRole("button", { name: "Hide secret" }).click();
  await expect(drawer.locator('input[name="key"]')).toHaveAttribute(
    "type",
    "password",
  );
  await drawer.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "Delete connection?",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  expect(actions.some((a) => a.action === "delete")).toBe(false);
  await drawer.getByRole("button", { name: "Close provider" }).click();
  await page.goto("/?screen=pools");
  await page
    .getByRole("textbox", { name: "Pool Name", exact: true })
    .fill("QA Pool");
  await pick(page, "Selection strategy", "round_robin");
  await pick(page, "Add pool account", "qa-openai");
  await pick(page, "Add pool account", "qa-ag");
  await page.getByRole("button", { name: "Move QA Companion up" }).click();
  await page.getByRole("button", { name: "Save pool", exact: true }).click();
  await expect
    .poll(() => actions.filter((a) => a.action === "savePool").length)
    .toBe(1);
  expect(actions.find((a) => a.action === "savePool")).toMatchObject({
    connections: ["qa-ag", "qa-openai"],
    strategy: "round_robin",
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Proxy pool saved" }),
  ).toBeVisible();
});

test("every screen fits all requested breakpoints, with desktop/mobile screenshot QA", async ({
  page,
}) => {
  test.setTimeout(180000);
  await installUIFixture(page);
  const screens = [
    "chat",
    "providers",
    "pools",
    "routing",
    "models",
    "usage",
    "quota",
    "requests",
    "apis",
    "settings",
  ];
  for (const width of [320, 360, 375, 390, 412, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
    const names: Record<string, string> = {
      chat: "Chats",
      providers: "Providers",
      pools: "Proxy Pools",
      routing: "Routing",
      models: "Models",
      usage: "Usage",
      quota: "Quota",
      requests: "Requests",
      apis: "GTPS API",
      settings: "Settings",
    };
    for (const screen of screens) {
      if (width < 768)
        await page
          .getByRole("button", { name: "Open menu", exact: true })
          .click();
      await page
        .locator(".sidebar")
        .getByRole("button", { name: names[screen]!, exact: true })
        .click();
      await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
      if (!["chat", "apis"].includes(screen))
        await expect(page.locator(".ui-loading-grid")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${screen} at ${width}px overflows`,
      ).toBe(true);
      expect(
        await page
          .locator(".workspace")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `${screen} workspace at ${width}px overflows`,
      ).toBe(true);
      await expect(page.locator("select, option, datalist")).toHaveCount(0);
      if ([390, 1440].includes(width))
        await page.screenshot({
          animations: "disabled",
          path: `test-results/audit-${screen}-${width}.png`,
        });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?screen=providers");
  await page
    .getByRole("button", { name: "Manage OpenAI", exact: true })
    .click();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/audit-provider-drawer-mobile.png",
  });
  await expect(page.locator(".ui-overlay-panel")).toBeVisible();
  const panel = await page.locator(".ui-overlay-panel").boundingBox();
  expect(Math.round(panel!.width)).toBeLessThanOrEqual(390);
  expect(Math.round(panel!.height)).toBeLessThanOrEqual(844);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("button", { name: "Manage OpenAI", exact: true })
    .click();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/audit-provider-drawer-desktop.png",
  });
});

test("destructive actions require confirmation and failed requests show an error toast", async ({
  page,
}) => {
  const { actions } = await installUIFixture(page);
  page.on("dialog", () => {
    throw new Error("Native browser dialog opened");
  });
  await page.goto("/?screen=providers");
  await page
    .getByRole("button", { name: "Manage OpenAI", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Delete connection?", exact: true })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect
    .poll(() => actions.filter((a) => a.action === "delete").length)
    .toBe(1);
  await expect(
    page.getByRole("status").filter({ hasText: "Connection removed" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/?screen=pools");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const removal = page.getByRole("dialog", {
    name: "Remove proxy pool?",
    exact: true,
  });
  await removal.getByRole("button", { name: "Cancel" }).click();
  expect(actions.some((a) => a.action === "deletePool")).toBe(false);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await removal.getByRole("button", { name: "Remove", exact: true }).click();
  await expect
    .poll(() => actions.filter((a) => a.action === "deletePool").length)
    .toBe(1);
  await page.goto("/?screen=providers");
  await page.route("**/api/router", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 503,
        json: { error: "Provider is temporarily unavailable. Try again." },
      });
    else await route.fallback();
  });
  await page.getByRole("button", { name: "Test All", exact: true }).click();
  await expect(page.locator(".ui-toast-error")).toContainText(
    "Provider is temporarily unavailable",
  );
});
