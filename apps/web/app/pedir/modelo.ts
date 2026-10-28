import { precificarItens, type ResultadoPrecificacao } from "@pizzaria/core/precificacao";
import type { CatalogoPedir, ProdutoPedir } from "@pizzaria/db";
import type { IngredienteParaPreco, ItemPedidoLinkArgs, TamanhoPizza, VariacaoParaPreco } from "@pizzaria/shared";

/**
 * Carrinho do pedido por link e prévia de preço. A prévia usa a mesma
 * precificação do servidor (core/precificacao), mas o valor que vale é o que o
 * bot recalcula a partir dos IDs.
 */

export interface ItemCarrinho {
  id: string;
  item: ItemPedidoLinkArgs;
}

export interface Precos {
  variacoes: Map<string, VariacaoParaPreco>;
  ingredientes: Map<string, IngredienteParaPreco>;
  tamanhos: TamanhoPizza[];
  maxIngredientes: number;
}

export function montarPrecos(catalogo: CatalogoPedir, maxIngredientes: number): Precos {
  const variacoes = new Map<string, VariacaoParaPreco>();
  for (const p of [...catalogo.pizzas, ...catalogo.outros]) {
    for (const v of p.variacoes) {
      variacoes.set(v.id, { ...v, ativa: true, produtoId: p.id, produtoNome: p.nome, produtoAtivo: true, montagemLivre: p.montagemLivre });
    }
  }
  const ingredientes = new Map(catalogo.ingredientes.map((i) => [i.id, { id: i.id, nome: i.nome, ativo: true, precosCentavos: i.precosCentavos }]));
  return { variacoes, ingredientes, tamanhos: catalogo.tamanhos, maxIngredientes };
}

export function precificar(itens: ItemPedidoLinkArgs[], precos: Precos): ResultadoPrecificacao {
  return precificarItens(itens, precos.variacoes, precos.tamanhos, { ingredientes: precos.ingredientes, maxIngredientes: precos.maxIngredientes });
}

/** Prévia de um item: descrição e valores, ou o primeiro erro (sem o "Item 1:"). */
export function previaItem(item: ItemPedidoLinkArgs, precos: Precos) {
  const r = precificar([item], precos);
  return r.ok
    ? { ok: true as const, ...r.itens[0]! }
    : { ok: false as const, erro: r.erros[0]?.replace(/^Item 1: /, "") ?? "Item inválido" };
}

export const variacaoNoTamanho = (produto: ProdutoPedir, tamanho: string) =>
  produto.variacoes.find((v) => v.tipo === "tamanho" && v.nome.toLowerCase() === tamanho.toLowerCase());

export const variacaoUnica = (produto: ProdutoPedir) => produto.variacoes.find((v) => v.tipo === "padrao");

// Armazenamento local (per aparelho) -----------------------------------------------

const CHAVE = "vianna:pedir:v1";

export interface Salvo {
  itens: ItemCarrinho[];
  cliente?: { nome: string; telefone: string; rua: string; numero: string; bairroId: string; complemento: string; referencia: string };
}

export function carregar(): Salvo {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return { itens: [] };
    const salvo = JSON.parse(bruto) as Salvo;
    return Array.isArray(salvo.itens) ? salvo : { itens: [] };
  } catch {
    return { itens: [] };
  }
}

export function salvar(salvo: Salvo) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(salvo));
  } catch {
    // Armazenamento bloqueado (aba anônima etc.): o carrinho vive só na página.
  }
}

export const novoId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (Math.random() * 16) >> (+c / 4)).toString(16));
