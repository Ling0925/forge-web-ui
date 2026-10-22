import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHarness } from "@forge/core/core/harness";
import { createWebHost } from "@forge/core/web/server";
import { type Browser, chromium } from "playwright";
import { expect, it } from "vitest";

async function freePort(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, "127.0.0.1", done));
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  await new Promise<void>((done) => reservation.close(() => done()));
  return address.port;
}

// Requires `pnpm build` first. Uses an isolated state directory and the
// unconfigured model state; it never reads the user's FORGE_HOME, credentials,
// or contacts a provider.
it("serves the built workbench over the Core host and supports basic navigation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-web-ui-smoke-"));
  const port = await freePort();
  const service = await createHarness({ stateDir: join(directory, "state") });
  const web = await createWebHost({
    service,
    workspace: directory,
    host: "127.0.0.1",
    port,
    rendererRoot: resolve("dist/renderer"),
  });
  let browser: Browser | undefined;
  try {
    web.server.on("request", (request, response) => {
      void web
        .handle(request, response, () => {
          response.writeHead(404, {
            "Content-Type": "text/plain; charset=utf-8",
          });
          response.end("Not found");
        })
        .catch(() => {
          if (!response.headersSent) response.writeHead(500);
          response.end("Web service unavailable");
        });
    });
    await new Promise<void>((done, reject) => {
      web.server.once("error", reject);
      web.server.listen(port, "127.0.0.1", done);
    });

    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.FORGE_BROWSER_EXECUTABLE ?? "/usr/bin/google-chrome-stable",
    });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    page.setDefaultTimeout(10000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(web.origin);
    await page.locator(".composer-textarea").waitFor();
    expect(await page.title()).toBe("Forge");
    expect(await page.locator(".wb-app").count()).toBe(1);

    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain(`connect-src 'self' ws://127.0.0.1:${port};`);
    expect(csp).toContain("script-src 'self';");

    const sessions = await page.evaluate(async () => {
      const host = (
        window as unknown as {
          forge: { listSessions(): Promise<unknown[]> };
        }
      ).forge;
      return host.listSessions();
    });
    expect(sessions).toEqual([]);

    await page.keyboard.press("Control+,");
    await page
      .getByRole("button", { name: "返回工作台", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "外观", exact: true }).click();
    await page.getByRole("button", { name: "返回工作台", exact: true }).click();
    await page.locator(".composer-textarea").waitFor();
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    await web.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
