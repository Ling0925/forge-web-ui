import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { collectPublishedFiles, PUBLISHED_FILE_MAX_BYTES } from "@forge/core/shared/published-files";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Browser, chromium } from "playwright";
import { expect, it } from "vitest";
import type { RunEvent } from "@forge/core/shared/ipc";

async function freePort(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((done, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", done);
  });
  const address = reservation.address();
  await new Promise<void>((done) => reservation.close(() => done()));
  if (!address || typeof address === "string") throw new Error("Missing port");
  return address.port;
}

function launch(args: string[], directory: string, origin: string, state: string) {
  const child = spawn(process.execPath, args, {
    cwd: directory,
    env: { PATH: process.env.PATH, HOME: directory, FORGE_HOME: join(directory, state) },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const closed = new Promise<number | null>((done, reject) => {
    child.once("error", reject);
    child.once("close", done);
  });
  let output = "";
  const started = new Promise<void>(done => {
    child.stdout?.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-8192);
      if (output.includes(origin)) done();
    });
    child.stderr?.on("data", (chunk: Buffer) => { output = (output + chunk.toString()).slice(-8192); });
  });
  return {
    child,
    closed,
    async ready() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          started,
          closed.then(() => { throw new Error(`Entry exited before listening: ${output}`); }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Entry timed out: ${output}`)), 10000); }),
        ]);
      } finally { clearTimeout(timer); }
    },
    async stop(signal: NodeJS.Signals = "SIGTERM") {
      if (child.exitCode !== null || child.signalCode !== null) return closed;
      child.kill(signal);
      const force = setTimeout(() => child.kill("SIGKILL"), 5000);
      try { return await closed; } finally { clearTimeout(force); }
    },
  };
}

// Build Core and UI first. Both OS processes receive isolated HOME/FORGE_HOME;
// fixture Core supplies a gated provider and the production Web entry has none.
it("keeps a streamed conversation alive across Web process death and reconnects the rendered workbench", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-web-ui-smoke-"));
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
    const webArgs = [resolve("scripts/serve.mjs"), "--port", String(port), "--core-url", coreOrigin];
    web = launch(webArgs, directory, origin, "web-must-not-create-state");
    await web.ready();
    const firstWebPid = web.child.pid;
    const executablePath = process.env.FORGE_BROWSER_EXECUTABLE;
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(10000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const events: RunEvent[] = [];
    await page.exposeFunction("recordEvent", (event: RunEvent) => events.push(event));
    await page.goto(origin);
    await page.locator(".composer-textarea").waitFor();
    expect(await page.title()).toBe("Forge");
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(csp).toContain(`connect-src 'self' ws://127.0.0.1:${port};`);
    expect(csp).toContain("script-src 'self';");
    expect(await page.evaluate(() => window.forge.listSessions())).toEqual([]);
    expect(await page.evaluate(() => window.forgeLan.status())).toMatchObject({ url: origin });
    expect(await page.evaluate(() => window.forge.restrictWorkspace)).toBe(false);
    await page.keyboard.press("Control+,");
    await page.getByRole("button", { name: "返回工作台", exact: true }).waitFor();
    await page.getByRole("button", { name: "外观", exact: true }).click();
    await page.getByRole("button", { name: "返回工作台", exact: true }).click();
    await page.locator(".composer-textarea").waitFor();
    const before = await page.evaluate(() => {
      window.forge.onEvent(event => Reflect.get(window, "recordEvent")(event));
      Reflect.set(window, "restartMarker", "original page");
      return window.forge.getHostState();
    });
    const run = await page.evaluate(async workspace => {
      const session = await window.forge.createSession({ workspace, model: "fixture", title: "Web restart fixture" });
      return window.forge.startRun({ sessionId: session.id, prompt: "survive Web restart", permission: "readonly" });
    }, directory);
    await expect.poll(() => events.some(event => event.event.type === "text_delta")).toBe(true);
    // Select the live conversation in the actual rendered workbench.
    await page.locator(".welcome-task").first().click();
    await page.getByRole("button", { name: "取消", exact: true }).waitFor();
    await page.getByText("Before Web restart.", { exact: true }).waitFor();

    // Abrupt Web death (not merely closing a listener) must leave Core alive.
    await web.stop("SIGKILL");
    await expect.poll(() => page.locator("body > [role=status]").textContent()).toContain("自动重连");
    core.child.send("offline");
    await expect.poll(() => offlineProgress).toBe(true);
    expect(core.child.exitCode).toBe(null);
    expect(core.child.pid).toBe(corePid);
    web = launch(webArgs, directory, origin, "web-must-not-create-state");
    await web.ready();
    expect(web.child.pid).not.toBe(firstWebPid);
    // Wait for the normal reconnect backoff: no page reload or hand-triggered reconnect.
    await expect.poll(() => page.locator("body > [role=status]").isHidden(), { timeout: 15000 }).toBe(true);
    expect(await page.evaluate(() => Reflect.get(window, "restartMarker"))).toBe("original page");
    const after = await page.evaluate(() => window.forge.getHostState());
    expect(after.hostId).toBe(before.hostId);
    expect(after.runs).toContainEqual(expect.objectContaining({ runId: run.runId, status: "running" }));
    await page.getByText("Core kept working while Web was offline.", { exact: true }).waitFor();
    core.child.send("finish");
    await page.getByRole("button", { name: "取消", exact: true }).waitFor({ state: "hidden" });
    await page.getByText("Finished after reconnect.", { exact: true }).waitFor();
    await expect.poll(() => events.some(event => event.event.type === "run_finished" && event.event.status === "completed")).toBe(true);
    expect(calls).toBe(1);
    expect(events.filter(event => event.event.type === "text_delta").map(event => event.event.type === "text_delta" ? event.event.text : "")).toEqual([
      "Before Web restart.\n\n", "Core kept working while Web was offline.\n\n", "Finished after reconnect.\n",
    ]);
    const session = await page.evaluate(id => window.forge.getSession(id), run.sessionId);
    expect(session.messages.filter(message => message.role === "assistant")).toHaveLength(1);
    expect(session.status).toBe("completed");

    // Exercise the actual publish -> immutable store -> Core RPC -> gateway ->
    // rendered download path at the new ceiling, including >64 MiB base64 JSON.
    const delivery = await page.evaluate(async workspace => {
      const session = await window.forge.createSession({ workspace, model: "fixture", title: "50 MiB download fixture" });
      return window.forge.startRun({ sessionId: session.id, prompt: "publish 50 MiB fixture", permission: "unrestricted" });
    }, directory);
    await expect.poll(() => events.some(event => event.runId === delivery.runId && event.event.type === "run_finished" && event.event.status === "completed"), { timeout: 15000 }).toBe(true);
    const delivered = await page.evaluate(id => window.forge.getSession(id), delivery.sessionId);
    const [file] = collectPublishedFiles(delivered.messages);
    expect(file?.size).toBe(PUBLISHED_FILE_MAX_BYTES);
    await page.reload();
    await page.locator(".welcome-task").filter({ hasText: "50 MiB download fixture" }).click();
    const card = page.getByRole("article", { name: "附件 large.bin", exact: true });
    await card.waitFor();
    const downloadEvent = page.waitForEvent("download", { timeout: 20000 });
    await card.getByRole("button", { name: "下载", exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe("large.bin");
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
    }
  }
}, 60_000);
