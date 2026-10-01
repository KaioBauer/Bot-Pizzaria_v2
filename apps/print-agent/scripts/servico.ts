/**
 * Instala/remove o print-agent como serviço do Windows (inicia com o PC e
 * reinicia sozinho se cair). Rodar num terminal "Executar como administrador":
 *   pnpm --filter @pizzaria/print-agent servico:instalar
 *   pnpm --filter @pizzaria/print-agent servico:remover
 * Logs: apps/print-agent/logs/
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Service } from "node-windows";

const raiz = resolve(import.meta.dirname, "..");
const logs = resolve(raiz, "logs");
mkdirSync(logs, { recursive: true });

const servico = new Service({
  name: "Vianna Print Agent",
  description: "Imprime automaticamente os pedidos da Vianna Pizzaria.",
  script: resolve(raiz, "dist/index.js"),
  workingDirectory: raiz,
  logpath: logs,
  // Reinício com espera crescente (2s, 3s, 4.5s...) e sem desistir.
  wait: 2,
  grow: 0.5,
  maxRestarts: 1000,
});

const acao = process.argv[2];
servico.on("install", () => {
  servico.start();
  console.log('Serviço instalado e iniciado. Veja em "Serviços" (services.msc): Vianna Print Agent');
});
servico.on("alreadyinstalled", () => console.log("O serviço já está instalado. Para atualizar: servico:remover e servico:instalar."));
servico.on("uninstall", () => console.log("Serviço removido."));
servico.on("error", (erro: unknown) => console.error("Erro:", erro));

if (acao === "instalar") servico.install();
else if (acao === "remover") servico.uninstall();
else console.error("Uso: tsx scripts/servico.ts instalar|remover");
