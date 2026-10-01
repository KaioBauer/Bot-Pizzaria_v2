import Fastify, { type FastifyBaseLogger } from "fastify";
import pino from "pino";
import {
  criarAgente,
  criarCacheChavesOpenPix,
  criarGatewayOpenPix,
  criarProvedorOpenAi,
  criarServicoPix,
  type RespostaAgente,
} from "@pizzaria/core";
import { criarClienteServico, criarRepositorios } from "@pizzaria/db";
import { criarAdaptadorTelegram } from "./canais/telegram";
import type { ChannelAdapter } from "./canais/tipos";
import { criarAdaptadorWhatsapp } from "./canais/whatsapp";
import { carregarConfig } from "./config";
import { criarNotificador } from "./notificador";
import { registrarPix } from "./pix";
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

const pix = config.OPENPIX_APP_ID
  ? criarServicoPix({
      gateway: criarGatewayOpenPix({ appId: config.OPENPIX_APP_ID, ambiente: config.OPENPIX_AMBIENTE }),
      repos,
      logger: logger.child({ modulo: "pix" }),
    })
  : undefined;

const agente = criarAgente({
  repos,
  llm: criarProvedorOpenAi({
    apiKey: config.OPENAI_API_KEY,
    modelo: config.OPENAI_MODEL,
    esforcoRaciocinio: config.OPENAI_REASONING_EFFORT,
  }),
  logger: logger.child({ modulo: "agente" }),
  ...(pix ? { pix } : {}),
  opcoes: {
    expiracaoConversaMinutos: config.CONVERSA_EXPIRACAO_MINUTOS,
    limiteHistorico: config.HISTORICO_LIMITE,
    ...(config.CARDAPIO_URL ? { urlCardapio: config.CARDAPIO_URL } : {}),
  },
});

const servidor = Fastify({
  loggerInstance: logger.child({ modulo: "http" }) as FastifyBaseLogger,
  disableRequestLogging: true,
  trustProxy: true,
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
if (config.WHATSAPP_ENABLED) {
  canais.set(
    "whatsapp",
    criarAdaptadorWhatsapp({
      urlApi: config.EVOLUTION_URL!,
      apiKey: config.EVOLUTION_API_KEY!,
      instancia: config.EVOLUTION_INSTANCIA,
      tokenWebhook: config.WHATSAPP_WEBHOOK_TOKEN!,
      logger: logger.child({ modulo: "whatsapp" }),
    })
  );
}
if (canais.size === 0) logger.warn("Nenhum canal habilitado");

async function entregar(canal: ChannelAdapter, chatId: string, resposta: RespostaAgente) {
  await canal.sendMessage(chatId, resposta.texto);
  for (const anexo of resposta.anexos ?? []) {
    if (anexo.tipo === "imagem") {
      await canal.sendImage?.(chatId, {
        conteudo: Buffer.from(anexo.base64, "base64"),
        tipoMime: anexo.mime,
        ...(anexo.legenda ? { legenda: anexo.legenda } : {}),
      });
    } else {
      // Texto exato (ex.: Pix copia e cola): sem formatação, que alteraria o código.
      await canal.sendMessage(chatId, anexo.texto, { literal: true });
    }
  }
}

const processador = criarProcessadorPorChat(async (mensagem) => {
  const canal = canais.get(mensagem.canal)!;
  const log = logger.child({ canal: mensagem.canal, chatId: mensagem.chatId });
  const inicio = Date.now();

  // "digitando..." expira em poucos segundos; renova enquanto o agente pensa.
  void canal.indicarDigitando?.(mensagem.chatId);
  const digitando = setInterval(() => void canal.indicarDigitando?.(mensagem.chatId), 4500);
  try {
    const resposta = await agente.processarMensagem(mensagem);
    clearInterval(digitando);
    await entregar(canal, mensagem.chatId, resposta);
    log.info(
      { ms: Date.now() - inicio, ...(resposta.pedido ? { pedido: resposta.pedido.numero, pix: Boolean(resposta.pedido.pix) } : {}) },
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
const pagamentos = pix
  ? registrarPix({
      servidor,
      db,
      pix,
      logger: logger.child({ modulo: "pix" }),
      chavesPublicas: criarCacheChavesOpenPix(config.OPENPIX_AMBIENTE),
      ...(config.OPENPIX_WEBHOOK_AUTORIZACAO ? { autorizacaoWebhook: config.OPENPIX_WEBHOOK_AUTORIZACAO } : {}),
      conferenciaMs: config.PIX_CONFERENCIA_SEGUNDOS * 1000,
    })
  : null;

async function desligar(sinal: string) {
  logger.info({ sinal }, "Desligando...");
  await pagamentos?.parar();
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
pagamentos?.iniciar();
logger.info(
  { porta: config.PORT, canais: [...canais.keys()], pix: pix ? `openpix (${config.OPENPIX_AMBIENTE})` : false },
  "Bot no ar"
);
