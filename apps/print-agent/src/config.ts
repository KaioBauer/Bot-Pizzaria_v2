import { z } from "zod";

const esquema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("production"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  SUPABASE_URL: z.url(),
  /** Chave anon (pública). O acesso real vem do login do usuário "impressora". */
  SUPABASE_ANON_KEY: z.string().min(1),
  IMPRESSORA_EMAIL: z.email(),
  IMPRESSORA_SENHA: z.string().min(12),

  /** "windows:POS-58" (impressora instalada no Windows) ou "tcp://192.168.0.50:9100" (rede) */
  PRINTER_INTERFACE: z.string().regex(/^(windows:.+|tcp:\/\/.+)$/i, "use windows:NOME ou tcp://IP:PORTA"),
  PRINTER_LARGURA_MM: z.enum(["58", "80"]).default("58"),
  /** Sobrescreve as colunas da largura (58 mm = 32, 80 mm = 48). */
  PRINTER_COLUNAS: z.coerce.number().int().min(24).max(64).optional(),
  PRINTER_MODELO: z.enum(["epson", "elgin", "bematech", "star", "generico"]).default("generico"),
  PRINTER_PAGINA_CODIGO: z.enum(["PC860_PORTUGUESE", "PC850_MULTILINGUAL", "WPC1252", "nenhuma"]).default("PC860_PORTUGUESE"),
  PRINTER_AVANCO_CORTE: z.coerce.number().int().min(0).max(10).default(3),
  PRINTER_VIAS: z.coerce.number().int().min(1).max(5).default(1),

  /** Conferência periódica, além do Realtime (garantia contra eventos perdidos). */
  VARREDURA_SEGUNDOS: z.coerce.number().int().min(5).default(30),
});

export type Config = z.output<typeof esquema> & { colunas: number };

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquema.safeParse(env);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Variáveis de ambiente inválidas (ver apps/print-agent/.env.example):\n${problemas}`);
  }
  const config = resultado.data;
  return { ...config, colunas: config.PRINTER_COLUNAS ?? (config.PRINTER_LARGURA_MM === "58" ? 32 : 48) };
}
