import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "@forge/core/core/harness";
import { coreBuildInfo } from "@forge/core/shared/build-info";
import { createWebHost } from "@forge/core/web/server";
import { type Browser, chromium } from "playwright";
import { expect, it } from "vitest";
import { freePort } from "./fixtures/web-process";

it("renders actionable version warnings without blocking sessions or leaking malformed RPC payloads", async () => {
  const base = fileURLToPath(
    new URL("../../../.forge/tmp/cross-provider-fixes/web/", import.meta.url),
  );
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, "version-"));
  let service: Awaited<ReturnType<typeof createHarness>> | undefined;
  let host: Awaited<ReturnType<typeof createWebHost>> | undefined;
  let browser: Browser | undefined;
  try {
    expect(coreBuildInfo?.id).toBeTruthy(); // Run after building Core and the production Web UI.
    service = await createHarness({
      stateDir: join(directory, "state"),
      providerFactory: () => ({
        listModels: async () => ["fixture"],
        complete: async () => ({
          message: { role: "assistant", content: "offline reply" },
        }),
      }),
    });
    await service.updateSettings({
      settings: { baseUrl: "http://127.0.0.1:1/v1", model: "fixture" },
    });
    const session = await service.createSession({
      workspace: directory,
      title: "Version fixture",
      model: "fixture",
    });
    const port = await freePort();
    host = await createWebHost({
      service,
      stateDir: join(directory, "state"),
      workspace: directory,
      host: "127.0.0.1",
      port,
      rendererRoot: resolve("dist/renderer"),
      restrictWorkspace: false,
    });
    const web = host;
    web.server.on("request", (request, response) => {
      void web.handle(request, response, () => {
        response.writeHead(404);
        response.end();
      });
    });
    await new Promise<void>((done) =>
      web.server.listen(port, "127.0.0.1", done),
    );
    const executablePath = process.env.FORGE_BROWSER_EXECUTABLE;
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    page.setDefaultTimeout(10000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let scenario: "same" | "stale" | "client" | "unknown" = "same";
    const old = "older-build-12345678";
    await page.route("**/api/connect", async (route) => {
      const response = await route.fetch();
      const running =
        scenario === "same"
          ? coreBuildInfo!.id
          : scenario === "unknown"
            ? "unknown"
            : old;
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "x-forge-core-build": running,
          "x-forge-core-disk-build":
            scenario === "stale" ? coreBuildInfo!.id : running,
          "x-forge-core-restart-required":
            scenario === "stale"
              ? "true"
              : scenario === "unknown"
                ? "unknown"
                : "false",
        },
      });
    });
    const status = page.locator("[data-forge-connection-status]");
    await page.goto(web.origin);
    await page.locator(".composer-textarea").waitFor();
    expect(await status.isHidden()).toBe(true);
    const hostId = await page.evaluate(
      async () => (await window.forge.getHostState!()).hostId,
    );
    scenario = "stale";
    await page.reload();
    await page.locator(".composer-textarea").waitFor();
    expect(await status.textContent()).toContain("Core 新构建尚未生效");
    expect(await status.isVisible()).toBe(true);
    // The warning must not stop or replay requests, nor lose session navigation.
    await page
      .locator(".welcome-task")
      .filter({ hasText: "Version fixture" })
      .click();
    await page.locator(".composer-textarea").waitFor();
    expect(
      (await page.evaluate((id) => window.forge.getSession(id), session.id)).id,
    ).toBe(session.id);
    expect(
      await page.evaluate(
        async () => (await window.forge.getHostState!()).hostId,
      ),
    ).toBe(hostId);
    for (const width of [390, 1440])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(
          (value) => document.documentElement.setAttribute("data-theme", value),
          theme,
        );
        const size = await status.evaluate((element) => ({
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
          scroll: element.scrollWidth,
          client: element.clientWidth,
          color: getComputedStyle(element).color,
          background: getComputedStyle(element).backgroundColor,
        }));
        expect(size.height).toBeGreaterThan(0);
        expect(size.width).toBeLessThanOrEqual(width);
        expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
        expect(size.color).not.toBe(size.background);
        await page.screenshot({
          path: join(directory, `version-${theme}-${width}.png`),
          animations: "disabled",
        });
      }
    let malformed = 0;
    await page.route("**/api/rpc", async (route) => {
      const request = route.request().postDataJSON();
      if (request.method !== "getSession") {
        await route.continue();
        return;
      }
      malformed++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: request.id,
          method: request.method,
          ok: true,
          result: { PRIVATE_PAYLOAD_KEY: "PRIVATE_PAYLOAD_VALUE" },
        }),
        headers: { "X-Forge-Snapshot": "must-not-cache" },
      });
    });
    const message = await page.evaluate(async (id) => {
      try {
        await window.forge.getSession(id);
        return "unexpected success";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }, session.id);
    expect(message).toContain("getSession: schema_mismatch");
    expect(message).not.toContain("PRIVATE");
    expect(malformed).toBe(1);
    await page.unroute("**/api/rpc");
    expect(
      (await page.evaluate((id) => window.forge.getSession(id), session.id)).id,
    ).toBe(session.id);
    scenario = "client";
    await page.reload();
    await page.locator(".composer-textarea").waitFor();
    expect(await status.textContent()).toContain("不一定不兼容");
    scenario = "unknown";
    await page.reload();
    await page.locator(".composer-textarea").waitFor();
    expect(await status.isHidden()).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    if (host) await host.dispose();
    else await service?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
