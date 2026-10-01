import { defineConfig } from "tsup";

// Empacota o print-agent e os pacotes do monorepo (que são TypeScript puro) num
// único arquivo ESM; dependências de node_modules ficam externas.
export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
  platform: "node",
  noExternal: [/^@pizzaria\//],
  sourcemap: true,
  clean: true,
});
