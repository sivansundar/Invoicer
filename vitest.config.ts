import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost",
      },
    },
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // Anchored at src/ rather than left to Vitest's default glob, which
    // walks the whole project. An agent git worktree under .claude/ carries
    // its own node_modules, and dependencies ship their tests — that pulled
    // in 400+ foreign test files and 100+ failures that had nothing to do
    // with this app.
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    // Spread the defaults rather than replacing them: assigning a bare array
    // drops Vitest's own exclusions (node_modules, dist, build output), and
    // the literal "node_modules/**" that used to sit here only matched a
    // top-level install, never a nested one.
    exclude: [...configDefaults.exclude, "src/test/integration/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
