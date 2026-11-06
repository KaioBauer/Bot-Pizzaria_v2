/**
 * Simula conversas com o modelo REAL, cardápio e configuração REAIS (só leitura)
 * e pedidos/conversas em memória. Mostra cada resposta do modelo (inclusive as
 * que a verificação mandou corrigir). Nada é gravado no banco.
 *
 *   pnpm simular roteiro.json
 * roteiro.json: { "telefone": "5547...", "mensagens": ["oi", ...], "repetir": 1 }
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { criarAgente, criarProvedorOpenAi, type LlmProvider } from "@pizzaria/core";
import { repositoriosEmMemoria } from "@pizzaria/core/testes/memoria";
import { criarClienteServico, criarRepositorios } from "@pizzaria/db";

process.loadEnvFile(resolve(import.meta.dirname, "../.env"));
const env = process.env as Record<string, string>;
const roteiro = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as { telefone: string; mensagens: string[]; repetir?: number; nome?: string };

const reais = criarRepositorios(criarClienteServico(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!));
const config = await reais.loja.configuracao();
const cardapio = await reais.cardapio.ativo();

const base = criarProvedorOpenAi({ apiKey: env.OPENAI_API_KEY!, modelo: env.OPENAI_MODEL || "gpt-5.4", esforcoRaciocinio: (env.OPENAI_REASONING_EFFORT as "none") || "none" });
const llm: LlmProvider = {
  async completar(req) {
    // Resultados de ferramentas desde a última chamada ao modelo.
    for (let i = req.mensagens.length - 1; i >= 0 && req.mensagens[i]!.papel === "tool"; i--) {
      const m = req.mensagens[i]!;
      if (m.papel === "tool" && !m.conteudo.startsWith('{"categorias"')) console.log(`    · resultado: ${m.conteudo.slice(0, 400)}`);
    }
    const r = await base.completar(req);
    const correcao = req.sistema.includes("# Correção obrigatória") ? " [após correção]" : "";
    if (r.toolCalls.length) console.log(`    · tools${correcao}: ${r.toolCalls.map((t) => `${t.nome}(${t.argumentos.slice(0, 220)})`).join(" ; ")}`);
    else console.log(`    · modelo${correcao}: ${JSON.stringify(r.conteudo)}`);
    return r;
  },
};

for (let n = 0; n < (roteiro.repetir ?? 1); n++) {
  const memoria = repositoriosEmMemoria({ variacoes: new Map(), config, cardapio });
  // Variações: lidas do banco real sob demanda (preço sempre do servidor).
  memoria.repos.cardapio = reais.cardapio;
  const agente = criarAgente({
    repos: memoria.repos,
    llm,
    opcoes: { urlCardapio: env.CARDAPIO_URL, urlPedir: env.CARDAPIO_URL?.replace(/\/cardapio\/?$/, "/pedir") },
  });
  console.log(`\n===== rodada ${n + 1}`);
  for (const texto of roteiro.mensagens) {
    console.log(`\n>>> CLIENTE: ${texto}`);
    const r = await agente.processarMensagem({ canal: "whatsapp", chatId: roteiro.telefone, telefone: roteiro.telefone, clienteNome: roteiro.nome ?? "Teste Claude", texto });
    console.log(`<<< BOT: ${r.texto}${r.pedido ? `   [PEDIDO #${r.pedido.numero}]` : ""}`);
  }
  for (const p of memoria.pedidos) console.log(`PEDIDO #${p.numero}: ${p.tipoEntrega} ${p.formaPagamento} total=${p.totalCentavos} taxa=${p.taxaEntregaCentavos} status=${p.status} itens=${p.itens.map((i) => i.descricao).join(" + ")}`);
}
