import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname) },
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
