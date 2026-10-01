// Live browser-to-Vercel-to-PostgreSQL workflow. Uses an invalid provider key, never fake health.
import { chromium, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import pg from "pg";
const base = new URL(process.argv[2] || "").origin;
if (!base.startsWith("https://") || !process.env.DATABASE_URL)
  throw new Error("HTTPS deployment and DATABASE_URL required.");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const email =
    "tern-browser-" + randomBytes(10).toString("hex") + "@example.invalid",
  password = randomBytes(32).toString("hex");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let phase = "registration";
try {
  await db.connect();
  await page.goto(base + "/?screen=providers");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".router-auth")).toHaveCount(0);
  phase = "encrypted connection creation";
  await page
    .locator(".provider-card")
    .filter({ has: page.getByText("OpenAI", { exact: true }) })
    .click();
  const drawer = page.getByRole("dialog");
  await drawer
    .getByLabel("Connection name")
    .fill("Live browser persistence check");
  await drawer
    .getByLabel("API key", { exact: true })
    .fill("invalid-browser-check-" + randomBytes(16).toString("hex"));
  await drawer.getByLabel("Default chat model").fill("verification-model");
  await drawer
    .getByRole("button", { name: "Save encrypted connection" })
    .click();
  await expect(
    drawer.getByRole("heading", { name: "Live browser persistence check" }),
  ).toBeVisible();
  await expect(drawer.getByLabel("API key", { exact: true })).toHaveValue("");
  await expect(drawer.locator(".router-panel").first()).toContainText(
    "Unknown",
  );
  phase = "real negative health check";
  await drawer.getByRole("button", { name: "Test / discover models" }).click();
  await expect(drawer.locator(".router-panel").first()).toContainText(
    "Authentication failed",
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: "Close provider" }).click();
  phase = "account persistence after reload";
  await page.reload();
  await expect(
    page
      .locator(".provider-card")
      .filter({ has: page.getByText("OpenAI", { exact: true }) }),
  ).toContainText("Authentication failed");
  phase = "topology";
  await page
    .locator(".side-nav")
    .getByRole("button", { name: "Routing", exact: false })
    .click();
  await expect(
    page.getByRole("img", { name: "Configured account routing topology" }),
  ).toBeVisible();
  await expect(page.locator(".router-graph")).toContainText(
    "verification-model",
  );
  phase = "quota";
  await page
    .locator(".side-nav")
    .getByRole("button", { name: "Quota", exact: false })
    .click();
  await expect(page.locator(".router-panel")).toContainText("Unknown");
  console.log(
    "PASS live browser registration, encrypted connection creation, real failed health check, reload persistence, topology and unknown quota",
  );
} catch {
  console.error(
    "FAIL live browser verification phase: " + phase + "; secrets suppressed.",
  );
  process.exitCode = 1;
} finally {
  await db.query("DELETE FROM tern_users WHERE email=$1", [email]).catch(() => {
    process.exitCode = 1;
  });
  await db.end();
  await browser.close();
}
