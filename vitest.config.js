import { defineConfig } from "vitest/config";

// Unit-Tests: schnell, ohne Server. Integrationstests (echte PocketBase): npm run test:integration
export default defineConfig({
  test: {
    include: ["src/**/*.test.js"],
  },
});
