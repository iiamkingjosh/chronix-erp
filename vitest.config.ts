import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup/env.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Emulator state (counters, journal entries) is shared across files in
    // a single emulator instance — keep test files sequential to avoid
    // cross-file interference. Tests within a file still run in order.
    fileParallelism: false,
  },
});
