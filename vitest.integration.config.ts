import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  test: {
    environment: "node",
    include: ["src/test/integration/**/*.test.ts"],
    // Vitest only autoloads VITE_-prefixed vars by default; load everything
    // from .env.test.local (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, etc.)
    // the same way Vite would if given an empty prefix.
    env: { NODE_ENV: "test", ...loadEnv(mode, process.cwd(), "") },
    envDir: process.cwd(),
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
}));
