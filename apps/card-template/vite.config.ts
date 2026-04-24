import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const currentDir = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  server: {
    fs: {
      allow: [resolve(currentDir, "..")],
    },
  },
  build: {
    target: "es2015",
  },
  plugins: [
    svelte({ compilerOptions: { runes: true } }),
    viteSingleFile(),
  ],
});
