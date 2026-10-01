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
  // Não apaga dist/daemon/: o node-windows guarda ali os arquivos do serviço.
  clean: false,
});
