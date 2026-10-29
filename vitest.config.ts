import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // `server-only` throws under the jsdom "browser" export condition. Tests
      // exercise server-side logic directly, so alias it to the package's no-op
      // entry (the same module Next uses under the react-server condition). The
      // real guard still protects the production client bundle.
      "server-only": path.resolve(
        __dirname,
        "node_modules/server-only/empty.js",
      ),
    },
  },
  test: {
    environment: "jsdom",
    pool: "vmThreads",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["lib/fixtures/**"],
      reporter: ["text", "html"],
      // Regression gate, set just below measured coverage (stmts 90.9 / branch 79.8 /
      // funcs 97.2 / lines 91.9). Branches is the weak spot (lib/schema.ts timeline
      // transform, lib/export.ts); raise toward 85 as those gain tests.
      thresholds: {
        lines: 91,
        functions: 95,
        statements: 90,
        branches: 78,
      },
    },
  },
});
