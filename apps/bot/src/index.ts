import Fastify, { type FastifyBaseLogger } from "fastify";
import pino from "pino";
import { criarAgente, criarProvedorOpenAi } from "@pizzaria/core";
import { criarClienteServico, criarRepositorios } from "@pizzaria/db";
import { criarAdaptadorTelegram } from "./canais/telegram";
import type { ChannelAdapter } from "./canais/tipos";
import { carregarConfig } from "./config";
import { criarNotificador } from "./notificador";
import { criarProcessadorPorChat } from "./processador";

const config = carregarConfig();

const logger = pino({
  level: config.LOG_LEVEL,
  ...(config.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } } }
    : {}),
});

const db = criarClienteServico(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const repos = criarRepositorios(db);
const agente = criarAgente({
  repos,
  llm: criarProvedorOpenAi({
    apiKey: config.OPENAI_API_KEY,
    modelo: config.OPENAI_MODEL,
    esforcoRaciocinio: config.OPENAI_REASONING_EFFORT,
  }),
  logger: logger.child({ modulo: "agente" }),
  opcoes: {
    expiracaoConversaMinutos: config.CONVERSA_EXPIRACAO_MINUTOS,
    limiteHistorico: config.HISTORICO_LIMITE,
  },
});

const servidor = Fastify({
  loggerInstance: logger.child({ modulo: "http" }) as FastifyBaseLogger,
  disableRequestLogging: true,
});
servidor.get("/health", async () => ({ ok: true }));

const canais = new Map<string, ChannelAdapter>();
if (config.TELEGRAM_ENABLED) {
  canais.set(
    "telegram",
    criarAdaptadorTelegram({
      token: config.TELEGRAM_BOT_TOKEN!,
      modo: config.TELEGRAM_MODE,
      urlPublica: config.PUBLIC_URL,
      segredoWebhook: config.TELEGRAM_WEBHOOK_SECRET,
      logger: logger.child({ modulo: "telegram" }),
    })
  );
}
if (canais.size === 0) logger.warn("Nenhum canal habilitado");

const processador = criarProcessadorPorChat(async (mensagem) => {
  const canal = canais.get(mensagem.canal)!;
  const log = logger.child({ canal: mensagem.canal, chatId: mensagem.chatId });
  const inicio = Date.now();

  // "digitando..." expira em ~5s no Telegram; renova enquanto o agente pensa.
  void canal.indicarDigitando?.(mensagem.chatId);
  const digitando = setInterval(() => void canal.indicarDigitando?.(mensagem.chatId), 4500);
  try {
    const resposta = await agente.processarMensagem(mensagem);
    await canal.sendMessage(mensagem.chatId, resposta.texto);
    log.info(
      { ms: Date.now() - inicio, ...(resposta.pedido ? { pedido: resposta.pedido.numero } : {}) },
      "Mensagem respondida"
    );
  } catch (err) {
    log.error({ err }, "Falha ao responder mensagem");
  } finally {
    clearInterval(digitando);
  }
});

for (const canal of canais.values()) canal.onMessage((mensagem) => processador.receber(mensagem));

const notificador = criarNotificador({ db, canais, logger: logger.child({ modulo: "notificacoes" }) });

async function desligar(sinal: string) {
  logger.info({ sinal }, "Desligando...");
  await notificador.parar();
  await Promise.allSettled([...canais.values()].map((c) => c.parar()));
  await processador.ocioso();
  await servidor.close();
  process.exit(0);
}
process.once("SIGINT", () => void desligar("SIGINT"));
process.once("SIGTERM", () => void desligar("SIGTERM"));

for (const canal of canais.values()) await canal.iniciar(servidor);
await servidor.listen({ port: config.PORT, host: "0.0.0.0" });
await notificador.iniciar();
logger.info({ porta: config.PORT, canais: [...canais.keys()] }, "Bot no ar");
