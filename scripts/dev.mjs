import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "@forge/core/core/harness";
import { validLanEndpoint } from "@forge/core/web/lan";
import { createWebHost } from "@forge/core/web/server";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const coreRoot = dirname(require.resolve("@forge/core/package.json"));

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
    "Forge Web UI dev: --host <IPv4> --port <1024..65535> --workspace <directory>\n" +
      "Defaults: host 127.0.0.1, port 5173, workspace current directory. Development only.",
  );
  process.exit(0);
}

const host = argument("--host", "127.0.0.1");
const port = Number(argument("--port", "5173"));
const workspace = resolve(argument("--workspace", process.cwd()));
if (!validLanEndpoint(host, port)) {
  throw new Error(
    "Use a specific IPv4 address (not 0.0.0.0) and a port between 1024 and 65535.",
  );
}

const service = await createHarness();
const web = await createWebHost({
  service,
  workspace,
  host,
  port,
  restrictWorkspace: false,
});

let vite;
try {
  vite = await createViteServer({
    configFile: false,
    root: resolve(root, "src/renderer"),
    base: "/",
    plugins: [
      react(),
      {
        name: "forge-web-dev-csp",
        transformIndexHtml: {
          order: "pre",
          handler(html) {
            // Only this Web dev host relaxes the file-origin desktop CSP for React HMR.
            return html
              .replace(
                "script-src 'self';",
                "script-src 'self' 'unsafe-inline';",
              )
              .replace(
                "connect-src 'none';",
                `connect-src 'self' ws://${host}:${port};`,
              );
          },
        },
      },
    ],
    server: {
      middlewareMode: true,
      allowedHosts: [host],
      hmr: { server: web.server, host, port },
      fs: {
        strict: true,
        allow: [root, coreRoot],
        deny: [
          "**/.env*",
          "**/*.{crt,pem,key}",
          "**/.git/**",
          "**/.local/**",
          "**/.config/**",
          "**/.build/**",
        ],
      },
    },
  });
} catch (error) {
  await web.dispose();
  throw error;
}

web.server.on("request", (request, response) => {
  void web
    .handle(request, response, () => vite.middlewares(request, response))
    .catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end("Web service unavailable");
    });
});

try {
  await new Promise((done, reject) => {
    web.server.once("error", reject);
    web.server.listen(port, host, done);
  });
} catch (error) {
  await Promise.allSettled([vite.close(), web.dispose()]);
  throw error;
}

console.log(`Forge Web UI Dev: ${web.origin}`);
console.log(`Workspace: ${web.workspace}`);
console.log("Vite HMR is development-only; HTTP is not confidential.");

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void Promise.allSettled([vite.close(), web.dispose()]).then(() =>
      process.exit(0),
    );
  });
}
