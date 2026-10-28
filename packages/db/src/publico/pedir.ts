import { paraCentavos, type TamanhoPizza } from "@pizzaria/shared";
import { exigir, type Db } from "../client";

/**
 * Catálogo do pedido por link (/pedir), lido com a chave anon (RLS público).
 * Tudo serializável: vai do Server Component para o PizzaBuilder no navegador.
 * O preço aqui é só prévia — o bot reprecifica a partir dos IDs.
 */

export interface VariacaoPedir {
  id: string;
  nome: string;
  tipo: "tamanho" | "padrao" | "borda" | "adicional";
  precoCentavos: number;
}

export interface ProdutoPedir {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  imagemUrl: string | null;
  /** Vista de cima, fundo transparente (montagem visual). */
  camadaUrl: string | null;
  montagemLivre: boolean;
  variacoes: VariacaoPedir[];
}

export interface IngredientePedir {
  id: string;
  nome: string;
  camadaUrl: string | null;
  /** "cobertura" cobre a pizza inteira; "pedacos" cai em pedaços. */
  camadaTipo: "pedacos" | "cobertura";
  /** Preço por nome de tamanho; ausente = não oferecido nesse tamanho. */
  precosCentavos: Record<string, number>;
}

export interface CatalogoPedir {
  tamanhos: TamanhoPizza[];
  /** Pizzas (produtos com variação de tamanho), incluindo o "Monte a sua". */
  pizzas: ProdutoPedir[];
  /** Bebidas e outros produtos de preço único. */
  outros: ProdutoPedir[];
  ingredientes: IngredientePedir[];
  /** Imagem de camada por nome de borda. */
  camadasBorda: Record<string, string>;
}

export async function catalogoPedir(db: Db, tamanhos: TamanhoPizza[]): Promise<CatalogoPedir> {
  const [categorias, ingredientes, bordas] = await Promise.all([
    db
      .from("categorias")
      .select(
        "nome, ordem, ativo, produtos(id, nome, descricao, imagem_url, imagem_camada_url, montagem_livre, ativo, ordem, variacoes_produto(id, nome, tipo, preco, ativo, ordem))"
      )
      .order("ordem"),
    db
      .from("ingredientes")
      .select("id, nome, imagem_camada_url, camada_tipo, ativo, ordem, ingrediente_precos(preco, tamanho:tamanhos_pizza(nome))")
      .eq("ativo", true)
      .order("ordem")
      .order("nome"),
    db.from("camadas_borda").select("nome, imagem_url"),
  ]);

  const produtos: ProdutoPedir[] = exigir(categorias, "Erro ao carregar cardápio")
    .filter((c) => c.ativo)
    .flatMap((c) =>
      c.produtos
        .filter((p) => p.ativo)
        .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          descricao: p.descricao,
          categoria: c.nome,
          imagemUrl: p.imagem_url,
          camadaUrl: p.imagem_camada_url,
          montagemLivre: p.montagem_livre,
          variacoes: p.variacoes_produto
            .filter((v) => v.ativo)
            .sort((a, b) => a.ordem - b.ordem)
            .map((v) => ({ id: v.id, nome: v.nome, tipo: v.tipo as VariacaoPedir["tipo"], precoCentavos: paraCentavos(v.preco) })),
        }))
    );

  return {
    tamanhos,
    pizzas: produtos.filter((p) => p.variacoes.some((v) => v.tipo === "tamanho")),
    outros: produtos.filter((p) => !p.variacoes.some((v) => v.tipo === "tamanho") && p.variacoes.some((v) => v.tipo === "padrao")),
    ingredientes: exigir(ingredientes, "Erro ao carregar ingredientes").map((i) => ({
      id: i.id,
      nome: i.nome,
      camadaUrl: i.imagem_camada_url,
      camadaTipo: i.camada_tipo === "cobertura" ? "cobertura" : "pedacos",
      precosCentavos: Object.fromEntries(i.ingrediente_precos.map((p) => [p.tamanho.nome, paraCentavos(p.preco)])),
    })),
    camadasBorda: Object.fromEntries(exigir(bordas, "Erro ao carregar camadas das bordas").map((b) => [b.nome, b.imagem_url])),
  };
}
