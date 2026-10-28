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

    /** Pedido por áudio: transcreve mensagens de voz (OpenAI, mesma chave do LLM). */
    TRANSCRICAO_AUDIO: booleano(true),
    /** whisper-1, gpt-4o-mini-transcribe ou gpt-4o-transcribe */
    OPENAI_TRANSCRICAO_MODELO: z.string().default("whisper-1"),
    /** Áudios mais longos que isso não são transcritos (custo e qualidade). */
    AUDIO_DURACAO_MAXIMA_SEGUNDOS: z.coerce.number().int().min(10).max(600).default(180),

    /** Link do cardápio público enviado pelo bot. Ex.: https://painel.dominio/cardapio */
    CARDAPIO_URL: z.url().optional(),

    CONVERSA_EXPIRACAO_MINUTOS: z.coerce.number().int().positive().default(180),
    HISTORICO_LIMITE: z.coerce.number().int().min(10).default(40),

    /** Pix online (OpenPix/Woovi): ligado quando o AppID existe. */
    OPENPIX_APP_ID: z.string().optional(),
    OPENPIX_AMBIENTE: z.enum(["sandbox", "producao"]).default("sandbox"),
    /** Valor do campo "Authorization" cadastrado no webhook da Woovi (defesa extra, opcional). */
    OPENPIX_WEBHOOK_AUTORIZACAO: z.string().optional(),
    PIX_CONFERENCIA_SEGUNDOS: z.coerce.number().int().min(15).default(60),

    TELEGRAM_ENABLED: booleano(true),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_MODE: z.enum(["polling", "webhook"]).default("polling"),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

    WHATSAPP_ENABLED: booleano(false),
    /** URL da Evolution API, ex.: http://evolution:8080 (rede do docker-compose) */
    EVOLUTION_URL: z.url().optional(),
    EVOLUTION_API_KEY: z.string().optional(),
    EVOLUTION_INSTANCIA: z.string().default("vianna"),
    /** Segredo na URL do webhook configurado na Evolution: <PUBLIC_URL>/webhooks/whatsapp/<token> */
    WHATSAPP_WEBHOOK_TOKEN: z.string().min(16, "use um token longo e aleatório").optional(),
  })
  .superRefine((env, ctx) => {
    const exigir = (campo: keyof typeof env, motivo: string) => {
      if (!env[campo]) ctx.addIssue({ code: "custom", path: [campo], message: `obrigatória ${motivo}` });
    };
    if (env.TELEGRAM_ENABLED) exigir("TELEGRAM_BOT_TOKEN", "com TELEGRAM_ENABLED=true");
    if (env.WHATSAPP_ENABLED) {
      exigir("EVOLUTION_URL", "com WHATSAPP_ENABLED=true");
      exigir("EVOLUTION_API_KEY", "com WHATSAPP_ENABLED=true");
      exigir("WHATSAPP_WEBHOOK_TOKEN", "com WHATSAPP_ENABLED=true");
    }
    if (env.OPENPIX_APP_ID && env.NODE_ENV === "production" && env.OPENPIX_AMBIENTE !== "producao") {
      ctx.addIssue({ code: "custom", path: ["OPENPIX_AMBIENTE"], message: "em produção use OPENPIX_AMBIENTE=producao" });
    }
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
