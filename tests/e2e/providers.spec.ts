import { test, expect } from "@playwright/test";
test("provider catalog has truthful unconfigured, Companion and unsupported states", async ({
  page,
}) => {
  await page.goto("/?screen=providers");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await expect(page.locator(".providers-header h1")).toHaveText("Providers");
  await expect(page.locator(".provider-card")).toHaveCount(27);
  await expect(
    page.locator(".provider-card").filter({ hasText: "Kiro" }),
  ).toContainText("Requires Tern Companion");
  await expect(
    page.locator(".provider-card").filter({ hasText: "Custom REST" }),
  ).toContainText("Unsupported");
  await expect(
    page.locator(".provider-card").filter({ hasText: "OpenRouter" }),
  ).toContainText("Not configured");
  await expect(page.getByRole("button", { name: "Test All" })).toBeDisabled();
  await expect(page.locator(".real-router")).not.toContainText(
    /94ms|GATEWAY ONLINE|99\.9%/,
  );
  await page
    .getByRole("textbox", { name: "Search providers" })
    .fill("DeepSeek");
  await expect(page.locator(".provider-card")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Search providers" }).fill("");
  await page.locator(".provider-card").filter({ hasText: "Kiro" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Requires Tern Companion",
  );
  await expect(
    page.getByRole("dialog").locator("input[type=password]"),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/kiro-drawer.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close provider" }).click();
  await page.screenshot({
    path: "test-results/providers-dashboard.png",
    fullPage: true,
  });
});
test("routing, pools, requests and quota have honest empty states", async ({
  page,
}) => {
  await page.goto("/?screen=routing");
  await expect(page.locator(".real-router")).toContainText(
    "No configured routes",
  );
  await expect(page.locator(".router-graph svg")).toHaveCount(0);
  await page
    .locator(".side-nav")
    .getByRole("button", { name: "Proxy Pools" })
    .click();
  await expect(page.locator(".real-router")).toContainText(
    "No pools configured",
  );
  await page
    .locator(".side-nav")
    .getByRole("button", { name: "Requests", exact: false })
    .click();
  await expect(page.locator(".real-router")).toContainText(
    "No requests recorded",
  );
  await page
    .locator(".side-nav")
    .getByRole("button", { name: "Quota", exact: false })
    .click();
  await expect(page.locator(".real-router")).toContainText(
    "No configured accounts",
  );
});
test("providers remain usable on mobile without sidebar covering the dashboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".mobile-menu").click();
  await page
    .locator(".side-nav")
    .getByRole("button", { name: "Providers" })
    .click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/sidebar-open/);
  await expect(page.locator(".provider-card").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/providers-mobile.png",
    fullPage: true,
  });
});
