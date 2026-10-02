import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@pizzaria/db";
import pino from "pino";
import { criarAgenteImpressao } from "./agente";
import { carregarConfig } from "./config";
import { criarImpressora } from "./impressora";

// .env ao lado de src/ e dist/ (funciona em dev, no build e como serviço do Windows).
// Variáveis já definidas no ambiente têm prioridade.
const arquivoEnv = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
if (existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

const config = carregarConfig();

const logger = pino({
  level: config.LOG_LEVEL,
  ...(config.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } } }
    : {}),
});

// Client com sessão do usuário "impressora" (RLS), não service_role.
const db = createClient<Database>(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
});

const agente = criarAgenteImpressao({
  db,
  impressora: criarImpressora({
    interface: config.PRINTER_INTERFACE,
    colunas: config.colunas,
    modelo: config.PRINTER_MODELO,
    paginaCodigo: config.PRINTER_PAGINA_CODIGO,
    avancoAntesDoCorte: config.PRINTER_AVANCO_CORTE,
  }),
  logger,
  credenciais: { email: config.IMPRESSORA_EMAIL, senha: config.IMPRESSORA_SENHA },
  colunas: config.colunas,
  vias: config.PRINTER_VIAS,
  varreduraMs: config.VARREDURA_SEGUNDOS * 1000,
  ...(config.PAINEL_URL ? { painelUrl: config.PAINEL_URL } : {}),
});

async function desligar(sinal: string) {
  logger.info({ sinal }, "Desligando print-agent...");
  await agente.parar();
  process.exit(0);
}
process.once("SIGINT", () => void desligar("SIGINT"));
process.once("SIGTERM", () => void desligar("SIGTERM"));

logger.info({ impressora: config.PRINTER_INTERFACE, colunas: config.colunas, vias: config.PRINTER_VIAS }, "Print-agent iniciando");
await agente.iniciar();
