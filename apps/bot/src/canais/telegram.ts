import { Bot, GrammyError, InputFile, webhookCallback } from "grammy";
import type { Logger } from "pino";
import { dividirTexto, type ChannelAdapter, type ManipuladorMensagem, type OpcoesEnvio } from "./tipos";

const LIMITE_TELEGRAM = 4000;
const ROTA_WEBHOOK = "/webhooks/telegram";

export interface OpcoesTelegram {
  token: string;
  modo: "polling" | "webhook";
  urlPublica?: string;
  segredoWebhook?: string;
  logger: Logger;
}

export function criarAdaptadorTelegram(opcoes: OpcoesTelegram): ChannelAdapter {
  const { logger } = opcoes;
  const bot = new Bot(opcoes.token);
  let manipulador: ManipuladorMensagem | null = null;

  bot.on("message:text", (ctx) => {
    if (ctx.chat.type !== "private") return;
    manipulador?.({
      canal: "telegram",
      chatId: String(ctx.chat.id),
      clienteNome: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || null,
      telefone: null,
      texto: ctx.message.text,
    });
  });

  bot.on("message", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    await ctx.reply("Por enquanto eu só entendo mensagens de texto 🙂 Pode escrever o que deseja?");
  });

  bot.catch((erro) => logger.error({ err: erro.error }, "Erro não tratado no Telegram"));

  async function enviarParte(chatId: string, texto: string, botao?: OpcoesEnvio["botao"]) {
    const teclado = botao ? { reply_markup: { inline_keyboard: [[{ text: botao.texto, url: botao.url }]] } } : {};
    const recusado = (erro: unknown) => erro instanceof GrammyError && erro.error_code === 400;
    try {
      // Markdown simples (*negrito*); se o texto tiver marcação quebrada,
      // o Telegram recusa e reenviamos como texto puro.
      await bot.api.sendMessage(chatId, texto, { parse_mode: "Markdown", ...teclado });
    } catch (erro) {
      if (!recusado(erro)) throw erro;
      try {
        await bot.api.sendMessage(chatId, texto, teclado);
      } catch (erroPuro) {
        // Botão com URL que o Telegram não aceita (ex.: localhost): manda sem o botão.
        if (!botao || !recusado(erroPuro)) throw erroPuro;
        logger.warn({ url: botao.url }, "Telegram recusou o botão de link; enviando sem ele");
        await bot.api.sendMessage(chatId, texto);
      }
    }
  }

  return {
    canal: "telegram",

    onMessage(novo) {
      manipulador = novo;
    },

    async sendMessage(chatId, texto, opcoes) {
      const partes = dividirTexto(texto, LIMITE_TELEGRAM);
      for (const [i, parte] of partes.entries()) {
        const botao = i === partes.length - 1 ? opcoes?.botao : undefined;
        if (opcoes?.literal) await bot.api.sendMessage(chatId, parte);
        else await enviarParte(chatId, parte, botao);
      }
    },

    async sendImage(chatId, imagem) {
      await bot.api.sendPhoto(chatId, new InputFile(imagem.conteudo), {
        ...(imagem.legenda ? { caption: imagem.legenda } : {}),
      });
    },

    async indicarDigitando(chatId) {
      await bot.api.sendChatAction(chatId, "typing").catch(() => undefined);
    },

    async iniciar(servidor) {
      await bot.init();
      // Menu de comandos do Telegram (botão "Menu" ao lado do campo de texto).
      await bot.api
        .setMyCommands([{ command: "reiniciar", description: "Começar o atendimento do zero" }])
        .catch((err: unknown) => logger.warn({ err }, "Não consegui registrar os comandos do bot"));
      if (opcoes.modo === "webhook") {
        servidor.post(
          ROTA_WEBHOOK,
          webhookCallback(bot, "fastify", { secretToken: opcoes.segredoWebhook })
        );
        await bot.api.setWebhook(`${opcoes.urlPublica}${ROTA_WEBHOOK}`, {
          secret_token: opcoes.segredoWebhook,
          allowed_updates: ["message"],
        });
        logger.info({ bot: bot.botInfo.username }, "Telegram em modo webhook");
      } else {
        await bot.api.deleteWebhook();
        void bot.start({ allowed_updates: ["message"] });
        logger.info({ bot: bot.botInfo.username }, "Telegram em modo polling");
      }
    },

    async parar() {
      if (bot.isRunning()) await bot.stop();
    },
  };
}
