import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Logger } from "pino";
import type { Db } from "@pizzaria/db";

/**
 * Usuários do painel (Configurações → Usuários e acessos). O painel não tem a
 * service_role: as actions repassam o token do admin logado e o bot, que tem a
 * chave, cria/atualiza no Supabase Auth.
 *   GET  /admin/usuarios                 lista
 *   POST /admin/usuarios                 cria { nome, email, papel, telefone?, senha? }
 *   POST /admin/usuarios/:id/senha       nova senha { senha? } (sem senha = gera)
 *   POST /admin/usuarios/:id/ativo       { ativo } — desativar não apaga (histórico de entregas)
 */

export type Papel = "admin" | "entregador" | "impressora";
export const PAPEIS_EDITAVEIS = ["admin", "entregador"] as const;

export interface Conta {
  id: string;
  email: string;
  papel: Papel | null;
  nome: string | null;
  telefone: string | null;
  /** Login liberado (não bloqueado no Auth e, se motoboy, ativo em entregadores). */
  ativo: boolean;
  criadoEm: string;
  ultimoAcesso: string | null;
}

/** O que o serviço precisa do Supabase (em memória nos testes). */
export interface ContasAuth {
  listar(): Promise<Conta[]>;
  criar(dados: { email: string; senha: string; papel: Papel; nome: string; telefone: string | null }): Promise<string>;
  trocarSenha(id: string, senha: string): Promise<void>;
  definirAtivo(id: string, ativo: boolean, papel: Papel | null): Promise<void>;
}

export class ErroUsuario extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function gerarSenha(): string {
  return `vianna-${randomBytes(6).toString("base64url")}`;
}

function validarSenha(senha: string | undefined): string {
  if (senha === undefined || senha === "") return gerarSenha();
  if (senha.length < 8) throw new ErroUsuario("A senha precisa ter pelo menos 8 caracteres.");
  if (senha.length > 72) throw new ErroUsuario("A senha pode ter no máximo 72 caracteres.");
  return senha;
}

export function criarServicoUsuarios(contas: ContasAuth) {
  async function buscar(id: string): Promise<Conta> {
    const conta = (await contas.listar()).find((c) => c.id === id);
    if (!conta) throw new ErroUsuario("Usuário não encontrado.", 404);
    return conta;
  }

  return {
    listar: () => contas.listar(),

    async criar(entrada: { nome?: unknown; email?: unknown; papel?: unknown; telefone?: unknown; senha?: unknown }) {
      const nome = typeof entrada.nome === "string" ? entrada.nome.trim() : "";
      const email = typeof entrada.email === "string" ? entrada.email.trim().toLowerCase() : "";
      const papel = entrada.papel;
      const telefone = typeof entrada.telefone === "string" ? entrada.telefone.replace(/\D/g, "") : "";
      if (nome.length < 2 || nome.length > 60) throw new ErroUsuario("Informe o nome (2 a 60 letras).");
      if (!EMAIL.test(email)) throw new ErroUsuario("E-mail inválido.");
      if (!PAPEIS_EDITAVEIS.includes(papel as (typeof PAPEIS_EDITAVEIS)[number])) throw new ErroUsuario("Escolha o tipo: administrador ou motoboy.");
      if (telefone && (telefone.length < 10 || telefone.length > 13)) throw new ErroUsuario("Telefone inválido: use DDD + número.");
      const senha = validarSenha(typeof entrada.senha === "string" ? entrada.senha : undefined);
      if ((await contas.listar()).some((c) => c.email.toLowerCase() === email)) {
        throw new ErroUsuario("Já existe um usuário com esse e-mail.", 409);
      }
      const id = await contas.criar({ email, senha, papel: papel as Papel, nome, telefone: telefone || null });
      return { id, senha };
    },

    async trocarSenha(id: string, senhaInformada: unknown) {
      const conta = await buscar(id);
      if (conta.papel === "impressora") throw new ErroUsuario("O usuário da impressora é do sistema: troque a senha pelo comando pnpm usuario impressora.");
      const senha = validarSenha(typeof senhaInformada === "string" ? senhaInformada : undefined);
      await contas.trocarSenha(id, senha);
      return { senha };
    },

    async definirAtivo(id: string, ativo: unknown, adminId: string) {
      if (typeof ativo !== "boolean") throw new ErroUsuario("Informe se o acesso fica ativo.");
      const todas = await contas.listar();
      const conta = todas.find((c) => c.id === id);
      if (!conta) throw new ErroUsuario("Usuário não encontrado.", 404);
      if (conta.papel === "impressora") throw new ErroUsuario("O usuário da impressora é do sistema e não pode ser desativado aqui.");
      if (!ativo) {
        if (id === adminId) throw new ErroUsuario("Você não pode desativar o seu próprio acesso.");
        const adminsAtivos = todas.filter((c) => c.papel === "admin" && c.ativo);
        if (conta.papel === "admin" && adminsAtivos.length <= 1) throw new ErroUsuario("Precisa sobrar pelo menos um administrador ativo.");
      }
      await contas.definirAtivo(id, ativo, conta.papel);
    },
  };
}

// --- Supabase -------------------------------------------------------------------------

/** Bloqueio "para sempre" do Supabase Auth (~100 anos). */
const BLOQUEIO = "876000h";

export function contasSupabase(db: Db): ContasAuth {
  const auth = db.auth.admin;
  return {
    async listar() {
      const usuarios = [];
      for (let pagina = 1; ; pagina++) {
        const { data, error } = await auth.listUsers({ page: pagina, perPage: 200 });
        if (error) throw error;
        usuarios.push(...data.users);
        if (data.users.length < 200) break;
      }
      const { data: entregadores, error } = await db.from("entregadores").select("user_id, nome, telefone, ativo");
      if (error) throw error;
      const porId = new Map((entregadores ?? []).map((e) => [e.user_id, e]));
      const agora = Date.now();
      return usuarios
        .map((u): Conta => {
          const papelBruto = (u.app_metadata as { papel?: unknown } | undefined)?.papel;
          const papel = papelBruto === "admin" || papelBruto === "entregador" || papelBruto === "impressora" ? papelBruto : null;
          const entregador = porId.get(u.id);
          const banido = Boolean(u.banned_until && new Date(u.banned_until).getTime() > agora);
          const nomeMeta = (u.user_metadata as { nome?: unknown } | undefined)?.nome;
          return {
            id: u.id,
            email: u.email ?? "",
            papel,
            nome: entregador?.nome ?? (typeof nomeMeta === "string" ? nomeMeta : null),
            telefone: entregador?.telefone ?? null,
            ativo: !banido && (papel !== "entregador" || (entregador?.ativo ?? false)),
            criadoEm: u.created_at,
            ultimoAcesso: u.last_sign_in_at ?? null,
          };
        })
        .sort((a, b) => (a.nome ?? a.email).localeCompare(b.nome ?? b.email, "pt-BR"));
    },

    async criar({ email, senha, papel, nome, telefone }) {
      const { data, error } = await auth.createUser({
        email,
        password: senha,
        email_confirm: true,
        app_metadata: { papel },
        user_metadata: { nome },
      });
      if (error) throw new ErroUsuario(error.message.includes("already") ? "Já existe um usuário com esse e-mail." : `Supabase recusou: ${error.message}`);
      if (papel === "entregador") {
        const { error: erroEntregador } = await db.from("entregadores").upsert({ user_id: data.user.id, nome, telefone, ativo: true });
        if (erroEntregador) {
          // Sem a linha em entregadores o motoboy não funcionaria: desfaz o login.
          await auth.deleteUser(data.user.id).catch(() => undefined);
          throw erroEntregador;
        }
      }
      return data.user.id;
    },

    async trocarSenha(id, senha) {
      const { error } = await auth.updateUserById(id, { password: senha });
      if (error) throw new ErroUsuario(`Supabase recusou: ${error.message}`);
    },

    async definirAtivo(id, ativo, papel) {
      const { error } = await auth.updateUserById(id, { ban_duration: ativo ? "none" : BLOQUEIO });
      if (error) throw new ErroUsuario(`Supabase recusou: ${error.message}`);
      if (papel === "entregador") {
        const { error: erroEntregador } = await db.from("entregadores").update({ ativo }).eq("user_id", id);
        if (erroEntregador) throw erroEntregador;
      }
    },
  };
}

/** Confere o JWT e o papel "admin"; devolve o id do admin (para as travas "não a si mesmo"). */
export type IdentificarAdmin = (token: string) => Promise<string | null>;

export function identificarAdminSupabase(db: Db): IdentificarAdmin {
  return async (token) => {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return null;
    return (data.user.app_metadata as { papel?: unknown } | undefined)?.papel === "admin" ? data.user.id : null;
  };
}

// --- Rotas ----------------------------------------------------------------------------

export function registrarAdminUsuarios(params: {
  servidor: FastifyInstance;
  contas: ContasAuth;
  identificarAdmin: IdentificarAdmin;
  logger: Logger;
}) {
  const { servidor, logger } = params;
  const servico = criarServicoUsuarios(params.contas);

  async function admin(req: FastifyRequest, resposta: FastifyReply): Promise<string | null> {
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1];
    const id = token ? await params.identificarAdmin(token).catch(() => null) : null;
    if (!id) await resposta.code(401).send({ erro: "Não autorizado" });
    return id;
  }

  async function executar(resposta: FastifyReply, acao: () => Promise<unknown>) {
    try {
      return resposta.send((await acao()) ?? { ok: true });
    } catch (err) {
      if (err instanceof ErroUsuario) return resposta.code(err.status).send({ erro: err.message });
      logger.error({ err }, "Falha ao gerenciar usuários");
      return resposta.code(500).send({ erro: "Não consegui falar com o Supabase. Veja os logs do bot." });
    }
  }

  servidor.get("/admin/usuarios", async (req, resposta) => {
    if (!(await admin(req, resposta))) return;
    return executar(resposta, async () => ({ usuarios: await servico.listar() }));
  });

  servidor.post<{ Body: Record<string, unknown> | null }>("/admin/usuarios", async (req, resposta) => {
    const adminId = await admin(req, resposta);
    if (!adminId) return;
    return executar(resposta, async () => {
      const criado = await servico.criar(req.body ?? {});
      logger.info({ adminId, usuarioId: criado.id, papel: req.body?.papel }, "Usuário criado pelo painel");
      return criado;
    });
  });

  servidor.post<{ Params: { id: string }; Body: { senha?: unknown } | null }>("/admin/usuarios/:id/senha", async (req, resposta) => {
    const adminId = await admin(req, resposta);
    if (!adminId) return;
    return executar(resposta, async () => {
      const r = await servico.trocarSenha(req.params.id, req.body?.senha);
      logger.info({ adminId, usuarioId: req.params.id }, "Senha trocada pelo painel");
      return r;
    });
  });

  servidor.post<{ Params: { id: string }; Body: { ativo?: unknown } | null }>("/admin/usuarios/:id/ativo", async (req, resposta) => {
    const adminId = await admin(req, resposta);
    if (!adminId) return;
    return executar(resposta, async () => {
      await servico.definirAtivo(req.params.id, req.body?.ativo, adminId);
      logger.warn({ adminId, usuarioId: req.params.id, ativo: req.body?.ativo }, "Acesso alterado pelo painel");
      return { ok: true };
    });
  });
}
