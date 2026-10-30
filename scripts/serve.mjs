import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const { values } = parseArgs({
  args: args[0] === "--" ? args.slice(1) : args,
  options: {
    help: { type: "boolean" },
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string", default: "5173" },
    renderer: { type: "string", default: resolve(root, "dist/renderer") },
    "core-url": { type: "string" },
  },
});
if (values.help) {
  console.log(
    "Forge Web UI: --core-url <http://127.0.0.1:port> [--host <IPv4>] [--port <1024..65535>] [--renderer <built UI directory>]\nDefaults: host 127.0.0.1, port 5173 and this repository's dist/renderer. Run pnpm build first.\nStart Core separately with --workspace (and optionally --multi-workspace/--socket). This process only serves the UI and proxies requests; stopping it never stops Core tasks.",
  );
} else {
  if (!values["core-url"])
    throw new Error(
      "Missing --core-url. Start Forge Core separately; Web never creates a runtime or falls back to an embedded Core.",
    );
  const rendererRoot = resolve(values.renderer);
  if (!existsSync(resolve(rendererRoot, "index.html")))
    throw new Error(
      "Renderer index.html is missing. Run pnpm build first or supply --renderer.",
    );
  // The gateway implementation belongs to Core, but owns no runtime or store.
  const { createWebGateway } = await import("@forge/core/web/gateway");
  const gateway = await createWebGateway({
    host: values.host,
    port: Number(values.port),
    coreUrl: values["core-url"],
    rendererRoot,
  });
  try {
    await new Promise((done, reject) => {
      const fail = (error) => reject(error);
      gateway.server.once("error", fail);
      gateway.server.listen(Number(values.port), values.host, () => {
        gateway.server.off("error", fail);
        done();
      });
    });
  } catch (error) {
    await gateway.close();
    throw error;
  }
  console.log(`Forge Web UI: ${gateway.origin}`);
  console.log(`Independent Core: ${values["core-url"]}`);
  console.log(
    "Restarting Web only disconnects browsers; accepted tasks continue in Core. Personal LAN access is unencrypted and trusted.",
  );
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      void gateway.close().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
}
