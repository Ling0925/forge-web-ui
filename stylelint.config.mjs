/**
 * Focused stylelint rules that guard the design-token contract.
 * Not a style guide: formatting is left to Biome, naming is free.
 * @type {import("stylelint").Config}
 */
export default {
  ignoreFiles: ["dist/**", "node_modules/**"],
  rules: {
    "color-no-invalid-hex": true,
    "function-no-unknown": [true, { ignoreFunctions: ["color-mix"] }],
    "property-no-unknown": true,
    "unit-no-unknown": true,
    "declaration-block-no-duplicate-custom-properties": true,
    "keyframe-declaration-no-important": true,
    "no-invalid-double-slash-comments": true,
    "block-no-empty": true,
    // Type and radius must come from tokens.css scales.
    "declaration-property-value-disallowed-list": [
      {
        "font-size": ["/^\\d+(\\.\\d+)?px$/"],
        "/^border(-(top|bottom)-(left|right))?-radius$/": [
          "/\\d+(\\.\\d+)?px/",
        ],
        // Legacy Tailwind blue / emerald palette banned by the workbench theme.
        "/./": [
          "/#(3b82f6|2563eb|16a34a|059669|10b981)\\b/i",
          "/rgba?\\(\\s*59,\\s*130,\\s*246/",
        ],
      },
      {
        message: (property) =>
          `Use a design token (styles/tokens.css, styles/workspace-theme.css) for ${property}`,
      },
    ],
  },
  overrides: [
    {
      files: ["src/renderer/styles/tokens.css"],
      rules: { "declaration-property-value-disallowed-list": null },
    },
  ],
};
