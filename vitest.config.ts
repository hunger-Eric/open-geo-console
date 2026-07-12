import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  oxc: false,
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url))
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx"],
    globals: true
  }
});
