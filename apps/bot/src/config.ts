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
    OPENAI_MODEL: z.string().default("gpt-5.4"),
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
    /**
     * Página de pedido por link. Ex.: https://painel.dominio/pedir — vai no aviso do
     * WhatsApp (link de acompanhamento). Sem ela, deriva do CARDAPIO_URL.
     */
    PEDIR_URL: z.url().optional(),

    /**
     * Espera o cliente terminar de digitar: segundos sem mensagem nova antes de
     * responder (cada mensagem reinicia a conta), com um teto desde a primeira.
     */
    MENSAGEM_ESPERA_SEGUNDOS: z.coerce.number().min(0).max(30).default(5),
    MENSAGEM_ESPERA_MAXIMA_SEGUNDOS: z.coerce.number().min(0).max(120).default(20),
    CONVERSA_EXPIRACAO_MINUTOS: z.coerce.number().int().positive().default(180),
    HISTORICO_LIMITE: z.coerce.number().int().min(10).default(40),

    /**
     * Pix simulado (sem dinheiro de verdade): o bot faz o papel do banco. O cliente
     * recebe QR e copia e cola de verdade; o pagamento é feito no painel, em "Banco simulado".
     */
    PIX_SIMULADO: booleano(false),
    /** Chave Pix aleatória fictícia do recebedor (vai dentro do BR Code). */
    PIX_SIMULADO_CHAVE: z.uuid().default("7d9f0335-8dcc-4054-9bf9-0dbd61d36906"),
    /** Cidade do recebedor no BR Code (o app do banco mostra). */
    PIX_SIMULADO_CIDADE: z.string().min(1).max(15).default("SAO PAULO"),
    /** Segredo do HMAC dos webhooks; sem ele, um aleatório a cada início do bot. */
    PIX_SIMULADO_SEGREDO: z.string().min(16).optional(),
    /** Fração de webhooks descartados de propósito (0 a 1), para testar a conferência periódica. */
    PIX_SIMULADO_PERDA_WEBHOOK: z.coerce.number().min(0).max(1).default(0),
    PIX_CONFERENCIA_SEGUNDOS: z.coerce.number().int().min(15).default(60),

    /** Único canal de conversa; desligar só para rodar o bot sem a Evolution (ex.: testar o Pix). */
    WHATSAPP_ENABLED: booleano(true),
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
    if (env.WHATSAPP_ENABLED) {
      exigir("EVOLUTION_URL", "com WHATSAPP_ENABLED=true");
      exigir("EVOLUTION_API_KEY", "com WHATSAPP_ENABLED=true");
      exigir("WHATSAPP_WEBHOOK_TOKEN", "com WHATSAPP_ENABLED=true");
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
