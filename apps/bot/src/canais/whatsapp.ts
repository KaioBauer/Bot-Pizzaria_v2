import type { FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import type { Logger } from "pino";
import { dividirTexto, type ChannelAdapter, type ManipuladorMensagem } from "./tipos";

/**
 * Adaptador WhatsApp via Evolution API (v2): recebe pelo webhook
 * `messages.upsert` e envia pela API REST da instância.
 */

const LIMITE_WHATSAPP = 4000;
/** Mensagens mais velhas que isso (ex.: reentregues após reconectar) são ignoradas. */
const IDADE_MAXIMA_MS = 3 * 60_000;

export type ResultadoExtracao =
  | { tipo: "mensagem"; id: string; chatId: string; telefone: string | null; nome: string | null; texto: string }
  | { tipo: "sem_texto"; chatId: string }
  | { tipo: "ignorar"; motivo: string };

interface EventoEvolution {
  event?: string;
  data?: DadosMensagem | DadosMensagem[];
}

interface DadosMensagem {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean; remoteJidAlt?: string; senderPn?: string };
  pushName?: string;
  messageTimestamp?: number | string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    buttonsResponseMessage?: { selectedDisplayText?: string };
    listResponseMessage?: { title?: string };
  } | null;
}

function normalizarEvento(evento: string | undefined): string {
  return (evento ?? "").toLowerCase().replace(/_/g, ".");
}

/** Interpreta um item do webhook. Pura, para facilitar teste. */
export function extrairMensagem(dados: DadosMensagem, agora = Date.now()): ResultadoExtracao {
  const chave = dados.key;
  const jid = chave?.remoteJid;
  if (!chave?.id || !jid) return { tipo: "ignorar", motivo: "sem identificação" };
  if (chave.fromMe) return { tipo: "ignorar", motivo: "enviada pelo próprio número" };
  if (jid.endsWith("@g.us")) return { tipo: "ignorar", motivo: "grupo" };
  if (jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) return { tipo: "ignorar", motivo: "transmissão/status/canal" };

  const ts = Number(dados.messageTimestamp ?? 0);
  if (ts > 0 && agora - (ts > 1e12 ? ts : ts * 1000) > IDADE_MAXIMA_MS) return { tipo: "ignorar", motivo: "mensagem antiga" };

  // Contas com LID (@lid) escondem o número; o alternativo traz o telefone quando disponível.
  const comNumero = [jid, chave.remoteJidAlt, chave.senderPn].find((j) => j?.endsWith("@s.whatsapp.net"));
  const telefone = comNumero ? comNumero.split("@")[0]!.replace(/\D/g, "") : null;
  const chatId = telefone ?? jid;

  const m = dados.message ?? {};
  const texto =
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption;
  if (!texto?.trim()) return { tipo: "sem_texto", chatId };

  return { tipo: "mensagem", id: chave.id, chatId, telefone, nome: dados.pushName?.trim() || null, texto };
}

export function eventoDeMensagem(corpo: EventoEvolution): DadosMensagem[] {
  if (normalizarEvento(corpo.event) !== "messages.upsert" || !corpo.data) return [];
  return Array.isArray(corpo.data) ? corpo.data : [corpo.data];
}

function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface OpcoesWhatsapp {
  urlApi: string;
  apiKey: string;
  instancia: string;
  /** Segredo na URL do webhook: /webhooks/whatsapp/<token>. */
  tokenWebhook: string;
  logger: Logger;
  fetch?: typeof fetch;
}

export function criarAdaptadorWhatsapp(opcoes: OpcoesWhatsapp): ChannelAdapter {
  const { logger } = opcoes;
  const http = opcoes.fetch ?? fetch;
  const base = opcoes.urlApi.replace(/\/+$/, "");
  const instancia = encodeURIComponent(opcoes.instancia);
  let manipulador: ManipuladorMensagem | null = null;
  const vistas = new Set<string>();

  function lembrar(id: string): boolean {
    if (vistas.has(id)) return false;
    vistas.add(id);
    if (vistas.size > 2000) vistas.delete(vistas.values().next().value!);
    return true;
  }

  async function chamar(caminho: string, corpo: unknown) {
    const resposta = await http(`${base}${caminho}`, {
      method: "POST",
      headers: { apikey: opcoes.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(20_000),
    });
    if (!resposta.ok) {
      throw new Error(`Evolution ${caminho}: HTTP ${resposta.status} ${(await resposta.text()).slice(0, 300)}`);
    }
  }

  const adaptador: ChannelAdapter = {
    canal: "whatsapp",

    onMessage(novo) {
      manipulador = novo;
    },

    async sendMessage(chatId, texto, opcoes) {
      // Botões da API não oficial do WhatsApp não aparecem para todos; o destaque do
      // link é a prévia (título, descrição e imagem do cardápio), que abre ao tocar.
      for (const parte of dividirTexto(texto, LIMITE_WHATSAPP)) {
        const previa = Boolean(opcoes?.botao && parte.includes(opcoes.botao.url));
        await chamar(`/message/sendText/${instancia}`, { number: chatId, text: parte, linkPreview: previa });
      }
    },

    async sendImage(chatId, imagem) {
      await chamar(`/message/sendMedia/${instancia}`, {
        number: chatId,
        mediatype: "image",
        mimetype: imagem.tipoMime,
        media: imagem.conteudo.toString("base64"),
        fileName: imagem.tipoMime === "image/png" ? "imagem.png" : "imagem.jpg",
        ...(imagem.legenda ? { caption: imagem.legenda } : {}),
      });
    },

    async indicarDigitando(chatId) {
      await chamar(`/chat/sendPresence/${instancia}`, { number: chatId, presence: "composing", delay: 4000 }).catch(() => undefined);
    },

    async iniciar(servidor) {
      // A Evolution 2.3 pode acrescentar o evento ao caminho (/messages-upsert) mesmo
      // com WEBHOOK_BY_EVENTS=false; as duas formas caem no mesmo tratamento.
      const tratar = async (req: FastifyRequest<{ Params: { token: string }; Body: EventoEvolution }>, resposta: FastifyReply) => {
        if (!tokenConfere(req.params.token, opcoes.tokenWebhook)) return resposta.code(401).send({ ok: false });

        for (const dados of eventoDeMensagem(req.body ?? {})) {
          const r = extrairMensagem(dados);
          if (r.tipo === "ignorar") {
            logger.debug({ motivo: r.motivo }, "Mensagem do WhatsApp ignorada");
          } else if (r.tipo === "sem_texto") {
            void adaptador
              .sendMessage(r.chatId, "Por enquanto eu só entendo mensagens de texto 🙂 Pode escrever o que deseja?")
              .catch((err: unknown) => logger.error({ err }, "Falha ao responder mídia"));
          } else if (lembrar(r.id)) {
            manipulador?.({ canal: "whatsapp", chatId: r.chatId, clienteNome: r.nome, telefone: r.telefone, texto: r.texto });
          }
        }
        return resposta.code(200).send({ ok: true });
      };
      servidor.post<{ Params: { token: string }; Body: EventoEvolution }>("/webhooks/whatsapp/:token", tratar);
      servidor.post<{ Params: { token: string }; Body: EventoEvolution }>("/webhooks/whatsapp/:token/:evento", tratar);
      logger.info({ instancia: opcoes.instancia }, "WhatsApp (Evolution API) aguardando webhooks");
    },

    async parar() {},
  };
  return adaptador;
}
