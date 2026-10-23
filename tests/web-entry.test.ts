import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("requires an explicit independent Core and never creates state for old embedded-runtime arguments", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-web-entry-"));
  try {
    const invoke = (args: string[]) => spawnSync(process.execPath, [resolve("scripts/serve.mjs"), ...args], {
      cwd: directory, encoding: "utf8", timeout: 5000,
      env: { PATH: process.env.PATH, HOME: directory, FORGE_HOME: join(directory, "state") },
    });
    const help = invoke(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--core-url");
    const missing = invoke([]);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("Missing --core-url");
    const embedded = invoke(["--workspace", directory]);
    expect(embedded.status).not.toBe(0);
    expect(embedded.stderr).toContain("Unknown option");
    expect(await readdir(directory)).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
