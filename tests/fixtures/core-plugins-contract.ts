import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "esbuild";

const builtContract = resolve("../forge-core/dist/shared/plugins.js");
const sourceContract = resolve("../forge-core/src/shared/plugins.ts");

/**
 * Renderer imports the browser-safe Core contract through the package export
 * map. The production build requires Core's `dist`, but a Core checkout that
 * has not been rebuilt yet still has the identical source module. Tests use the
 * built artifact whenever it exists and only fall back to the source in that
 * pre-build window, so this never masks a stale or broken published contract.
 */
export function corePluginsContractPlugin(): Plugin {
  return {
    name: "core-plugins-contract-resolution",
    setup(api) {
      api.onResolve({ filter: /^@forge\/core\/shared\/plugins$/ }, () => ({
        path: existsSync(builtContract) ? builtContract : sourceContract,
      }));
    },
  };
}
