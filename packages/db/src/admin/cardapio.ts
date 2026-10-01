import type { SupabaseClient } from "@supabase/supabase-js";
import type { TipoVariacao } from "@pizzaria/shared";
import type { Tables } from "../database.types";

// Módulo provisório do painel atual; reescrito na Fase 4 (CRUD de cardápio).

type Id = string;
export type Categoria = Pick<Tables<"categorias">, "id" | "nome" | "ordem">;
export type Produto = Tables<"produtos">;
export type VariacaoProduto = Pick<
  Tables<"variacoes_produto">,
  "id" | "produto_id" | "nome" | "tipo" | "preco" | "ativo"
>;
export type ProdutoComVariacoes = Produto & { variacoes: VariacaoProduto[] };

/** Visão de administração: inclui produtos e variações inativos também. */
export async function listarCategoriasComProdutos(
  client: SupabaseClient
): Promise<Array<Categoria & { produtos: ProdutoComVariacoes[] }>> {
  const { data: categorias, error: categoriasError } = await client
    .from("categorias")
    .select("id, nome, ordem")
    .order("ordem", { ascending: true });
  if (categoriasError) throw categoriasError;

  const { data: produtos, error: produtosError } = await client
    .from("produtos")
    .select(
      "id, categoria_id, nome, descricao, imagem_url, ativo, created_at, updated_at"
    );
  if (produtosError) throw produtosError;

  const { data: variacoes, error: variacoesError } = await client
    .from("variacoes_produto")
    .select("id, produto_id, nome, tipo, preco, ativo");
  if (variacoesError) throw variacoesError;

  return (categorias ?? []).map((categoria) => ({
    ...categoria,
    produtos: (produtos ?? [])
      .filter((produto) => produto.categoria_id === categoria.id)
      .map((produto) => ({
        ...produto,
        variacoes: (variacoes ?? []).filter(
          (variacao) => variacao.produto_id === produto.id
        ),
      })),
  }));
}

export async function criarCategoria(
  client: SupabaseClient,
  input: { nome: string; ordem: number }
): Promise<Categoria> {
  const { data, error } = await client
    .from("categorias")
    .insert(input)
    .select("id, nome, ordem")
    .single();
  if (error) throw error;
  return data as Categoria;
}

export async function atualizarCategoria(
  client: SupabaseClient,
  id: Id,
  patch: Partial<Pick<Categoria, "nome" | "ordem">>
): Promise<Categoria> {
  const { data, error } = await client
    .from("categorias")
    .update(patch)
    .eq("id", id)
    .select("id, nome, ordem")
    .single();
  if (error) throw error;
  return data as Categoria;
}

export async function criarProduto(
  client: SupabaseClient,
  input: {
    categoria_id: Id;
    nome: string;
    descricao?: string | null;
    imagem_url?: string | null;
  }
): Promise<Produto> {
  const { data, error } = await client
    .from("produtos")
    .insert({ ...input, ativo: true })
    .select(
      "id, categoria_id, nome, descricao, imagem_url, ativo, created_at, updated_at"
    )
    .single();
  if (error) throw error;
  return data as Produto;
}

export async function atualizarProduto(
  client: SupabaseClient,
  id: Id,
  patch: Partial<
    Pick<Produto, "categoria_id" | "nome" | "descricao" | "imagem_url" | "ativo">
  >
): Promise<Produto> {
  const { data, error } = await client
    .from("produtos")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(
      "id, categoria_id, nome, descricao, imagem_url, ativo, created_at, updated_at"
    )
    .single();
  if (error) throw error;
  return data as Produto;
}

export async function criarVariacao(
  client: SupabaseClient,
  input: {
    produto_id: Id;
    nome: string;
    tipo: TipoVariacao;
    preco: number;
  }
): Promise<VariacaoProduto> {
  const { data, error } = await client
    .from("variacoes_produto")
    .insert({ ...input, ativo: true })
    .select("id, produto_id, nome, tipo, preco, ativo")
    .single();
  if (error) throw error;
  return data as VariacaoProduto;
}

export async function atualizarVariacao(
  client: SupabaseClient,
  id: Id,
  patch: Partial<Pick<VariacaoProduto, "nome" | "tipo" | "preco" | "ativo">>
): Promise<VariacaoProduto> {
  const { data, error } = await client
    .from("variacoes_produto")
    .update(patch)
    .eq("id", id)
    .select("id, produto_id, nome, tipo, preco, ativo")
    .single();
  if (error) throw error;
  return data as VariacaoProduto;
}
