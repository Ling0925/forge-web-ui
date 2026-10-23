import { createRequire } from "node:module";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const coreRoot = dirname(require.resolve("@forge/core/package.json"));
const args = process.argv.slice(2);
const { values } = parseArgs({
  args: args[0] === "--" ? args.slice(1) : args,
  options: {
    help: { type: "boolean" },
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string", default: "5173" },
    "core-url": { type: "string" },
  },
});
if (values.help) {
  console.log("Forge Web UI dev: --core-url <http://127.0.0.1:port> [--host <IPv4>] [--port <1024..65535>]\nVite HMR for this repository's src/renderer; no UI build needed. Start Core separately with --workspace. Restarting Web never stops Core tasks. Development on a trusted LAN only.");
  process.exit(0);
}
if (!values["core-url"]) throw new Error("Missing --core-url. Start Forge Core separately; Web never creates a runtime.");
const host = values.host;
const port = Number(values.port);
if (isIP(host) !== 4 || host === "0.0.0.0" || !Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Use a specific IPv4 address (not 0.0.0.0) and a port between 1024 and 65535.");
const origin = `http://${host}:${port}`;
const core = new URL(values["core-url"]);
if (core.origin !== values["core-url"] || core.protocol !== "http:" || isIP(core.hostname) !== 4 || !core.hostname.startsWith("127.") || Number(core.port) < 1024 || !core.port || core.origin === origin)
  throw new Error("--core-url must be a different loopback HTTP IPv4 origin with an explicit port, without credentials, path, query or fragment.");

function singleHeader(request, name) {
  let count = 0;
  for (let i = 0; i < request.rawHeaders.length; i += 2)
    if (request.rawHeaders[i].toLowerCase() === name) count++;
  return count <= 1;
}
function allowed(request) {
  const url = request.url ?? "";
  const suppliedOrigin = request.headers.origin;
  return request.headers.host === `${host}:${port}` && singleHeader(request, "host") &&
    url.startsWith("/") && !url.startsWith("//") && !url.includes("#") &&
    singleHeader(request, "origin") &&
    (suppliedOrigin === undefined || suppliedOrigin === origin) &&
    (!url.startsWith("/api/") || suppliedOrigin === origin);
}

const sockets = new Set();
const vite = await createViteServer({
  configFile: false,
  envFile: false,
  root: resolve(root, "src/renderer"),
  base: "/",
  plugins: [react(), {
    name: "forge-web-dev-boundary",
    configureServer(server) {
      // This runs before Vite's proxy. Do not turn foreign/missing Origins into
      // a trusted Core Origin merely because requests pass through this host.
      server.middlewares.use((request, response, next) => {
        if (allowed(request)) return next();
        response.writeHead(403, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
        response.end("Unexpected Host or Origin");
      });
      server.httpServer.on("connection", socket => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
      });
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        // Development-only React Refresh and Vite's restart-polling SharedWorker.
        // Keep the production HTML's script/connect/worker restrictions intact.
        return html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline'; worker-src 'self' blob:;")
          .replace("connect-src 'none';", `connect-src 'self' ws://${host}:${port};`);
      },
    },
  }],
  server: {
    host, port, strictPort: true,
    allowedHosts: [host],
    cors: false,
    hmr: { host, clientPort: port, path: "/__forge_hmr" },
    proxy: {
      "^/(?:api/|preview(?:/|\\?|$)|favicon\\.ico(?:\\?|$))": {
        target: core.origin,
        changeOrigin: true,
        ws: true,
        rewriteWsOrigin: true,
        // Vite invokes bypass for upgrades as well as HTTP. Reject before any
        // upstream connection; HMR has its own route and Vite's token checks.
        bypass(request, response) {
          if (!response && (!allowed(request) || request.method !== "GET" || request.url?.split("?")[0] !== "/api/events")) return false;
        },
        configure(proxy) {
          proxy.on("proxyReq", upstream => upstream.setHeader("Origin", core.origin));
        },
      },
    },
    fs: {
      strict: true,
      allow: [root, coreRoot],
      deny: ["**/.env*", "**/*.{crt,pem,key}", "**/.git/**", "**/.local/**", "**/.config/**", "**/.build/**"],
    },
  },
});
async function close() {
  // Close only frontend transports, including proxied upgraded sockets.
  for (const socket of sockets) socket.destroy();
  await vite.close();
}
try {
  await vite.listen();
} catch (error) {
  await close();
  throw error;
}
console.log(`Forge Web UI Dev: ${origin}`);
console.log(`Independent Core: ${core.origin}`);
console.log(`HMR source: ${resolve(root, "src/renderer")}`);
console.log("Vite HMR is development-only; HTTP is not confidential. Web shutdown never stops Core tasks.");
let stopping = false;
// Close first so Vite unregisters its own SIGTERM exit callback; intentional
// service stops should finish with zero rather than race Vite's exit(143).
for (const signal of ["SIGINT", "SIGTERM"]) process.prependListener(signal, () => {
  if (stopping) return;
  stopping = true;
  void close().then(() => process.exit(0), () => process.exit(1));
});
