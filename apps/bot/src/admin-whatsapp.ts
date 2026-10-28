import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Logger } from "pino";
import type { Db } from "@pizzaria/db";
import { ErroEvolution, type ConexaoWhatsapp } from "./whatsapp-conexao";

/**
 * Rotas que o painel usa para conectar o WhatsApp (o painel chama pelo
 * servidor, com o token de sessão do admin logado):
 *   GET  /admin/whatsapp              situação da conexão
 *   POST /admin/whatsapp/conectar     QR Code / código de pareamento
 *   POST /admin/whatsapp/desconectar
 */

export type ValidarAdmin = (token: string) => Promise<boolean>;

/** Confere o JWT do Supabase e o papel "admin" (app_metadata, só a service_role altera). */
export function validarAdminSupabase(db: Db): ValidarAdmin {
  return async (token) => {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return false;
    return (data.user.app_metadata as { papel?: unknown } | undefined)?.papel === "admin";
  };
}

export function registrarAdminWhatsapp(params: {
  servidor: FastifyInstance;
  /** null = WhatsApp desligado no bot (WHATSAPP_ENABLED=false). */
  conexao: ConexaoWhatsapp | null;
  validarAdmin: ValidarAdmin;
  logger: Logger;
}) {
  const { servidor, conexao, logger } = params;

  async function autorizado(req: FastifyRequest, resposta: FastifyReply): Promise<boolean> {
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1];
    const ok = token ? await params.validarAdmin(token).catch(() => false) : false;
    if (!ok) await resposta.code(401).send({ erro: "Não autorizado" });
    return ok;
  }

  async function executar(resposta: FastifyReply, acao: () => Promise<unknown>) {
    if (!conexao) {
      return resposta.send({ habilitado: false, estado: "desligado", numero: null, nomePerfil: null });
    }
    try {
      return resposta.send({ habilitado: true, ...((await acao()) as object) });
    } catch (err) {
      logger.error({ err }, "Falha ao falar com a Evolution API");
      const foraDoAr = err instanceof ErroEvolution && err.status === 503;
      return resposta.code(502).send({
        erro: foraDoAr ? "A Evolution API (servidor do WhatsApp) não respondeu. Confira se ela está rodando." : "A Evolution API recusou a operação. Veja os logs do bot.",
      });
    }
  }

  servidor.get("/admin/whatsapp", async (req, resposta) => {
    if (!(await autorizado(req, resposta))) return;
    return executar(resposta, () => conexao!.situacao());
  });

  servidor.post<{ Body: { numero?: unknown } | null }>("/admin/whatsapp/conectar", async (req, resposta) => {
    if (!(await autorizado(req, resposta))) return;
    const numero = typeof req.body?.numero === "string" ? req.body.numero.replace(/\D/g, "") : "";
    if (numero && (numero.length < 12 || numero.length > 13)) {
      return resposta.code(400).send({ erro: "Número inválido: use DDI + DDD + número, ex.: 5547999998888" });
    }
    logger.info({ comCodigo: Boolean(numero) }, "Painel pediu conexão do WhatsApp");
    return executar(resposta, () => conexao!.conectar(numero || undefined));
  });

  servidor.post("/admin/whatsapp/desconectar", async (req, resposta) => {
    if (!(await autorizado(req, resposta))) return;
    logger.warn("Painel desconectou o WhatsApp");
    return executar(resposta, async () => {
      await conexao!.desconectar();
      return conexao!.situacao();
    });
  });
}
