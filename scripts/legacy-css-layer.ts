/**
 * Puts every legacy renderer stylesheet into the `legacy` cascade layer at
 * build time, so Tailwind utilities (declared in a later layer by
 * `styles/ui.css`) can override them without editing the legacy files.
 *
 * Inside one layer the legacy rules keep their relative source order and
 * specificity, so the existing look is unchanged. `@import` cannot live inside
 * a layer block: relative imports of other renderer sheets are inlined in
 * place (so every bundler sees exactly one `legacy` wrapper), and package
 * imports such as the Geist @font-face sheets are hoisted unchanged.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

const IMPORT = /@import\s+(?:url\()?\s*["']([^"']+)["']\s*\)?\s*;/g;

function collect(
  css: string,
  file: string,
  hoisted: string[],
  seen: Set<string>,
): string {
  return css.replace(IMPORT, (statement, specifier: string) => {
    if (!specifier.startsWith(".")) {
      hoisted.push(statement);
      return "";
    }
    const target = resolve(dirname(file), specifier);
    if (seen.has(target)) return "";
    seen.add(target);
    return collect(readFileSync(target, "utf8"), target, hoisted, seen);
  });
}

export function wrapLegacyCss(
  css: string,
  file: string,
): { readonly code: string; readonly inlined: readonly string[] } {
  const hoisted: string[] = [];
  const seen = new Set<string>([file]);
  const body = collect(css, file, hoisted, seen);
  const head = hoisted.length ? `${hoisted.join("\n")}\n` : "";
  seen.delete(file);
  return { code: `${head}@layer legacy {\n${body}\n}\n`, inlined: [...seen] };
}

export function legacyCssLayer(options: {
  readonly root: string;
  readonly exclude: readonly string[];
}): Plugin {
  const root = options.root.endsWith("/") ? options.root : `${options.root}/`;
  return {
    name: "forge-legacy-css-layer",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0] ?? id;
      if (!file.endsWith(".css") || !file.startsWith(root)) return null;
      if (options.exclude.includes(file)) return null;
      const result = wrapLegacyCss(code, file);
      for (const dependency of result.inlined) this.addWatchFile(dependency);
      return { code: result.code, map: null };
    },
  };
}
