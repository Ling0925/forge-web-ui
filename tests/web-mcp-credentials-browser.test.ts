import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Browser, chromium } from "playwright";
import { expect, it } from "vitest";
import { freePort, launch } from "./fixtures/web-process";
import { chooseOption } from "./renderer/select-helpers";

it("registers API keys through the built UI and Core, authenticates both transports, and hides credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-mcp-browser-"));
  const secret = "exa-browser-fixture-key";
  let authenticatedRequests = 0;
  let failPing = false;
  const endpoint = createServer(async (request, response) => {
    if (request.headers["x-api-key"] !== secret) {
      response.writeHead(401).end();
      return;
    }
    authenticatedRequests++;
    if (request.method === "DELETE") {
      response.writeHead(200).end();
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    const message: { id?: number; method?: string } = JSON.parse(body);
    if (message.id === undefined) {
      response.writeHead(202).end();
      return;
    }
    const result = message.method === "initialize"
      ? { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "exa-compatible-fixture", version: "1" } }
      : {};
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
      jsonrpc: "2.0", id: message.id,
      ...(failPing ? { error: { code: -1, message: `Rejected key ${secret}` } } : { result }),
    }));
  });
  let core: ReturnType<typeof launch> | undefined;
  let web: ReturnType<typeof launch> | undefined;
  let browser: Browser | undefined;
  try {
    await new Promise<void>(done => endpoint.listen(0, "127.0.0.1", done));
    const address = endpoint.address();
    if (!address || typeof address === "string") throw new Error("Missing MCP endpoint port");
    const coreOrigin = `http://127.0.0.1:${await freePort()}`;
    core = launch([
      resolve("../forge-core/dist/web/serve.js"), "--port", new URL(coreOrigin).port,
      "--workspace", directory,
    ], directory, coreOrigin, "state");
    await core.ready();
    const origin = `http://127.0.0.1:${await freePort()}`;
    web = launch([
      resolve("scripts/serve.mjs"), "--port", new URL(origin).port, "--core-url", coreOrigin,
    ], directory, origin, "web-state");
    await web.ready();
    browser = await chromium.launch({
      headless: true,
      ...(process.env.FORGE_BROWSER_EXECUTABLE ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE } : {}),
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    await page.locator(".composer-textarea").waitFor();
    await page.keyboard.press("Control+,");
    await page.getByRole("button", { name: /MCP 扩展/ }).click();
    await page.getByRole("button", { name: "注册服务器" }).click();
    await chooseOption(page.locator("#mcp-server-transport"), "http");
    await page.locator("#mcp-server-id").fill("exa-remote");
    await page.locator("#mcp-server-name").fill("Exa credential fixture");
    await page.locator("#mcp-server-url").fill(`http://127.0.0.1:${address.port}/mcp`);
    await page.locator("#mcp-server-auth").fill(secret);

    const screenshotDir = process.env.FORGE_TEST_SCREENSHOT_DIR;
    if (screenshotDir) {
      await mkdir(screenshotDir, { recursive: true });
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
          await page.locator("#mcp-server-auth").scrollIntoViewIfNeeded();
          await page.screenshot({ path: join(screenshotDir, `built-mcp-${theme}-${width}.png`) });
          expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
        }
      }
    }

    await page.getByRole("button", { name: "注册（默认禁用）" }).click();
    const remote = page.locator(".mcp-card.agent-card").filter({ hasText: "Exa credential fixture" });
    await remote.getByText("已配置私密认证凭据（共 1 项）").waitFor();
    expect(authenticatedRequests).toBe(0);
    await remote.getByRole("button", { name: "启用", exact: true }).click();
    await remote.getByRole("button", { name: "测试连接", exact: true }).click();
    await remote.locator(".mcp-card-health").filter({ hasText: "连接测试成功" }).waitFor();
    expect(authenticatedRequests).toBeGreaterThan(0);
    failPing = true;
    await remote.getByRole("button", { name: "测试连接", exact: true }).click();
    await remote.locator(".mcp-card-health").filter({ hasText: "[REDACTED]" }).waitFor();

    const script = join(directory, "mcp-fixture.mjs");
    await writeFile(script, `
      import { createInterface } from 'node:readline';
      createInterface({input:process.stdin}).on('line', line => {
        const q = JSON.parse(line); if (q.id === undefined) return;
        const result = q.method === 'initialize'
          ? {protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'env-fixture',version:'1'}} : {};
        console.log(JSON.stringify({jsonrpc:'2.0',id:q.id,...(process.env.EXA_API_KEY === ${JSON.stringify(secret)}
          ? {result} : {error:{code:-1,message:'Wrong environment credential'}})}));
      });`);
    await page.getByRole("button", { name: "注册服务器" }).click();
    await page.locator("#mcp-server-id").fill("exa-local");
    await page.locator("#mcp-server-name").fill("Local credential fixture");
    await page.locator("#mcp-server-command").fill(process.execPath);
    await page.locator("#mcp-server-args").fill(JSON.stringify([script]));
    await page.locator("#mcp-server-env-name").fill("EXA_API_KEY");
    await page.locator("#mcp-server-env-value").fill(secret);
    if (screenshotDir) {
      await page.locator("#mcp-server-env-value").scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(screenshotDir, "built-mcp-local-dark-390.png") });
    }
    await page.getByRole("button", { name: "注册（默认禁用）" }).click();
    const local = page.locator(".mcp-card.agent-card").filter({ hasText: "Local credential fixture" });
    await local.getByText("已配置私密认证凭据", { exact: true }).waitFor();
    await local.getByRole("button", { name: "启用", exact: true }).click();
    await local.getByRole("button", { name: "测试连接（启动已启用服务器）", exact: true }).click();
    await local.locator(".mcp-card-health").filter({ hasText: "连接测试成功" }).waitFor();

    const path = join(directory, "state", "mcp", "servers.json");
    expect((await stat(path)).mode & 0o077).toBe(0);
    const stored = JSON.parse(await readFile(path, "utf8"));
    expect(stored.servers).toContainEqual(expect.objectContaining({ id: "exa-remote", headers: { "x-api-key": secret } }));
    expect(stored.servers).toContainEqual(expect.objectContaining({ id: "exa-local", env: { EXA_API_KEY: secret } }));
    expect(JSON.stringify(await page.evaluate(() => window.forge.listMcpServers()))).not.toContain(secret);
    expect(await page.content()).not.toContain(secret);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(secret);
    expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain(secret);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    await web?.stop();
    await core?.stop();
    endpoint.closeAllConnections();
    await new Promise<void>(done => endpoint.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
