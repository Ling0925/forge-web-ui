import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "@forge/core/core/harness";
import { validLanEndpoint } from "@forge/core/web/lan";
import { createWebHost } from "@forge/core/web/server";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
function argument(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`Missing value for ${name}.`);
  return value;
}

if (args.includes("--help")) {
  console.log(
    "Forge Web UI serve: --host <IPv4> --port <1024..65535> --workspace <directory> [--renderer <dist/renderer>]\n" +
      "Defaults: host 127.0.0.1, port 5173, workspace current directory. Run pnpm build first.",
  );
  process.exit(0);
}

const host = argument("--host", "127.0.0.1");
const port = Number(argument("--port", "5173"));
const workspace = resolve(argument("--workspace", process.cwd()));
const rendererRoot = resolve(
  argument("--renderer", resolve(root, "dist/renderer")),
);
if (!validLanEndpoint(host, port)) {
  throw new Error(
    "Use a specific IPv4 address (not 0.0.0.0) and a port between 1024 and 65535.",
  );
}
if (!existsSync(resolve(rendererRoot, "index.html"))) {
  throw new Error(
    `Missing ${resolve(rendererRoot, "index.html")}. Run pnpm build first.`,
  );
}

const service = await createHarness();
const web = await createWebHost({
  service,
  workspace,
  host,
  port,
  rendererRoot,
});

web.server.on("request", (request, response) => {
  void web
    .handle(request, response, () => {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    })
    .catch(() => {
      if (response.headersSent) response.destroy();
      else {
        response.writeHead(500);
        response.end("Web service unavailable");
      }
    });
});

try {
  await new Promise((done, reject) => {
    web.server.once("error", reject);
    web.server.listen(port, host, done);
  });
} catch (error) {
  await web.dispose();
  throw error;
}

console.log(`Forge Web UI: ${web.origin}`);
console.log(`Workspace: ${web.workspace}`);
console.log(`Renderer: ${rendererRoot}`);
console.log("Personal LAN direct access; HTTP is not confidential.");

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void web.dispose().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}
