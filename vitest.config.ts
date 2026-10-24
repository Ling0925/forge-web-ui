import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * `@forge/core/shared/plugins` is a browser-safe Core contract. Production
 * builds require Core's `dist`; a Core checkout that has not been rebuilt yet
 * still ships the identical source module, so Node-side unit tests resolve the
 * built artifact when present and otherwise the source. The browser-side
 * mounted tests do the same through `tests/fixtures/core-plugins-contract.ts`.
 */
const builtPluginsContract = resolve("../forge-core/dist/shared/plugins.js");

export default defineConfig({
  resolve: {
    alias: existsSync(builtPluginsContract)
      ? {}
      : {
          "@forge/core/shared/plugins": resolve(
            "../forge-core/src/shared/plugins.ts",
          ),
        },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "src/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 20000,
  },
});
