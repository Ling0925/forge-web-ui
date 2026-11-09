import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { legacyCssLayer } from "./scripts/legacy-css-layer";

const renderer = fileURLToPath(new URL("./src/renderer", import.meta.url));

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [
    // Must run before Tailwind so legacy sheets are layered as authored.
    legacyCssLayer({
      root: renderer,
      exclude: [`${renderer}/styles/ui.css`],
    }),
    tailwindcss(),
    react(),
  ],
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    target: "chrome132",
    sourcemap: false,
  },
});
