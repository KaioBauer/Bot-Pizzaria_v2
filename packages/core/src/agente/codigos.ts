import type { BairroEntrega, CategoriaCardapio } from "@pizzaria/shared";

/**
 * Códigos curtos para o modelo. Modelos pequenos não copiam UUIDs de 36
 * caracteres com fidelidade: acertam o começo e inventam o resto. O cardápio e
 * os bairros vão para o modelo com o início do ID (8 caracteres, ou mais se
 * houver colisão) e o servidor expande de volta antes de validar.
 * Um UUID completo corrompido também é recuperado pelo começo, quando único.
 * Preço continua sendo só do servidor: o código só aponta para a variação.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Menor prefixo (a partir de 8) que identifica cada ID sem ambiguidade. */
export function abreviar(ids: string[]): Map<string, string> {
  const curtos = new Map<string, string>();
  for (const id of ids) {
    for (let tamanho = 8; tamanho <= id.length; tamanho++) {
      const prefixo = id.slice(0, tamanho);
      if (prefixo.endsWith("-")) continue;
      if (ids.filter((outro) => outro.startsWith(prefixo)).length === 1 || tamanho === id.length) {
        curtos.set(id, prefixo);
        break;
      }
    }
  }
  return curtos;
}

/** Acha o ID completo a partir do código curto (ou de um UUID com o fim corrompido). */
export function expandirId(valor: unknown, ids: readonly string[]): unknown {
  if (typeof valor !== "string") return valor;
  const v = valor.trim().toLowerCase();
  if (ids.includes(v)) return v;
  // Código curto, ou UUID inventado: vale o começo, se apontar para um só ID.
  const prefixo = UUID.test(v) ? v.slice(0, 8) : v;
  if (prefixo.length < 6) return valor;
  const candidatos = ids.filter((id) => id.startsWith(prefixo));
  return candidatos.length === 1 ? candidatos[0] : valor;
}

export interface Codigos {
  variacoes: Map<string, string>;
  produtos: Map<string, string>;
  bairros: Map<string, string>;
  /** Produto de cada variação (para corrigir o produto_id do sabor). */
  produtoDaVariacao: Map<string, string>;
}

export function montarCodigos(categorias: CategoriaCardapio[], bairros: BairroEntrega[]): Codigos {
  const produtos = categorias.flatMap((c) => c.produtos);
  const variacoes = produtos.flatMap((p) => p.variacoes.map((v) => ({ id: v.id, produtoId: p.id })));
  return {
    variacoes: abreviar(variacoes.map((v) => v.id)),
    produtos: abreviar(produtos.map((p) => p.id)),
    bairros: abreviar(bairros.map((b) => b.id)),
    produtoDaVariacao: new Map(variacoes.map((v) => [v.id, v.produtoId])),
  };
}

type Objeto = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Expande os IDs dos argumentos de calcular_pedido/finalizar_pedido. O produto
 * de cada sabor passa a ser o da variação (o modelo erra o produto_id; a
 * variação já diz qual é). Argumentos que não são objeto voltam como vieram.
 */
export function expandirArgumentos(argumentos: unknown, codigos: Codigos): unknown {
  if (!ehObjeto(argumentos)) return argumentos;
  const variacoes = [...codigos.variacoes.keys()];
  const produtos = [...codigos.produtos.keys()];
  const bairros = [...codigos.bairros.keys()];
  const resultado: Objeto = { ...argumentos };

  if (Array.isArray(argumentos.itens)) {
    resultado.itens = argumentos.itens.map((item) => {
      if (!ehObjeto(item)) return item;
      const novo: Objeto = { ...item };
      if (Array.isArray(item.sabores)) {
        novo.sabores = item.sabores.map((sabor) => {
          if (!ehObjeto(sabor)) return sabor;
          const variacaoId = expandirId(sabor.variacao_id, variacoes);
          const produtoDaVariacao = typeof variacaoId === "string" ? codigos.produtoDaVariacao.get(variacaoId) : undefined;
          return { ...sabor, variacao_id: variacaoId, produto_id: produtoDaVariacao ?? expandirId(sabor.produto_id, produtos) };
        });
      }
      if (Array.isArray(item.adicionais)) novo.adicionais = item.adicionais.map((a) => expandirId(a, variacoes));
      return novo;
    });
  }
  if ("bairro_id" in argumentos) resultado.bairro_id = expandirId(argumentos.bairro_id, bairros);
  if (ehObjeto(argumentos.endereco)) resultado.endereco = { ...argumentos.endereco, bairro_id: expandirId(argumentos.endereco.bairro_id, bairros) };
  return resultado;
}
