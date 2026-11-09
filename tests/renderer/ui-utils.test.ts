import { describe, expect, it } from "vitest";
import { cn } from "#lib/utils";
import { wrapLegacyCss } from "../../scripts/legacy-css-layer";

describe("phase 0 UI infrastructure", () => {
  it("cn resolves through package.json#imports and merges Tailwind classes", () => {
    const hidden: boolean = Date.now() < 0;
    expect(cn("px-2 text-sm", hidden && "hidden", ["px-4"])).toBe(
      "text-sm px-4",
    );
  });

  it("wraps legacy CSS in one legacy layer and hoists package imports", () => {
    const { code, inlined } = wrapLegacyCss(
      '@import "@fontsource-variable/geist";\n.a { color: red; }',
      "/virtual/a.css",
    );
    expect(code).toBe(
      '@import "@fontsource-variable/geist";\n@layer legacy {\n\n.a { color: red; }\n}\n',
    );
    expect(inlined).toEqual([]);
  });
});
