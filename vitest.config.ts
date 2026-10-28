import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "apps/web/lib/**/*.test.ts", "apps/web/components/**/*.test.ts"],
    environment: "node",
  },
});
