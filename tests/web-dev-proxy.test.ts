import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { freePort, launch } from "./fixtures/web-process";

it("checks HTTP and upgrade boundaries before Vite rewrites the Core Host/Origin", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-dev-proxy-"));
  let calls = 0;
  let upgrades = 0;
  const core = createServer((req, res) => {
    calls++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ host: req.headers.host, origin: req.headers.origin, url: req.url }));
  });
  core.on("upgrade", (_req, socket) => { upgrades++; socket.destroy(); });
  let web: ReturnType<typeof launch> | undefined;
  try {
    const corePort = await freePort();
    await new Promise<void>(done => core.listen(corePort, "127.0.0.1", done));
    const coreOrigin = `http://127.0.0.1:${corePort}`;
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    web = launch([resolve("scripts/dev.mjs"), "--port", String(port), "--core-url", coreOrigin], directory, origin, "unused-state");
    await web.ready();
    const rpc = (headers: Record<string, string>) => fetch(`${origin}/api/rpc`, { method: "POST", headers });
    expect((await rpc({})).status).toBe(403);
    expect((await rpc({ Origin: "http://foreign.invalid" })).status).toBe(403);
    // fetch normalizes Host; use node:http to actually send a foreign authority.
    const wrongHost = await new Promise<number | undefined>((done, reject) => {
      const req = request(`${origin}/api/rpc`, { method: "POST", headers: { Origin: origin, Host: "foreign.invalid" } });
      req.once("response", res => { res.resume(); done(res.statusCode); });
      req.once("error", reject);
      req.end();
    });
    expect(wrongHost).toBe(403);
    expect((await rpc({ Origin: "null" })).status).toBe(403);
    expect(calls).toBe(0);
    expect(await (await rpc({ Origin: origin })).json()).toEqual({ host: `127.0.0.1:${corePort}`, origin: coreOrigin, url: "/api/rpc" });
    expect(await (await fetch(`${origin}/preview/sample/index.html`)).json()).toMatchObject({ url: "/preview/sample/index.html" });
    expect(calls).toBe(2);
    const upgrade = (path: string, headers: Record<string, string> = {}) => new Promise<number | undefined>((done, reject) => {
      const req = request(`${origin}${path}`, { headers: {
        Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "AAAAAAAAAAAAAAAAAAAAAA==", ...headers,
      } });
      req.once("response", res => { res.resume(); done(res.statusCode); });
      req.once("upgrade", (_res, socket) => { socket.destroy(); reject(new Error("Unexpected upgrade")); });
      req.once("error", reject);
      req.setTimeout(5000, () => req.destroy(new Error("Upgrade timed out")));
      req.end();
    });
    expect(await upgrade("/api/events")).toBe(404);
    expect(await upgrade("/api/events", { Origin: "http://foreign.invalid" })).toBe(404);
    expect(await upgrade("/api/events", { Origin: origin, Host: "foreign.invalid" })).toBe(404);
    expect(await upgrade("/preview/sample", { Origin: origin })).toBe(404);
    expect(upgrades).toBe(0);
    expect(calls).toBe(2);
    expect(await web.stop()).toBe(0);
  } finally {
    await web?.stop();
    core.closeAllConnections();
    await new Promise<void>(done => core.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});
