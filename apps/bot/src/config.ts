import { z } from "zod";

const booleano = (padrao: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .default(padrao ? "true" : "false")
    .transform((v) => v === "true" || v === "1");

const esquema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().default(3001),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    /** URL pública HTTPS do bot (webhooks). Ex.: https://bot.viannapizzaria.com.br */
    PUBLIC_URL: z.url().optional(),

    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
    /** Só para modelos de raciocínio (gpt-5*). */
    OPENAI_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high"]).default("none"),

    CONVERSA_EXPIRACAO_MINUTOS: z.coerce.number().int().positive().default(180),
    HISTORICO_LIMITE: z.coerce.number().int().min(10).default(40),

    TELEGRAM_ENABLED: booleano(true),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_MODE: z.enum(["polling", "webhook"]).default("polling"),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const exigir = (campo: keyof typeof env, motivo: string) => {
      if (!env[campo]) ctx.addIssue({ code: "custom", path: [campo], message: `obrigatória ${motivo}` });
    };
    if (env.TELEGRAM_ENABLED) exigir("TELEGRAM_BOT_TOKEN", "com TELEGRAM_ENABLED=true");
    if (env.TELEGRAM_ENABLED && env.TELEGRAM_MODE === "webhook") {
      exigir("PUBLIC_URL", "com TELEGRAM_MODE=webhook");
      exigir("TELEGRAM_WEBHOOK_SECRET", "com TELEGRAM_MODE=webhook");
    }
  });

export type Config = z.output<typeof esquema>;

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquema.safeParse(env);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Variáveis de ambiente inválidas (ver apps/bot/.env.example):\n${problemas}`);
  }
  return resultado.data;
}
