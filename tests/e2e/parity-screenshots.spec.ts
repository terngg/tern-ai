import { test } from "@playwright/test";

test("capture visual parity screenshots across desktop and mobile", async ({
  page,
}) => {
  // Desktop captures (1440x900)
  await page.setViewportSize({ width: 1440, height: 900 });

  const screens = [
    { screen: "providers", path: "test-results/providers-desktop.png" },
    { screen: "routing", path: "test-results/routing-desktop.png" },
    { screen: "pools", path: "test-results/pools-desktop.png" },
    { screen: "usage", path: "test-results/usage-desktop.png" },
    { screen: "models", path: "test-results/models-desktop.png" },
    { screen: "quota", path: "test-results/quota-desktop.png" },
    { screen: "requests", path: "test-results/requests-desktop.png" },
    { screen: "settings", path: "test-results/settings-desktop.png" },
    { screen: "chat", path: "test-results/chat-desktop.png" },
  ];

  for (const s of screens) {
    await page.goto(`/?screen=${s.screen}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: s.path, fullPage: true });
    console.log(`Captured ${s.path}`);
  }

  // Mobile capture (390x844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?screen=providers", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/providers-mobile.png",
    fullPage: true,
  });
  console.log("Captured test-results/providers-mobile.png");
});
