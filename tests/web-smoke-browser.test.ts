import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Browser, chromium } from "playwright";
import { expect, it } from "vitest";

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

// Requires `pnpm build` first. Exercise the actual production entry, not a
// second copy of its host setup. The child gets only temporary HOME/FORGE_HOME
// and no provider credentials; the browser uses a fresh ephemeral profile.
it("serves the built workbench through the production entry and supports navigation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-web-ui-smoke-"));
  let child: ChildProcess | undefined;
  let closed: Promise<number | null> | undefined;
  let browser: Browser | undefined;
  try {
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const socketPath = join(directory, "core.sock");
    child = spawn(process.execPath, [
      resolve("scripts/serve.mjs"), "--workspace", directory, "--port", String(port), "--socket", socketPath,
    ], {
      cwd: directory,
      env: { PATH: process.env.PATH, HOME: directory, FORGE_HOME: join(directory, "state") },
      stdio: ["ignore", "pipe", "pipe"],
    });
    closed = new Promise((done, reject) => {
      child?.once("error", reject);
      child?.once("close", (code) => done(code));
    });
    let output = "";
    const started = new Promise<void>((done) => {
      child?.stdout?.on("data", (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-8192);
        if (output.includes(origin)) done();
      });
      child?.stderr?.on("data", (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-8192);
      });
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        started,
        closed.then(() => { throw new Error(`Web entry exited before listening: ${output}`); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Web entry timed out: ${output}`)), 10000); }),
      ]);
    } finally { clearTimeout(timer); }
    expect((await stat(socketPath)).isSocket()).toBe(true);

    const executablePath = process.env.FORGE_BROWSER_EXECUTABLE;
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(10000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(origin);
    await page.locator(".composer-textarea").waitFor();
    expect(await page.title()).toBe("Forge");
    expect(await page.locator(".wb-app").count()).toBe(1);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(csp).toContain(`connect-src 'self' ws://127.0.0.1:${port};`);
    expect(csp).toContain("script-src 'self';");

    const sessions = await page.evaluate(async () => {
      const host = (window as unknown as { forge: { listSessions(): Promise<unknown[]> } }).forge;
      return host.listSessions();
    });
    expect(sessions).toEqual([]);
    await page.keyboard.press("Control+,");
    await page.getByRole("button", { name: "返回工作台", exact: true }).waitFor();
    await page.getByRole("button", { name: "外观", exact: true }).click();
    await page.getByRole("button", { name: "返回工作台", exact: true }).click();
    await page.locator(".composer-textarea").waitFor();
    expect(errors).toEqual([]);
  } finally {
    try { await browser?.close(); } finally {
      if (child && closed) {
        child.kill("SIGTERM");
        const force = setTimeout(() => child?.kill("SIGKILL"), 5000);
        try { await closed; } finally { clearTimeout(force); }
      }
      await rm(directory, { recursive: true, force: true });
    }
  }
});
