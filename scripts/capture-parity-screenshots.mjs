import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });

// Desktop captures (1440x900)
const desktop = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});

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
  await desktop.goto(`http://127.0.0.1:3100/?screen=${s.screen}`, {
    waitUntil: "networkidle",
  });
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: s.path, fullPage: true });
  console.log(`Captured ${s.path}`);
}

await desktop.close();

// Mobile capture (390x844)
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
});
await mobile.goto("http://127.0.0.1:3100/?screen=providers", {
  waitUntil: "networkidle",
});
await mobile.waitForTimeout(400);
await mobile.screenshot({
  path: "test-results/providers-mobile.png",
  fullPage: true,
});
console.log("Captured test-results/providers-mobile.png");

await mobile.close();
await browser.close();
