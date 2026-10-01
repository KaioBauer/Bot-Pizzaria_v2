import {
  paraCentavos,
  type CardapioRepo,
  type CategoriaCardapio,
  type TipoVariacao,
} from "@pizzaria/shared";
import { exigir, type Db } from "../client";

const ORDEM_TIPO: Record<TipoVariacao, number> = {
  padrao: 0,
  tamanho: 1,
  borda: 2,
  adicional: 3,
};

export function criarCardapioRepo(db: Db): CardapioRepo {
  return {
    /**
     * Cardápio vendável numa única consulta (embed). Produto sem nenhuma
     * variação vendável (tamanho/padrão) ativa fica de fora.
     */
    async ativo() {
      const categorias = exigir(
        await db
          .from("categorias")
          .select(
            "id, nome, ordem, produtos(id, nome, descricao, imagem_url, ativo, variacoes_produto(id, nome, tipo, preco, ativo))"
          )
          .order("ordem"),
        "Erro ao carregar cardápio"
      );

      return categorias
        .map(
          (categoria): CategoriaCardapio => ({
            id: categoria.id,
            nome: categoria.nome,
            ordem: categoria.ordem,
            produtos: categoria.produtos
              .filter((produto) => produto.ativo)
              .map((produto) => ({
                id: produto.id,
                nome: produto.nome,
                descricao: produto.descricao,
                imagemUrl: produto.imagem_url,
                variacoes: produto.variacoes_produto
                  .filter((variacao) => variacao.ativo)
                  .map((variacao) => ({
                    id: variacao.id,
                    nome: variacao.nome,
                    tipo: variacao.tipo as TipoVariacao,
                    precoCentavos: paraCentavos(variacao.preco),
                  }))
                  .sort(
                    (a, b) =>
                      ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo] ||
                      a.precoCentavos - b.precoCentavos
                  ),
              }))
              .filter((produto) =>
                produto.variacoes.some((v) => v.tipo === "tamanho" || v.tipo === "padrao")
              )
              .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
          })
        )
        .filter((categoria) => categoria.produtos.length > 0);
    },

    async variacoesPorIds(ids) {
      if (ids.length === 0) return [];
      const variacoes = exigir(
        await db
          .from("variacoes_produto")
          .select("id, nome, tipo, preco, ativo, produto:produtos(id, nome, ativo)")
          .in("id", ids),
        "Erro ao revalidar itens"
      );
      return variacoes.map((v) => ({
        id: v.id,
        nome: v.nome,
        tipo: v.tipo as TipoVariacao,
        precoCentavos: paraCentavos(v.preco),
        ativa: v.ativo,
        produtoId: v.produto.id,
        produtoNome: v.produto.nome,
        produtoAtivo: v.produto.ativo,
      }));
    },
  };
}
