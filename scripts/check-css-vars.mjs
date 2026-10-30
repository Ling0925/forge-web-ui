#!/usr/bin/env node
// Fails when a CSS custom property is referenced with var(--name) but never
// defined anywhere in src/renderer (CSS declarations, or a "--name" key /
// setProperty("--name") in TS/TSX for runtime-set properties).
// An undefined property silently invalidates its declaration at runtime.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../src/renderer", import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(css|tsx?)$/.test(name)) files.push(path);
  }
})(root);

const defined = new Set();
const uses = new Map();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const isCss = file.endsWith(".css");
  const defPattern = isCss
    ? /(--[A-Za-z0-9_-]+)\s*:/g
    : /["'`](--[A-Za-z0-9_-]+)["'`]/g;
  for (const match of text.matchAll(defPattern)) defined.add(match[1]);
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
      const list = uses.get(match[1]) ?? [];
      list.push(`${relative(process.cwd(), file)}:${index + 1}`);
      uses.set(match[1], list);
    }
  });
}

const missing = [...uses.keys()].filter((name) => !defined.has(name)).sort();
if (missing.length === 0) {
  console.log(
    `check-css-vars: ${uses.size} custom properties referenced, all defined.`,
  );
  process.exit(0);
}
console.error(`check-css-vars: ${missing.length} undefined custom properties:`);
for (const name of missing) {
  const where = uses.get(name) ?? [];
  console.error(
    `  ${name}  (${where.length}x) ${where.slice(0, 3).join(", ")}${where.length > 3 ? ", ..." : ""}`,
  );
}
process.exit(1);
