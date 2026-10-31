import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Page, chromium } from "playwright";
import { expect, it } from "vitest";

import { freePort, launch } from "./fixtures/web-process";

/**
 * Production-entry rendered interaction check for plugin management and the
 * session browser panel. It runs the real built renderer through
 * `scripts/serve.mjs` against the offline fixture Core (temporary FORGE_HOME,
 * gated fixture provider, no real provider, no user services).
 *
 * The dependency check deliberately points at a non-existent executable so the
 * real Core reports `unavailable` without launching any browser or installing
 * anything.
 */
const MISSING_EXECUTABLE = "/nonexistent/forge-smoke-agent-browser";

async function openSettings(page: Page, section: string) {
  await page.getByRole("button", { name: "返回工作台", exact: true }).waitFor({
    state: "hidden",
  });
  await page.keyboard.press("Control+,");
  await page.getByRole("button", { name: "返回工作台", exact: true }).waitFor();
  await page
    .getByRole("navigation", { name: "设置分类" })
    .getByRole("button", { name: section, exact: true })
    .click();
}

it("manages the built-in browser plugin and previews its absence from the production build", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-web-plugins-smoke-"));
  let core: ReturnType<typeof launch> | undefined;
  let web: ReturnType<typeof launch> | undefined;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.FORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    // 1. Offline fixture Core with a temporary state directory.
    const corePort = await freePort();
    const coreOrigin = `http://127.0.0.1:${corePort}`;
    core = launch(
      [
        resolve("tests/fixtures/web-core-process.mjs"),
        directory,
        String(corePort),
      ],
      directory,
      coreOrigin,
      "state",
    );
    await core.ready();

    // 2. Production static entry: built renderer + real gateway. The session is
    // created through the page's own bridge, so no separate client handshake is
    // invented here.
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    web = launch(
      [
        resolve("scripts/serve.mjs"),
        "--port",
        String(port),
        "--core-url",
        coreOrigin,
      ],
      directory,
      origin,
      "web-must-not-create-state",
    );
    await web.ready();

    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.setDefaultTimeout(15000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(origin);
    await page.locator(".composer-textarea").waitFor();

    // --- Plugin management in the real settings page -----------------------
    await openSettings(page, "插件");
    // The legacy standalone browser settings category is gone; the plugin
    // section is the only browser entry point in the real production build.
    expect(
      await page
        .getByRole("navigation", { name: "设置分类" })
        .getByRole("button", { name: "浏览器", exact: true })
        .count(),
    ).toBe(0);
    expect(
      await page.getByLabel("浏览器允许来源", { exact: true }).count(),
    ).toBe(0);
    expect(await page.locator("#setting-origins").count()).toBe(0);
    expect(await page.locator("#setting-browserExecutablePath").count()).toBe(
      0,
    );
    const card = page.getByRole("article", {
      name: "插件 Browser · agent-browser",
    });
    await card.waitFor();
    // Core's store starts disabled, and rendering performs no health check.
    await card.getByText("已禁用", { exact: true }).waitFor();
    expect(await card.getByText(/依赖检查通过|依赖不可用/).count()).toBe(0);
    expect(
      await page.getByText("已配置 · 未检查", { exact: true }).count(),
    ).toBe(0);

    // Real Core rejects enabling with an empty allowlist before any config save.
    await card.getByRole("button", { name: "启用插件", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: /allowedDomains/ })
      .waitFor();

    // Save hostnames plus a deliberately missing executable; still not "ready".
    await card.getByLabel("agent-browser 可执行路径").fill(MISSING_EXECUTABLE);
    await card.getByLabel("允许访问的主机名").fill("example.com");
    await card.getByRole("button", { name: "保存配置", exact: true }).click();
    await page
      .getByText(/配置已保存。status=configured 只表示配置已持久化/)
      .waitFor();
    await card.getByLabel("允许访问的主机名").waitFor();
    expect(await page.locator(".plugin-health").count()).toBe(0);

    // Explicit enable is a separate action; Core now reports `configured`.
    await card.getByRole("button", { name: "启用插件", exact: true }).click();
    await card.getByText("已配置 · 未检查", { exact: true }).waitFor();
    await card.getByText(/未执行依赖检查前不能视为 ready/).waitFor();
    expect(await card.getByText(/依赖检查通过/).count()).toBe(0);

    // Only the explicit button probes, and the real check reports unavailable
    // (the configured executable does not exist; nothing is installed/started).
    await card
      .getByRole("button", { name: "检查依赖健康", exact: true })
      .click();
    await card.getByText(/依赖不可用/).waitFor({ timeout: 30000 });
    // Saving or checking never turned `configured` into a ready state.
    await card.getByText("已配置 · 未检查", { exact: true }).waitFor();

    // Configuration persisted in Core survives a reload of the settings page.
    await page.getByRole("button", { name: "返回工作台", exact: true }).click();
    await page.locator(".composer-textarea").waitFor();
    await openSettings(page, "插件");
    await card
      .locator(".plugin-domains code", { hasText: "example.com" })
      .waitFor();
    expect(await page.getByLabel("agent-browser 可执行路径").inputValue()).toBe(
      MISSING_EXECUTABLE,
    );
    expect(await page.getByText(/依赖检查通过/).count()).toBe(0);

    // --- Session browser panel --------------------------------------------
    await page.getByRole("button", { name: "返回工作台", exact: true }).click();
    await page.locator(".composer-textarea").waitFor();
    // Create a session through the page's own bridge, then reload so the
    // sidebar lists it before the real selection click below.
    await page.evaluate(async (workspace) => {
      await window.forge.createSession({
        workspace,
        model: "fixture",
        title: "浏览器烟测会话",
      });
    }, directory);
    await page.reload();
    await page.locator(".composer-textarea").waitFor();
    await page
      .getByRole("button", { name: /浏览器烟测会话/ })
      .first()
      .click();
    await page
      .locator(
        'section.inspector-sec[aria-label="会话信息"] .inspector-sec-toggle',
      )
      .click();
    await page
      .locator("details.inspector-row-disclosure summary", {
        hasText: "浏览器",
      })
      .click();
    const panel = page.getByRole("region", { name: "浏览器预览与接管" });
    await panel.waitFor();
    // No agent run opened a browser, so Core reports it unavailable; the page
    // shows the run-scoped lifecycle instead of inventing a live browser.
    await panel.getByText("未可用", { exact: true }).waitFor();
    await panel.getByText(/本会话当前没有活动浏览器/).waitFor();
    await panel.getByText(/不绕过审批/).waitFor();
    expect(await panel.locator(".browser-shot img").count()).toBe(0);
    expect(await panel.getByRole("button", { name: "刷新截图" }).count()).toBe(
      0,
    );

    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await web?.stop().catch(() => undefined);
    await core?.stop().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
