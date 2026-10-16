import { defaultClientConditions, defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [
    tanstackStart({
      spa: { enabled: true, prerender: { outputPath: "/index.html" } },
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    // Both speech workers supply pinned wasmPaths. Exclude ORT's embedded
    // fallback factories and unused WASM variants from their bundles.
    conditions: ["onnxruntime-web-use-extern-wasm", ...defaultClientConditions],
  },
  base: process.env.BASE_PATH || "/",
  build: {
    outDir: ".start",
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /\/node_modules\/(?:react|react-dom|scheduler)\//,
            },
          ],
        },
      },
    },
  },
});
