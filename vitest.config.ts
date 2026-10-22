import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    env: {
      NODE_ENV: "test",
      DEMO_MODE: "true",
      PAYMENTS_PROVIDER: "mock",
      EMAIL_PROVIDER: "console",
      // Tests never talk to a real database server or the real payment gateway.
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
