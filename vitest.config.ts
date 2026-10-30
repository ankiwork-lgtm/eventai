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
      include: [
        "lib/**/*.ts",
        "app/api/**/*.ts",
        "hooks/**/*.ts",
        "components/**/*.{ts,tsx}",
      ],
      exclude: [
        "lib/fixtures/**",
        // Pure shell: root layout only wires fonts/providers, nothing to unit test.
        "app/layout.tsx",
        // Vendored shadcn/ui primitives; covered upstream.
        "components/ui/**",
      ],
      reporter: ["text", "html"],
      // Per-glob regression gates. The original lib/app-api gates are kept as-is;
      // hooks and components get their own, set 1-2 points under measured values
      // (hooks: stmts 90.0 / br 76.4 / fn 94.3 / lines 91.3;
      //  components: stmts 86.4 / br 80.7 / fn 81.0 / lines 89.1).
      // Raise as component/hook tests grow.
      thresholds: {
        "lib/**": { lines: 91, functions: 95, statements: 90, branches: 78 },
        "app/api/**": { lines: 91, functions: 95, statements: 90, branches: 78 },
        "hooks/**": { lines: 89, functions: 92, statements: 88, branches: 74 },
        "components/**": {
          lines: 87,
          functions: 79,
          statements: 84,
          branches: 78,
        },
      },
    },
  },
});
