import Fastify from "fastify";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { registrarAdminUsuarios, type Conta, type ContasAuth } from "./admin-usuarios";

function conta(dados: Partial<Conta> & { id: string }): Conta {
  return { email: `${dados.id}@vianna.test`, papel: null, nome: null, telefone: null, ativo: true, criadoEm: "2026-11-01T00:00:00Z", ultimoAcesso: null, ...dados };
}

/** Supabase Auth em memória. */
function contasEmMemoria(iniciais: Conta[]) {
  const contas = new Map(iniciais.map((c) => [c.id, { ...c }]));
  const senhas = new Map<string, string>();
  let seq = 0;
  const auth: ContasAuth = {
    listar: async () => [...contas.values()].map((c) => ({ ...c })),
    criar: async ({ email, senha, papel, nome, telefone }) => {
      const id = `novo-${++seq}`;
      contas.set(id, conta({ id, email, papel, nome, telefone }));
      senhas.set(id, senha);
      return id;
    },
    trocarSenha: async (id, senha) => void senhas.set(id, senha),
    definirAtivo: async (id, ativo) => {
      contas.get(id)!.ativo = ativo;
    },
  };
  return { auth, contas, senhas };
}

async function montar(iniciais: Conta[], admins: Record<string, string> = { "token-ana": "ana" }) {
  const memoria = contasEmMemoria(iniciais);
  const servidor = Fastify();
  registrarAdminUsuarios({
    servidor,
    contas: memoria.auth,
    identificarAdmin: async (t) => admins[t] ?? null,
    logger: pino({ level: "silent" }),
  });
  const chamar = (method: "GET" | "POST", url: string, payload?: object, token = "token-ana") =>
    servidor.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  return { ...memoria, chamar, servidor };
}

const BASE = [
  conta({ id: "ana", papel: "admin", nome: "Ana" }),
  conta({ id: "beto", papel: "admin", nome: "Beto" }),
  conta({ id: "moto", papel: "entregador", nome: "Zé Moto" }),
  conta({ id: "imp", papel: "impressora", email: "impressora.vianna@example.com" }),
];

describe("rotas /admin/usuarios", () => {
  it("exige token de admin", async () => {
    const { servidor } = await montar(BASE);
    expect((await servidor.inject({ method: "GET", url: "/admin/usuarios" })).statusCode).toBe(401);
    expect((await servidor.inject({ method: "GET", url: "/admin/usuarios", headers: { authorization: "Bearer outro" } })).statusCode).toBe(401);
  });

  it("lista os usuários", async () => {
    const { chamar } = await montar(BASE);
    const r = await chamar("GET", "/admin/usuarios");
    expect(r.statusCode).toBe(200);
    expect(r.json().usuarios.map((u: Conta) => u.id)).toEqual(["ana", "beto", "moto", "imp"]);
  });

  it("cria motoboy com senha gerada (mostrada uma vez) e telefone só com dígitos", async () => {
    const { chamar, contas, senhas } = await montar(BASE);
    const r = await chamar("POST", "/admin/usuarios", { nome: " Carlos ", email: "Carlos@Vianna.test", papel: "entregador", telefone: "(47) 99999-8888" });
    expect(r.statusCode).toBe(200);
    const { id, senha } = r.json();
    expect(senha).toMatch(/^vianna-.{8}$/);
    expect(senhas.get(id)).toBe(senha);
    expect(contas.get(id)).toMatchObject({ email: "carlos@vianna.test", nome: "Carlos", papel: "entregador", telefone: "47999998888" });
  });

  it("cria admin com a senha digitada", async () => {
    const { chamar, senhas } = await montar(BASE);
    const r = await chamar("POST", "/admin/usuarios", { nome: "Dani", email: "dani@vianna.test", papel: "admin", senha: "senha-forte-1" });
    expect(r.json().senha).toBe("senha-forte-1");
    expect(senhas.get(r.json().id)).toBe("senha-forte-1");
  });

  it("recusa dados inválidos, e-mail repetido e papel de sistema", async () => {
    const { chamar } = await montar(BASE);
    const erro = async (corpo: object) => {
      const r = await chamar("POST", "/admin/usuarios", corpo);
      return [r.statusCode, r.json().erro];
    };
    expect(await erro({ nome: "A", email: "a@b.co", papel: "admin" })).toEqual([400, "Informe o nome (2 a 60 letras)."]);
    expect(await erro({ nome: "Ana", email: "sem-arroba", papel: "admin" })).toEqual([400, "E-mail inválido."]);
    expect((await erro({ nome: "Ana", email: "x@y.co", papel: "impressora" }))[0]).toBe(400);
    expect(await erro({ nome: "Ana", email: "x@y.co", papel: "admin", senha: "curta" })).toEqual([400, "A senha precisa ter pelo menos 8 caracteres."]);
    expect(await erro({ nome: "Ana 2", email: "ANA@vianna.test", papel: "admin" })).toEqual([409, "Já existe um usuário com esse e-mail."]);
  });

  it("troca a senha (gerada quando não informada), menos a da impressora", async () => {
    const { chamar, senhas } = await montar(BASE);
    const r = await chamar("POST", "/admin/usuarios/moto/senha", {});
    expect(r.json().senha).toMatch(/^vianna-/);
    expect(senhas.get("moto")).toBe(r.json().senha);
    expect((await chamar("POST", "/admin/usuarios/imp/senha", {})).statusCode).toBe(400);
    expect((await chamar("POST", "/admin/usuarios/nao-existe/senha", {})).statusCode).toBe(404);
  });

  it("desativa e reativa motoboy", async () => {
    const { chamar, contas } = await montar(BASE);
    expect((await chamar("POST", "/admin/usuarios/moto/ativo", { ativo: false })).statusCode).toBe(200);
    expect(contas.get("moto")!.ativo).toBe(false);
    await chamar("POST", "/admin/usuarios/moto/ativo", { ativo: true });
    expect(contas.get("moto")!.ativo).toBe(true);
  });

  it("não deixa desativar a si mesmo, o último admin ativo nem a impressora", async () => {
    const { chamar, contas } = await montar(BASE, { "token-ana": "ana", "token-beto": "beto" });
    expect((await chamar("POST", "/admin/usuarios/ana/ativo", { ativo: false })).json().erro).toBe("Você não pode desativar o seu próprio acesso.");
    expect((await chamar("POST", "/admin/usuarios/beto/ativo", { ativo: false })).statusCode).toBe(200);
    // Agora a Ana é a única admin ativa: o Beto (desativado) não poderia, e ninguém derruba a Ana.
    contas.get("beto")!.ativo = true;
    contas.get("ana")!.ativo = false;
    expect((await chamar("POST", "/admin/usuarios/beto/ativo", { ativo: false }, "token-ana")).json().erro).toBe("Precisa sobrar pelo menos um administrador ativo.");
    expect((await chamar("POST", "/admin/usuarios/imp/ativo", { ativo: false })).statusCode).toBe(400);
  });
});
