import { expect, type Page } from "@playwright/test";
export async function pick(page: Page, label: string, value: string) {
  const trigger = page.getByRole("combobox", { name: label, exact: true });
  await trigger.click();
  const option = page
    .locator('[role="option"]')
    .and(page.locator(`[data-value="${value}"]`));
  await option.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}
