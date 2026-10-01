import { test, expect } from "@playwright/test";

test("9Router style Providers page renders, filters, opens detail drawer, and adds custom provider", async ({
  page,
}) => {
  // Go to root
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");

  // Click Providers in the sidebar
  await page
    .locator(".side-nav")
    .getByRole("button", { name: "Providers", exact: false })
    .click();

  // Verify header & Router Topology Banner
  await expect(page.locator(".providers-header h1")).toContainText("Providers");
  await expect(page.locator(".router-banner")).toBeVisible();
  await expect(page.locator(".router-pulse-indicator")).toContainText("GATEWAY ONLINE");

  // Verify all sections exist
  await expect(page.locator("#section-oauth")).toBeVisible();
  await expect(page.locator("#section-free")).toBeVisible();
  await expect(page.locator("#section-api_key")).toBeVisible();
  await expect(page.locator("#section-compatible")).toBeVisible();

  // Capture screenshot of full Providers dashboard
  await page.screenshot({ path: "test-results/providers-dashboard.png", fullPage: true });

  // Test search filtering
  const searchInput = page.locator(".search-input-wrap input");
  await searchInput.fill("DeepSeek");
  await expect(page.locator(".provider-card", { hasText: "DeepSeek" }).first()).toBeVisible();

  // Clear search
  await page.locator(".search-input-wrap button").click();

  // Test filter tab: Free
  await page.locator(".filter-tab-btn", { hasText: "Free" }).click();
  await expect(page.locator("#section-free")).toBeVisible();
  await expect(page.locator("#section-oauth")).not.toBeVisible();

  // Switch back to All
  await page.locator(".filter-tab-btn", { hasText: "All Providers" }).click();

  // Click a Provider Card (e.g. Claude Code) to open drawer
  const claudeCard = page.locator(".provider-card", { hasText: "Claude Code" }).first();
  await claudeCard.click();

  // Verify Drawer opened
  await expect(page.locator(".drawer-panel")).toBeVisible();
  await expect(page.locator(".drawer-title-group h2")).toContainText("Claude Code");

  // Take screenshot of drawer
  await page.screenshot({ path: "test-results/providers-drawer.png" });

  // Close drawer
  await page.locator(".drawer-header button[aria-label='Close drawer']").click();
  await expect(page.locator(".drawer-panel")).not.toBeVisible();

  // Test Add Custom Provider dialog
  await page.getByRole("button", { name: "Add Custom Provider", exact: false }).first().click();
  await expect(page.locator(".modal-dialog")).toBeVisible();
  await expect(page.locator(".modal-head h3")).toContainText("Add Custom AI Provider");

  // Fill custom provider form
  await page.locator(".modal-dialog input[placeholder*='e.g. Local Ollama']").fill("Local Ollama Test");
  await page.locator(".modal-dialog button[type='submit']").click();

  // Dialog closes
  await expect(page.locator(".modal-dialog")).not.toBeVisible();

  // Custom provider now appears
  await expect(page.locator(".provider-card", { hasText: "Local Ollama Test" })).toBeVisible();

  // Take screenshot with custom provider
  await page.screenshot({ path: "test-results/providers-custom-added.png" });
});
