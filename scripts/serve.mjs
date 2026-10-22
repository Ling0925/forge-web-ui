import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Forge Web UI: --host <IPv4> --port <1024..65535> --workspace <directory> [--renderer <built UI directory>] [--socket <private Unix socket>]\nDefaults: host 127.0.0.1, port 5173, current workspace and this repository's dist/renderer. Run pnpm build first.");
} else {
  // Only supply UI asset/default-workspace locations. Core owns the complete
  // host startup, optional attach socket, request handling and shutdown path.
  if (!args.includes("--workspace")) args.push("--workspace", process.cwd());
  if (!args.includes("--renderer")) args.push("--renderer", resolve(root, "dist/renderer"));
  const renderer = args[args.indexOf("--renderer") + 1];
  if (!renderer || renderer.startsWith("--")) throw new Error("Missing value for --renderer.");
  if (!existsSync(resolve(renderer, "index.html"))) throw new Error("Renderer index.html is missing. Run pnpm build first or supply --renderer.");
  const entry = import.meta.resolve("@forge/core/web/serve");
  process.argv = [process.execPath, fileURLToPath(entry), ...args];
  await import(entry);
}
