import {
  formatarReais,
  type BairroEntrega,
  type ComponenteItem,
  type ItemPedidoArgs,
  type ItemPrecificado,
  type TipoEntrega,
  type VariacaoParaPreco,
} from "@pizzaria/shared";

/**
 * REVALIDAÇÃO DE PREÇO NO SERVIDOR. Tudo aqui parte de IDs informados pelo
 * LLM e de variações lidas do banco — nenhum valor monetário vindo do modelo
 * é usado. Regras:
 * - sabor: variação ativa do tipo `tamanho` ou `padrao`, do próprio produto;
 * - meio a meio: 2 sabores diferentes, ambos com tamanho, no mesmo tamanho;
 *   o preço base é o do sabor mais caro;
 * - adicionais: variações ativas `borda`/`adicional` de um dos sabores,
 *   no máximo uma borda; somam ao preço base.
 */

export type ResultadoPrecificacao =
  | { ok: true; itens: ItemPrecificado[]; subtotalCentavos: number }
  | { ok: false; erros: string[] };

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function disponivel(v: VariacaoParaPreco): boolean {
  return v.ativa && v.produtoAtivo;
}

function nomeSabor(v: VariacaoParaPreco): string {
  if (v.tipo === "padrao") {
    return ["unico", "padrao"].includes(normalizar(v.nome))
      ? v.produtoNome
      : `${v.produtoNome} (${v.nome})`;
  }
  return `${v.produtoNome} (${v.nome})`;
}

function componente(tipo: ComponenteItem["tipo"], v: VariacaoParaPreco): ComponenteItem {
  return {
    tipo,
    produtoId: v.produtoId,
    variacaoId: v.id,
    produtoNome: v.produtoNome,
    variacaoNome: v.nome,
    precoCentavos: v.precoCentavos,
  };
}

export function precificarItens(
  itens: ItemPedidoArgs[],
  variacoes: ReadonlyMap<string, VariacaoParaPreco>
): ResultadoPrecificacao {
  const erros: string[] = [];
  const precificados: ItemPrecificado[] = [];

  itens.forEach((item, indice) => {
    const errosDoItem: string[] = [];
    const erro = (mensagem: string) => errosDoItem.push(`Item ${indice + 1}: ${mensagem}`);

    const sabores: VariacaoParaPreco[] = [];
    for (const sabor of item.sabores) {
      const v = variacoes.get(sabor.variacao_id);
      if (!v) {
        erro(`a variação ${sabor.variacao_id} não existe no cardápio`);
      } else if (v.produtoId !== sabor.produto_id) {
        erro(`a variação "${v.nome}" não pertence ao produto informado`);
      } else if (!disponivel(v)) {
        erro(`"${nomeSabor(v)}" não está disponível no momento`);
      } else if (v.tipo !== "tamanho" && v.tipo !== "padrao") {
        erro(`"${v.nome}" é ${v.tipo}; informe-a em "adicionais", não como sabor`);
      } else {
        sabores.push(v);
      }
    }

    const [primeiro, segundo] = sabores;
    if (primeiro && segundo) {
      if (primeiro.tipo !== "tamanho" || segundo.tipo !== "tamanho") {
        erro("meio a meio só é possível para pizzas (produtos com tamanho)");
      } else if (normalizar(primeiro.nome) !== normalizar(segundo.nome)) {
        erro(`os dois sabores precisam ser do mesmo tamanho (${primeiro.nome} x ${segundo.nome})`);
      } else if (primeiro.produtoId === segundo.produtoId) {
        erro("meio a meio precisa de dois sabores diferentes");
      }
    }

    // Produtos pedidos (e não só os sabores válidos), para que um sabor
    // indisponível não gere também um erro enganoso sobre a borda.
    const produtosDosSabores = new Set(item.sabores.map((s) => s.produto_id));
    const adicionais: VariacaoParaPreco[] = [];
    const vistos = new Set<string>();
    for (const adicionalId of item.adicionais) {
      if (vistos.has(adicionalId)) {
        erro("o mesmo adicional foi informado mais de uma vez");
        continue;
      }
      vistos.add(adicionalId);
      const v = variacoes.get(adicionalId);
      if (!v) {
        erro(`o adicional ${adicionalId} não existe no cardápio`);
      } else if (v.tipo !== "borda" && v.tipo !== "adicional") {
        erro(`"${v.nome}" não é borda nem adicional`);
      } else if (!produtosDosSabores.has(v.produtoId)) {
        erro(`"${v.nome}" não é oferecido para esse produto`);
      } else if (!disponivel(v)) {
        erro(`"${v.nome}" não está disponível no momento`);
      } else {
        adicionais.push(v);
      }
    }
    if (adicionais.filter((a) => a.tipo === "borda").length > 1) {
      erro("só é possível uma borda por pizza");
    }

    if (errosDoItem.length > 0 || !primeiro) {
      erros.push(...errosDoItem);
      return;
    }

    const precoBase = Math.max(...sabores.map((s) => s.precoCentavos));
    const precoUnitario = precoBase + adicionais.reduce((soma, a) => soma + a.precoCentavos, 0);

    const descricaoSabores = segundo
      ? `Meio a meio ${primeiro.produtoNome} / ${segundo.produtoNome} (${primeiro.nome})`
      : nomeSabor(primeiro);
    const descricao = [descricaoSabores, ...adicionais.map((a) => a.nome)].join(" + ");

    precificados.push({
      quantidade: item.quantidade,
      precoUnitarioCentavos: precoUnitario,
      subtotalCentavos: precoUnitario * item.quantidade,
      descricao,
      observacao: item.observacao,
      componentes: [
        ...sabores.map((s) => componente("sabor", s)),
        ...adicionais.map((a) => componente("adicional", a)),
      ],
    });
  });

  if (erros.length > 0) return { ok: false, erros };
  return {
    ok: true,
    itens: precificados,
    subtotalCentavos: precificados.reduce((soma, i) => soma + i.subtotalCentavos, 0),
  };
}

export interface Cotacao {
  itens: ItemPrecificado[];
  subtotalCentavos: number;
  taxaEntregaCentavos: number;
  totalCentavos: number;
  bairro: BairroEntrega | null;
}

export type ResultadoCotacao = { ok: true; cotacao: Cotacao } | { ok: false; erros: string[] };

/** Precificação + taxa de entrega do bairro + pedido mínimo. */
export function cotarPedido(params: {
  itens: ItemPedidoArgs[];
  variacoes: ReadonlyMap<string, VariacaoParaPreco>;
  tipoEntrega: TipoEntrega;
  bairroId: string | null | undefined;
  bairros: BairroEntrega[];
  pedidoMinimoCentavos: number;
}): ResultadoCotacao {
  const precificacao = precificarItens(params.itens, params.variacoes);
  const erros = precificacao.ok ? [] : [...precificacao.erros];

  let bairro: BairroEntrega | null = null;
  if (params.tipoEntrega === "entrega") {
    bairro = params.bairros.find((b) => b.id === params.bairroId) ?? null;
    if (!bairro) {
      erros.push(
        params.bairros.length
          ? `Bairro não atendido. Bairros atendidos: ${params.bairros.map((b) => b.nome).join(", ")}`
          : "No momento não estamos fazendo entregas, apenas retirada"
      );
    }
  }

  if (precificacao.ok && precificacao.subtotalCentavos < params.pedidoMinimoCentavos) {
    erros.push(`O pedido mínimo é ${formatarReais(params.pedidoMinimoCentavos)}`);
  }

  if (!precificacao.ok || erros.length > 0) return { ok: false, erros };

  const taxa = bairro?.taxaCentavos ?? 0;
  return {
    ok: true,
    cotacao: {
      itens: precificacao.itens,
      subtotalCentavos: precificacao.subtotalCentavos,
      taxaEntregaCentavos: taxa,
      totalCentavos: precificacao.subtotalCentavos + taxa,
      bairro,
    },
  };
}

/** IDs de variação referenciados pelos itens (sabores + adicionais). */
export function idsDeVariacao(itens: ItemPedidoArgs[]): string[] {
  return [
    ...new Set(itens.flatMap((i) => [...i.sabores.map((s) => s.variacao_id), ...i.adicionais])),
  ];
}
