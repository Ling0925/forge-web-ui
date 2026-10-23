import { createHash } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { collectPublishedFiles, PUBLISHED_FILE_MAX_BYTES } from "@forge/core/shared/published-files";
import { type Browser, chromium } from "playwright";
import { expect, it } from "vitest";
import { freePort, launch } from "./fixtures/web-process";

it("hot-updates React/CSS without losing state and keeps Core running across Vite restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-web-dev-"));
  // Inside Vite's allow-list and the package's resolution tree, but never edit
  // the real renderer or live user files to exercise HMR.
  const probe = await mkdtemp(resolve(".forge-hmr-test-"));
  let core: ReturnType<typeof launch> | undefined;
  let web: ReturnType<typeof launch> | undefined;
  let browser: Browser | undefined;
  try {
    const corePort = await freePort();
    const coreOrigin = `http://127.0.0.1:${corePort}`;
    core = launch([resolve("tests/fixtures/web-core-process.mjs"), directory, String(corePort)], directory, coreOrigin, "state");
    let calls = 0;
    let offlineProgress = false;
    core.child.on("message", (message: { calls?: number; offlineProgress?: boolean }) => {
      calls = message.calls ?? calls;
      offlineProgress ||= message.offlineProgress === true;
    });
    await core.ready();
    const corePid = core.child.pid;
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const args = [resolve("scripts/dev.mjs"), "--port", String(port), "--core-url", coreOrigin];
    web = launch(args, directory, origin, "web-must-not-create-state");
    await web.ready();
    const executablePath = process.env.FORGE_BROWSER_EXECUTABLE;
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let loads = 0;
    page.on("load", () => loads++);
    await page.goto(origin);
    await page.locator(".composer-textarea").waitFor();
    expect(await page.title()).toBe("Forge");
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(csp).toContain("script-src 'self' 'unsafe-inline';");
    expect(csp).toContain("worker-src 'self' blob:;");
    expect(csp).toContain(`connect-src 'self' ws://127.0.0.1:${port};`);
    expect(await page.evaluate(() => window.forgeLan.status())).toMatchObject({ url: origin });
    expect(await page.evaluate(() => window.forge.listSessions())).toEqual([]);

    const component = (label: string) => `import { useState } from 'react';\nexport default function Probe() { const [count, setCount] = useState(0); return <button id="hmr-probe" onClick={() => setCount(count + 1)}>${label} {count}</button>; }\n`;
    const css = (color: string) => `#hmr-probe { color: ${color}; }\n`;
    await writeFile(join(probe, "Probe.jsx"), component("Before"));
    await writeFile(join(probe, "probe.css"), css("rgb(10, 20, 30)"));
    await writeFile(join(probe, "entry.jsx"), "import { createRoot } from 'react-dom/client';\nimport Probe from './Probe.jsx';\nimport './probe.css';\nconst element = document.createElement('div'); document.body.append(element); createRoot(element).render(<Probe />);\n");
    await page.addScriptTag({ type: "module", url: `/@fs/${join(probe, "entry.jsx")}` });
    const button = page.locator("#hmr-probe");
    await button.click();
    await page.locator(".composer-textarea").fill("keep my draft during HMR");
    const firstLoads = loads;
    await writeFile(join(probe, "Probe.jsx"), component("After"));
    await writeFile(join(probe, "probe.css"), css("rgb(30, 20, 10)"));
    await expect.poll(() => button.textContent()).toBe("After 1");
    await expect.poll(() => button.evaluate(element => getComputedStyle(element).color)).toBe("rgb(30, 20, 10)");
    expect(loads).toBe(firstLoads);
    expect(await page.locator(".composer-textarea").inputValue()).toBe("keep my draft during HMR");
    await page.locator(".composer-textarea").fill("");

    const before = await page.evaluate(() => window.forge.getHostState());
    const run = await page.evaluate(async workspace => {
      const session = await window.forge.createSession({ workspace, model: "fixture", title: "Vite restart fixture" });
      return window.forge.startRun({ sessionId: session.id, prompt: "survive Vite restart", permission: "readonly" });
    }, directory);
    await page.locator(".welcome-task").filter({ hasText: "Vite restart fixture" }).click();
    await page.getByText("Before Web restart.", { exact: true }).waitFor();
    expect(await web.stop()).toBe(0);
    core.child.send("offline");
    await expect.poll(() => offlineProgress).toBe(true);
    expect(core.child.exitCode).toBe(null);
    expect(core.child.pid).toBe(corePid);
    web = launch(args, directory, origin, "web-must-not-create-state");
    await web.ready();
    // Vite deliberately reloads after a dev-server restart, unlike an ordinary
    // React/CSS hot update. No manual refresh or duplicate startRun is needed.
    await expect.poll(() => loads, { timeout: 20000 }).toBeGreaterThan(firstLoads);
    await page.locator(".composer-textarea").waitFor();
    const task = page.locator(".welcome-task").filter({ hasText: "Vite restart fixture" });
    if (await task.isVisible()) await task.click();
    await page.getByText("Core kept working while Web was offline.", { exact: true }).waitFor();
    const after = await page.evaluate(() => window.forge.getHostState());
    expect(after.hostId).toBe(before.hostId);
    expect(after.runs).toContainEqual(expect.objectContaining({ runId: run.runId, status: "running" }));
    core.child.send("finish");
    await page.getByText("Finished after reconnect.", { exact: true }).waitFor();
    await expect.poll(async () => (await page.evaluate(id => window.forge.getSession(id), run.sessionId)).status).toBe("completed");
    expect(calls).toBe(1);

    // The Vite proxy must also stream large RPC bodies without adding the old
    // 64 MiB ceiling (50 MiB attachments become >64 MiB base64 JSON).
    const delivery = await page.evaluate(async workspace => {
      const session = await window.forge.createSession({ workspace, model: "fixture", title: "Dev download fixture" });
      return window.forge.startRun({ sessionId: session.id, prompt: "publish 50 MiB fixture", permission: "unrestricted" });
    }, directory);
    await expect.poll(async () => (await page.evaluate(id => window.forge.getSession(id), delivery.sessionId)).status).toBe("completed");
    const delivered = await page.evaluate(id => window.forge.getSession(id), delivery.sessionId);
    const [file] = collectPublishedFiles(delivered.messages);
    expect(file?.size).toBe(PUBLISHED_FILE_MAX_BYTES);
    await page.reload();
    await page.locator(".welcome-task").filter({ hasText: "Dev download fixture" }).click();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("article", { name: "附件 large.bin", exact: true }).getByRole("button", { name: "下载", exact: true }).click();
    const download = await downloadEvent;
    const stream = await download.createReadStream();
    if (!stream) throw new Error("Missing download stream");
    let bytes = 0;
    const hash = createHash("sha256");
    for await (const chunk of stream) { bytes += chunk.length; hash.update(chunk); }
    expect(bytes).toBe(PUBLISHED_FILE_MAX_BYTES);
    expect(hash.digest("hex")).toBe(file?.sha256);
    await download.delete();
    expect(errors).toEqual([]);
    await expect(stat(join(directory, "web-must-not-create-state"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await web.stop()).toBe(0);
    expect(core.child.exitCode).toBe(null);
  } finally {
    try { await browser?.close(); } finally {
      await web?.stop();
      await core?.stop();
      await rm(directory, { recursive: true, force: true });
      await rm(probe, { recursive: true, force: true });
    }
  }
}, 90_000);
