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
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["lib/fixtures/**"],
      reporter: ["text", "html"],
    },
  },
});
