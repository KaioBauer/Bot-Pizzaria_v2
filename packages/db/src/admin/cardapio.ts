import { paraCentavos, paraReais, type TipoVariacao } from "@pizzaria/shared";
import { exigir, ErroBanco, type Db } from "../client";

/** Visão de administração do cardápio: inclui itens inativos. Valores em centavos. */

export interface VariacaoAdmin {
  id: string;
  nome: string;
  tipo: TipoVariacao;
  precoCentavos: number;
  ativo: boolean;
  ordem: number;
}

export interface ProdutoAdmin {
  id: string;
  categoriaId: string;
  nome: string;
  descricao: string | null;
  imagemUrl: string | null;
  ativo: boolean;
  ordem: number;
  variacoes: VariacaoAdmin[];
}

export interface CategoriaAdmin {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  produtos: ProdutoAdmin[];
}

const VIOLACAO_FK = "23503";

const ORDEM_TIPO: Record<TipoVariacao, number> = { padrao: 0, tamanho: 0, borda: 1, adicional: 2 };

const porOrdem = <T extends { ordem: number; nome: string }>(a: T, b: T) =>
  a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR");

export async function listarCardapioAdmin(db: Db): Promise<CategoriaAdmin[]> {
  const categorias = exigir(
    await db
      .from("categorias")
      .select(
        "id, nome, ordem, ativo, produtos(id, categoria_id, nome, descricao, imagem_url, ativo, ordem, variacoes_produto(id, nome, tipo, preco, ativo, ordem))"
      )
      .order("ordem"),
    "Erro ao carregar cardápio"
  );
  return categorias.map((c) => ({
    id: c.id,
    nome: c.nome,
    ordem: c.ordem,
    ativo: c.ativo,
    produtos: c.produtos
      .map((p) => ({
        id: p.id,
        categoriaId: p.categoria_id,
        nome: p.nome,
        descricao: p.descricao,
        imagemUrl: p.imagem_url,
        ativo: p.ativo,
        ordem: p.ordem,
        variacoes: p.variacoes_produto
          .map((v) => ({
            id: v.id,
            nome: v.nome,
            tipo: v.tipo as TipoVariacao,
            precoCentavos: paraCentavos(v.preco),
            ativo: v.ativo,
            ordem: v.ordem,
          }))
          .sort((a, b) => ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo] || a.ordem - b.ordem || a.precoCentavos - b.precoCentavos),
      }))
      .sort(porOrdem),
  }));
}

export async function obterProdutoAdmin(db: Db, id: string): Promise<ProdutoAdmin | null> {
  for (const categoria of await listarCardapioAdmin(db)) {
    const produto = categoria.produtos.find((p) => p.id === id);
    if (produto) return produto;
  }
  return null;
}

export async function salvarCategoria(
  db: Db,
  dados: { id?: string; nome: string; ordem: number; ativo: boolean }
): Promise<string> {
  const linha = { nome: dados.nome, ordem: dados.ordem, ativo: dados.ativo };
  const resultado = dados.id
    ? await db.from("categorias").update(linha).eq("id", dados.id).select("id").single()
    : await db.from("categorias").insert(linha).select("id").single();
  return exigir(resultado, "Erro ao salvar categoria").id;
}

export async function excluirCategoria(db: Db, id: string): Promise<void> {
  const { error } = await db.from("categorias").delete().eq("id", id);
  if (error?.code === VIOLACAO_FK) {
    throw new ErroBanco("A categoria ainda tem produtos. Mova ou exclua os produtos antes.", error.code);
  }
  if (error) throw new ErroBanco(`Erro ao excluir categoria: ${error.message}`, error.code);
}

export interface DadosProduto {
  id?: string;
  categoriaId: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  ordem: number;
  variacoes: Array<{
    id?: string;
    nome: string;
    tipo: TipoVariacao;
    precoCentavos: number;
    ativo: boolean;
    ordem: number;
  }>;
}

/**
 * Salva produto e variações. Variações removidas do formulário são
 * excluídas; as que já aparecem em pedidos não podem ser excluídas (histórico)
 * e são apenas desativadas.
 */
export async function salvarProduto(db: Db, dados: DadosProduto): Promise<{ id: string; desativadas: number }> {
  const linha = {
    categoria_id: dados.categoriaId,
    nome: dados.nome,
    descricao: dados.descricao,
    ativo: dados.ativo,
    ordem: dados.ordem,
  };
  const resultado = dados.id
    ? await db.from("produtos").update(linha).eq("id", dados.id).select("id").single()
    : await db.from("produtos").insert(linha).select("id").single();
  const id = exigir(resultado, "Erro ao salvar produto").id;

  const existentes = exigir(
    await db.from("variacoes_produto").select("id").eq("produto_id", id),
    "Erro ao carregar variações"
  ).map((v) => v.id);
  const mantidas = new Set(dados.variacoes.flatMap((v) => (v.id ? [v.id] : [])));

  for (const v of dados.variacoes) {
    const linhaVariacao = {
      produto_id: id,
      nome: v.nome,
      tipo: v.tipo,
      preco: paraReais(v.precoCentavos),
      ativo: v.ativo,
      ordem: v.ordem,
    };
    exigir(
      v.id && existentes.includes(v.id)
        ? await db.from("variacoes_produto").update(linhaVariacao).eq("id", v.id).select("id")
        : await db.from("variacoes_produto").insert(linhaVariacao).select("id"),
      "Erro ao salvar variação"
    );
  }

  let desativadas = 0;
  for (const removida of existentes.filter((vid) => !mantidas.has(vid))) {
    const { error } = await db.from("variacoes_produto").delete().eq("id", removida);
    if (error?.code === VIOLACAO_FK) {
      exigir(
        await db.from("variacoes_produto").update({ ativo: false }).eq("id", removida).select("id"),
        "Erro ao desativar variação"
      );
      desativadas++;
    } else if (error) {
      throw new ErroBanco(`Erro ao remover variação: ${error.message}`, error.code);
    }
  }
  return { id, desativadas };
}

/** Exclui o produto; se já foi vendido, só desativa (preserva o histórico). */
export async function excluirProduto(db: Db, id: string): Promise<"excluido" | "desativado"> {
  const { error } = await db.from("produtos").delete().eq("id", id);
  if (!error) return "excluido";
  if (error.code === VIOLACAO_FK) {
    exigir(await db.from("produtos").update({ ativo: false }).eq("id", id).select("id"), "Erro ao desativar produto");
    return "desativado";
  }
  throw new ErroBanco(`Erro ao excluir produto: ${error.message}`, error.code);
}

export async function alternarAtivoProduto(db: Db, id: string, ativo: boolean): Promise<void> {
  exigir(await db.from("produtos").update({ ativo }).eq("id", id).select("id"), "Erro ao atualizar produto");
}

export async function definirImagemProduto(db: Db, id: string, imagemUrl: string | null): Promise<void> {
  exigir(await db.from("produtos").update({ imagem_url: imagemUrl }).eq("id", id).select("id"), "Erro ao salvar foto");
}

/**
 * Define o adicional por sabor de uma categoria inteira: o preço de cada tamanho
 * dos sabores dela passa a ser "preço base do tamanho + adicional". Sobrescreve
 * exceções individuais (ex.: um sabor com adicional diferente).
 */
export async function definirAdicionalCategoria(db: Db, categoriaId: string, adicionalCentavos: number): Promise<number> {
  const [tamanhos, produtos] = await Promise.all([
    db.from("tamanhos_pizza").select("nome, preco_base"),
    db.from("produtos").select("id").eq("categoria_id", categoriaId),
  ]);
  const ids = exigir(produtos, "Erro ao carregar produtos").map((p) => p.id);
  if (ids.length === 0) return 0;
  let alteradas = 0;
  for (const t of exigir(tamanhos, "Erro ao carregar tamanhos")) {
    const r = await db
      .from("variacoes_produto")
      .update({ preco: paraReais(paraCentavos(t.preco_base) + adicionalCentavos) })
      .eq("tipo", "tamanho")
      .ilike("nome", t.nome)
      .in("produto_id", ids)
      .select("id");
    alteradas += exigir(r, "Erro ao aplicar adicional").length;
  }
  return alteradas;
}
