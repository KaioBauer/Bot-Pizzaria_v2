import Fastify from "fastify";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { registrarAdminWhatsapp } from "./admin-whatsapp";
import { criarConexaoWhatsapp } from "./whatsapp-conexao";

type Rota = (url: string, init: RequestInit) => { status?: number; corpo: unknown };

/** Evolution falsa: responde conforme o caminho e registra as chamadas. */
function evolution(rota: Rota) {
  const chamadas: Array<{ metodo: string; url: string; corpo: unknown }> = [];
  const fetchFalso = (async (url: string, init: RequestInit) => {
    chamadas.push({ metodo: String(init.method), url, corpo: init.body ? JSON.parse(String(init.body)) : null });
    const { status = 200, corpo } = rota(url, init);
    return new Response(JSON.stringify(corpo), { status });
  }) as unknown as typeof fetch;
  return { chamadas, conexao: criarConexaoWhatsapp({ urlApi: "http://evo:8080/", apiKey: "k", instancia: "vianna", fetch: fetchFalso }) };
}

const QR = { base64: "data:image/png;base64,AAA", code: "2@x", pairingCode: null };

describe("conexão do WhatsApp (Evolution)", () => {
  it("lê a situação: conectado com número e nome", async () => {
    const { conexao } = evolution(() => ({ corpo: [{ connectionStatus: "open", ownerJid: "554788060593@s.whatsapp.net", profileName: "Vianna" }] }));
    expect(await conexao.situacao()).toEqual({ estado: "conectado", numero: "554788060593", nomePerfil: "Vianna" });
  });

  it("instância inexistente: cria e devolve o QR", async () => {
    const { conexao, chamadas } = evolution((url) =>
      url.includes("fetchInstances") ? { status: 404, corpo: { error: "not found" } } : { status: 201, corpo: { qrcode: QR } }
    );
    expect(await conexao.conectar()).toMatchObject({ estado: "conectando", qrCode: QR.base64, codigoPareamento: null });
    expect(chamadas[1]).toMatchObject({ metodo: "POST", url: "http://evo:8080/instance/create", corpo: { instanceName: "vianna", qrcode: true } });
  });

  it("desconectada: pede QR e código de pareamento pelo número", async () => {
    const { conexao, chamadas } = evolution((url) =>
      url.includes("fetchInstances") ? { corpo: [{ connectionStatus: "close" }] } : { corpo: { base64: "BBB", pairingCode: "ABCD1234" } }
    );
    expect(await conexao.conectar("+55 (47) 99999-8888")).toMatchObject({ qrCode: "data:image/png;base64,BBB", codigoPareamento: "ABCD1234" });
    expect(chamadas[1]?.url).toBe("http://evo:8080/instance/connect/vianna?number=5547999998888");
  });

  it("já conectada: não gera QR", async () => {
    const { conexao, chamadas } = evolution(() => ({ corpo: [{ connectionStatus: "open", ownerJid: "1@s.whatsapp.net" }] }));
    expect(await conexao.conectar()).toMatchObject({ estado: "conectado", qrCode: null });
    expect(chamadas).toHaveLength(1);
  });
});

describe("rotas /admin/whatsapp", () => {
  async function montar(validos = ["token-admin"], conexaoNula = false) {
    const evo = evolution((url, init) => {
      if (url.includes("fetchInstances")) return { corpo: [{ connectionStatus: "open", ownerJid: "554788060593@s.whatsapp.net", profileName: "Vianna" }] };
      if (init.method === "DELETE") return { corpo: { status: "SUCCESS" } };
      return { corpo: QR };
    });
    const servidor = Fastify();
    registrarAdminWhatsapp({
      servidor,
      conexao: conexaoNula ? null : evo.conexao,
      validarAdmin: async (t) => validos.includes(t),
      logger: pino({ level: "silent" }),
    });
    return { servidor, ...evo };
  }

  it("exige token de admin", async () => {
    const { servidor, chamadas } = await montar();
    expect((await servidor.inject({ method: "GET", url: "/admin/whatsapp" })).statusCode).toBe(401);
    expect((await servidor.inject({ method: "GET", url: "/admin/whatsapp", headers: { authorization: "Bearer outro" } })).statusCode).toBe(401);
    expect(chamadas).toHaveLength(0);
  });

  it("devolve a situação para o admin", async () => {
    const { servidor } = await montar();
    const r = await servidor.inject({ method: "GET", url: "/admin/whatsapp", headers: { authorization: "Bearer token-admin" } });
    expect(r.json()).toEqual({ habilitado: true, estado: "conectado", numero: "554788060593", nomePerfil: "Vianna" });
  });

  it("desconectar chama o logout da instância", async () => {
    const { servidor, chamadas } = await montar();
    await servidor.inject({ method: "POST", url: "/admin/whatsapp/desconectar", headers: { authorization: "Bearer token-admin" } });
    expect(chamadas.some((c) => c.metodo === "DELETE" && c.url.endsWith("/instance/logout/vianna"))).toBe(true);
  });

  it("valida o número do código de pareamento", async () => {
    const { servidor } = await montar();
    const r = await servidor.inject({ method: "POST", url: "/admin/whatsapp/conectar", headers: { authorization: "Bearer token-admin" }, payload: { numero: "1234" } });
    expect(r.statusCode).toBe(400);
  });

  it("WhatsApp desligado no bot: avisa o painel", async () => {
    const { servidor } = await montar(undefined, true);
    const r = await servidor.inject({ method: "GET", url: "/admin/whatsapp", headers: { authorization: "Bearer token-admin" } });
    expect(r.json()).toMatchObject({ habilitado: false });
  });
});
