import { defineConfig } from "vitest/config";

// Relative base so the build works from any sub-path, including the Arcade's.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
  test: { environment: "node", include: ["tests/unit/**/*.test.ts"] },
});
