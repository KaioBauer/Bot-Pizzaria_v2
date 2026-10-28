/**
 * Conexão do número da pizzaria na Evolution API (instância Baileys): status,
 * QR Code / código de pareamento e desconectar. Usado pelo painel, através das
 * rotas /admin/whatsapp do bot — a chave da Evolution nunca sai do servidor.
 */

export type EstadoWhatsapp = "conectado" | "conectando" | "desconectado" | "sem_instancia";

export interface SituacaoWhatsapp {
  estado: EstadoWhatsapp;
  /** Número conectado (DDI+DDD+número), quando conectado. */
  numero: string | null;
  nomePerfil: string | null;
}

export interface ConexaoIniciada extends SituacaoWhatsapp {
  /** Imagem do QR Code (data URL) para escanear no WhatsApp > Aparelhos conectados. */
  qrCode: string | null;
  /** Código de 8 caracteres para "Conectar com número de telefone". */
  codigoPareamento: string | null;
}

export interface OpcoesConexaoWhatsapp {
  urlApi: string;
  apiKey: string;
  instancia: string;
  fetch?: typeof fetch;
}

export class ErroEvolution extends Error {
  constructor(
    mensagem: string,
    readonly status: number
  ) {
    super(mensagem);
  }
}

interface RespostaQr {
  base64?: string | null;
  code?: string | null;
  pairingCode?: string | null;
}

const ESTADOS: Record<string, EstadoWhatsapp> = { open: "conectado", connecting: "conectando", close: "desconectado" };

function imagemQr(qr: RespostaQr | null | undefined): string | null {
  const base64 = qr?.base64;
  if (!base64) return null;
  return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
}

export function criarConexaoWhatsapp(opcoes: OpcoesConexaoWhatsapp) {
  const http = opcoes.fetch ?? fetch;
  const base = opcoes.urlApi.replace(/\/+$/, "");
  const instancia = encodeURIComponent(opcoes.instancia);

  async function chamar<T>(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
    let resposta: Response;
    try {
      resposta = await http(`${base}${caminho}`, {
        method: metodo,
        headers: { apikey: opcoes.apiKey, ...(corpo ? { "Content-Type": "application/json" } : {}) },
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new ErroEvolution(`Evolution API fora do ar (${err instanceof Error ? err.message : String(err)})`, 503);
    }
    const texto = await resposta.text();
    if (!resposta.ok) throw new ErroEvolution(`Evolution ${caminho}: HTTP ${resposta.status} ${texto.slice(0, 300)}`, resposta.status);
    return (texto ? JSON.parse(texto) : null) as T;
  }

  async function situacao(): Promise<SituacaoWhatsapp> {
    let instancias: Array<{ connectionStatus?: string; ownerJid?: string | null; profileName?: string | null }>;
    try {
      instancias = await chamar("GET", `/instance/fetchInstances?instanceName=${instancia}`);
    } catch (err) {
      if (err instanceof ErroEvolution && err.status === 404) return { estado: "sem_instancia", numero: null, nomePerfil: null };
      throw err;
    }
    const atual = instancias?.[0];
    if (!atual) return { estado: "sem_instancia", numero: null, nomePerfil: null };
    const estado = ESTADOS[atual.connectionStatus ?? ""] ?? "desconectado";
    return {
      estado,
      numero: estado === "conectado" && atual.ownerJid ? atual.ownerJid.split("@")[0]!.replace(/\D/g, "") : null,
      nomePerfil: estado === "conectado" ? (atual.profileName ?? null) : null,
    };
  }

  return {
    situacao,

    /**
     * Cria a instância se não existir e devolve o QR Code (e o código de
     * pareamento quando `numero` é informado). Já conectado: só a situação.
     */
    async conectar(numero?: string): Promise<ConexaoIniciada> {
      const atual = await situacao();
      if (atual.estado === "conectado") return { ...atual, qrCode: null, codigoPareamento: null };
      const telefone = numero?.replace(/\D/g, "") || undefined;

      let qr: RespostaQr | null | undefined;
      if (atual.estado === "sem_instancia") {
        const criada = await chamar<{ qrcode?: RespostaQr }>("POST", "/instance/create", {
          instanceName: opcoes.instancia,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          groupsIgnore: true,
          ...(telefone ? { number: telefone } : {}),
        });
        qr = criada?.qrcode;
      }
      if (!qr?.base64 && !qr?.pairingCode) {
        qr = await chamar<RespostaQr>("GET", `/instance/connect/${instancia}${telefone ? `?number=${telefone}` : ""}`);
      }
      return { estado: "conectando", numero: null, nomePerfil: null, qrCode: imagemQr(qr), codigoPareamento: qr?.pairingCode ?? null };
    },

    /** Desconecta o número (o celular sai de "Aparelhos conectados"). A instância continua. */
    async desconectar(): Promise<void> {
      const atual = await situacao();
      if (atual.estado === "sem_instancia" || atual.estado === "desconectado") return;
      try {
        await chamar("DELETE", `/instance/logout/${instancia}`);
      } catch (err) {
        // Ainda pareando (QR na tela): a Evolution recusa o logout; não há o que desconectar.
        if (!(err instanceof ErroEvolution && atual.estado === "conectando" && err.status < 500)) throw err;
      }
    },
  };
}

export type ConexaoWhatsapp = ReturnType<typeof criarConexaoWhatsapp>;
