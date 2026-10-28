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
     * variação vendável (tamanho/padrão) ativa fica de fora, e o "Monte a sua"
     * (montagem livre, só no pedido por link) também.
     */
    async ativo() {
      const categorias = exigir(
        await db
          .from("categorias")
          .select(
            "id, nome, ordem, ativo, produtos(id, nome, descricao, imagem_url, ativo, montagem_livre, ordem, variacoes_produto(id, nome, tipo, preco, ativo, ordem))"
          )
          .order("ordem"),
        "Erro ao carregar cardápio"
      );

      return categorias
        .filter((categoria) => categoria.ativo)
        .map(
          (categoria): CategoriaCardapio => ({
            id: categoria.id,
            nome: categoria.nome,
            ordem: categoria.ordem,
            produtos: categoria.produtos
              .filter((produto) => produto.ativo && !produto.montagem_livre)
              .map((produto) => ({
                ordem: produto.ordem,
                id: produto.id,
                nome: produto.nome,
                descricao: produto.descricao,
                imagemUrl: produto.imagem_url,
                variacoes: produto.variacoes_produto
                  .filter((variacao) => variacao.ativo)
                  .sort((a, b) => a.ordem - b.ordem)
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
              .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
              .map(({ ordem: _ordem, ...produto }) => produto),
          })
        )
        .filter((categoria) => categoria.produtos.length > 0);
    },

    async variacoesPorIds(ids) {
      if (ids.length === 0) return [];
      const variacoes = exigir(
        await db
          .from("variacoes_produto")
          .select("id, nome, tipo, preco, ativo, produto:produtos(id, nome, ativo, montagem_livre)")
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
        montagemLivre: v.produto.montagem_livre,
      }));
    },

    async ingredientesPorIds(ids) {
      if (ids.length === 0) return [];
      const ingredientes = exigir(
        await db
          .from("ingredientes")
          .select("id, nome, ativo, ingrediente_precos(preco, tamanho:tamanhos_pizza(nome))")
          .in("id", ids),
        "Erro ao revalidar ingredientes"
      );
      return ingredientes.map((i) => ({
        id: i.id,
        nome: i.nome,
        ativo: i.ativo,
        precosCentavos: Object.fromEntries(i.ingrediente_precos.map((p) => [p.tamanho.nome, paraCentavos(p.preco)])),
      }));
    },
  };
}
