import Fastify, { type FastifyBaseLogger } from "fastify";
import pino from "pino";
import {
  criarAgente,
  criarPixSimulado,
  criarProvedorOpenAi,
  criarServicoPix,
  criarTranscritorOpenAi,
  type RespostaAgente,
} from "@pizzaria/core";
import { randomBytes } from "node:crypto";
import { criarClienteServico, criarCobrancasSimuladasRepo, criarRepositorios } from "@pizzaria/db";
import type { ChannelAdapter } from "./canais/tipos";
import { criarAdaptadorWhatsapp } from "./canais/whatsapp";
import { contasSupabase, identificarAdminSupabase, registrarAdminUsuarios } from "./admin-usuarios";
import { registrarAdminWhatsapp, validarAdminSupabase } from "./admin-whatsapp";
import { criarPreparadorMensagens } from "./audio";
import { carregarConfig } from "./config";
import { criarConexaoWhatsapp } from "./whatsapp-conexao";
import { criarEnvioAtendente } from "./atendente";
import { criarNotificador } from "./notificador";
import { registrarPedidoLink } from "./pedido-link";
import { registrarPix, ROTA_WEBHOOK_PIX } from "./pix";
import { criarEmissorWebhookPix, registrarBancoPixSimulado } from "./pix-simulado";
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

// Pix simulado: o bot faz o papel do banco e avisa a si mesmo por webhook assinado.
const segredoWebhookPix = config.PIX_SIMULADO_SEGREDO ?? randomBytes(32).toString("hex");
const emissorWebhookPix = config.PIX_SIMULADO
  ? criarEmissorWebhookPix({
      url: `http://127.0.0.1:${config.PORT}${ROTA_WEBHOOK_PIX}`,
      segredo: segredoWebhookPix,
      perda: config.PIX_SIMULADO_PERDA_WEBHOOK,
      logger: logger.child({ modulo: "pix-simulado" }),
    })
  : null;
const pixSimulado = emissorWebhookPix
  ? criarPixSimulado({
      cobrancas: criarCobrancasSimuladasRepo(db),
      chave: config.PIX_SIMULADO_CHAVE,
      recebedor: async () => ({ nome: (await repos.loja.configuracao()).nomePizzaria, cidade: config.PIX_SIMULADO_CIDADE }),
      aoMudar: (evento) => emissorWebhookPix.emitir(evento),
    })
  : null;
const pix = pixSimulado ? criarServicoPix({ gateway: pixSimulado.gateway, repos, logger: logger.child({ modulo: "pix" }) }) : undefined;
if (pix && config.NODE_ENV === "production") {
  logger.warn("Pix SIMULADO em produção: o cliente vê um Pix, mas nenhum dinheiro entra. Pedidos Pix só são confirmados pelo Banco simulado do painel.");
}

// Página do pedido pelo link (/pedir): link no aviso do WhatsApp e opção oferecida pelo agente.
const urlPedir = config.PEDIR_URL ?? (config.CARDAPIO_URL ? config.CARDAPIO_URL.replace(/\/cardapio\/?$/, "/pedir") : null);

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
    ...(urlPedir ? { urlPedir } : {}),
  },
});

const servidor = Fastify({
  loggerInstance: logger.child({ modulo: "http" }) as FastifyBaseLogger,
  disableRequestLogging: true,
  trustProxy: true,
});
servidor.get("/health", async () => ({ ok: true }));

const canais = new Map<string, ChannelAdapter>();
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
if (canais.size === 0) logger.warn("WhatsApp desligado (WHATSAPP_ENABLED=false): o bot não recebe mensagens");

async function entregar(canal: ChannelAdapter, chatId: string, resposta: RespostaAgente) {
  if (!resposta.texto && !resposta.anexos?.length) return; // IA pausada: quem responde é o atendente
  // Mensagem com o link do cardápio ganha o botão "Ver cardápio".
  const botao = config.CARDAPIO_URL && resposta.texto.includes(config.CARDAPIO_URL) ? { texto: "📋 Ver cardápio", url: config.CARDAPIO_URL } : undefined;
  await canal.sendMessage(chatId, resposta.texto, botao ? { botao } : undefined);
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

const preparar = criarPreparadorMensagens({
  transcritor: config.TRANSCRICAO_AUDIO
    ? criarTranscritorOpenAi({ apiKey: config.OPENAI_API_KEY, modelo: config.OPENAI_TRANSCRICAO_MODELO })
    : null,
  canais,
  repos,
  duracaoMaximaSegundos: config.AUDIO_DURACAO_MAXIMA_SEGUNDOS,
  logger: logger.child({ modulo: "audio" }),
});

const processador = criarProcessadorPorChat(async (mensagem) => {
  const canal = canais.get(mensagem.canal)!;
  const log = logger.child({ canal: mensagem.canal, chatId: mensagem.chatId });
  const inicio = Date.now();

  // "digitando..." expira em poucos segundos; renova enquanto o agente pensa.
  // Com atendente humano no chat a IA não responde: nada de "digitando".
  const pausada = await repos.atendimento.iaPausada(mensagem.canal, mensagem.chatId).catch(() => false);
  if (!pausada) void canal.indicarDigitando?.(mensagem.chatId);
  const digitando = setInterval(() => !pausada && void canal.indicarDigitando?.(mensagem.chatId), 4500);
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
}, preparar);

registrarAdminWhatsapp({
  servidor,
  conexao: config.WHATSAPP_ENABLED
    ? criarConexaoWhatsapp({ urlApi: config.EVOLUTION_URL!, apiKey: config.EVOLUTION_API_KEY!, instancia: config.EVOLUTION_INSTANCIA })
    : null,
  validarAdmin: validarAdminSupabase(db),
  logger: logger.child({ modulo: "whatsapp-admin" }),
});

registrarAdminUsuarios({
  servidor,
  contas: contasSupabase(db),
  identificarAdmin: identificarAdminSupabase(db),
  logger: logger.child({ modulo: "usuarios-admin" }),
});

registrarBancoPixSimulado({
  servidor,
  banco: pixSimulado?.banco ?? null,
  validarAdmin: validarAdminSupabase(db),
  logger: logger.child({ modulo: "pix-simulado" }),
});

for (const canal of canais.values()) canal.onMessage((mensagem) => processador.receber(mensagem));

const pedidoLink = registrarPedidoLink({
  servidor,
  repos,
  pix: pix ?? null,
  whatsapp: canais.get("whatsapp") ?? null,
  urlPedir,
  logger: logger.child({ modulo: "pedido-link" }),
});

const notificador = criarNotificador({ db, canais, urlPedir, logger: logger.child({ modulo: "notificacoes" }) });
const envioAtendente = criarEnvioAtendente({
  db,
  repos,
  canais,
  logger: logger.child({ modulo: "atendente" }),
  expiracaoConversaMs: config.CONVERSA_EXPIRACAO_MINUTOS * 60_000,
});
const pagamentos = pix
  ? registrarPix({
      servidor,
      db,
      pix,
      logger: logger.child({ modulo: "pix" }),
      segredoWebhook: segredoWebhookPix,
      conferenciaMs: config.PIX_CONFERENCIA_SEGUNDOS * 1000,
    })
  : null;

async function desligar(sinal: string) {
  logger.info({ sinal }, "Desligando...");
  await emissorWebhookPix?.parar();
  await pagamentos?.parar();
  pedidoLink.parar();
  await notificador.parar();
  await envioAtendente.parar();
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
await envioAtendente.iniciar();
pagamentos?.iniciar();
logger.info(
  {
    porta: config.PORT,
    canais: [...canais.keys()],
    pix: pix ? "simulado" : false,
    audio: config.TRANSCRICAO_AUDIO ? config.OPENAI_TRANSCRICAO_MODELO : false,
  },
  "Bot no ar"
);
