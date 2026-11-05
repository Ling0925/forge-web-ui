import type { Locator } from "playwright";

/**
 * Helpers for the shared Radix-based `Select` primitive. Its trigger is a
 * `role="combobox"` button (not a native <select>), so Playwright's
 * `selectOption` / `inputValue` do not apply.
 */
const optionSelector = (value: string) =>
  `.forge-select-content [role="option"][data-value="${value.replace(/"/g, '\\"')}"]`;

/** Opens the select behind `trigger` and picks the option whose value is `value`. */
export async function chooseOption(trigger: Locator, value: string) {
  const page = trigger.page();
  await trigger.click();
  await page.locator(optionSelector(value)).click();
  await page.locator(".forge-select-content").waitFor({ state: "detached" });
}

/** Current value of the select behind `trigger` (mirrors `inputValue`). */
export async function selectValue(trigger: Locator) {
  return (await trigger.getAttribute("data-value")) ?? "";
}

/** All option values of the select behind `trigger`, in order. */
export async function optionValues(trigger: Locator) {
  const page = trigger.page();
  await trigger.click();
  const content = page.locator(".forge-select-content");
  await content.waitFor();
  const values = await content
    .locator('[role="option"]')
    .evaluateAll((options) =>
      options.map((option) => option.getAttribute("data-value") ?? ""),
    );
  await page.keyboard.press("Escape");
  await content.waitFor({ state: "detached" });
  return values;
}
