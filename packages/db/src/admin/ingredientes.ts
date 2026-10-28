import { paraCentavos, paraReais } from "@pizzaria/shared";
import { exigir, ErroBanco, type Db } from "../client";

/**
 * Ingredientes da montagem visual (/pedir): catálogo único com preço por
 * tamanho de pizza. Sem preço num tamanho = não oferecido nesse tamanho.
 */

export interface IngredienteAdmin {
  id: string;
  nome: string;
  imagemCamadaUrl: string | null;
  /** "cobertura" cobre a pizza inteira (queijo ralado); "pedacos" cai em pedaços. */
  camadaTipo: CamadaTipo;
  ativo: boolean;
  ordem: number;
  /** tamanho_id -> preço em centavos (só os tamanhos em que é oferecido). */
  precos: Record<string, number>;
}

export type CamadaTipo = "pedacos" | "cobertura";

export interface DadosIngrediente {
  id?: string;
  nome: string;
  camadaTipo: CamadaTipo;
  ativo: boolean;
  ordem: number;
  precos: Array<{ tamanhoId: string; precoCentavos: number }>;
}

const VIOLACAO_FK = "23503";
const VIOLACAO_UNIQUE = "23505";

export async function listarIngredientesAdmin(db: Db): Promise<IngredienteAdmin[]> {
  const linhas = exigir(
    await db
      .from("ingredientes")
      .select("id, nome, imagem_camada_url, camada_tipo, ativo, ordem, ingrediente_precos(tamanho_id, preco)")
      .order("ordem")
      .order("nome"),
    "Erro ao carregar ingredientes"
  );
  return linhas.map((i) => ({
    id: i.id,
    nome: i.nome,
    imagemCamadaUrl: i.imagem_camada_url,
    camadaTipo: i.camada_tipo as CamadaTipo,
    ativo: i.ativo,
    ordem: i.ordem,
    precos: Object.fromEntries(i.ingrediente_precos.map((p) => [p.tamanho_id, paraCentavos(p.preco)])),
  }));
}

export async function obterIngredienteAdmin(db: Db, id: string): Promise<IngredienteAdmin | null> {
  return (await listarIngredientesAdmin(db)).find((i) => i.id === id) ?? null;
}

/** Salva o ingrediente e substitui a tabela de preços por tamanho. */
export async function salvarIngrediente(db: Db, dados: DadosIngrediente): Promise<string> {
  const linha = { nome: dados.nome, camada_tipo: dados.camadaTipo, ativo: dados.ativo, ordem: dados.ordem };
  const resultado = dados.id
    ? await db.from("ingredientes").update(linha).eq("id", dados.id).select("id").single()
    : await db.from("ingredientes").insert(linha).select("id").single();
  if (resultado.error?.code === VIOLACAO_UNIQUE) {
    throw new ErroBanco(`Já existe um ingrediente chamado "${dados.nome}".`, resultado.error.code);
  }
  const id = exigir(resultado, "Erro ao salvar ingrediente").id;

  const oferecidos = dados.precos.map((p) => p.tamanhoId);
  let remover = db.from("ingrediente_precos").delete().eq("ingrediente_id", id);
  if (oferecidos.length) remover = remover.not("tamanho_id", "in", `(${oferecidos.join(",")})`);
  exigir(await remover.select("ingrediente_id"), "Erro ao atualizar preços do ingrediente");

  if (dados.precos.length) {
    exigir(
      await db
        .from("ingrediente_precos")
        .upsert(
          dados.precos.map((p) => ({ ingrediente_id: id, tamanho_id: p.tamanhoId, preco: paraReais(p.precoCentavos) })),
          { onConflict: "ingrediente_id,tamanho_id" }
        )
        .select("ingrediente_id"),
      "Erro ao salvar preços do ingrediente"
    );
  }
  return id;
}

/** Exclui o ingrediente. Se já foi vendido (FK em itens_pedido_componentes), pede para desativar. */
export async function excluirIngrediente(db: Db, id: string): Promise<void> {
  const { error } = await db.from("ingredientes").delete().eq("id", id);
  if (error?.code === VIOLACAO_FK) {
    throw new ErroBanco(
      "Este ingrediente já aparece em pedidos e não pode ser excluído (histórico). Desative-o para tirá-lo da montagem.",
      error.code
    );
  }
  if (error) throw new ErroBanco(`Erro ao excluir ingrediente: ${error.message}`, error.code);
}

export async function definirImagemCamadaIngrediente(db: Db, id: string, url: string | null): Promise<void> {
  exigir(
    await db.from("ingredientes").update({ imagem_camada_url: url }).eq("id", id).select("id"),
    "Erro ao salvar camada"
  );
}

// Camadas das bordas -----------------------------------------------------------------

export interface CamadaBordaAdmin {
  /** Nome da borda (igual em todos os produtos que a oferecem). */
  nome: string;
  imagemUrl: string | null;
  /** Em quantos produtos esta borda aparece. */
  produtos: number;
}

/** Nomes distintos de borda no cardápio + a camada de cada um (se houver). */
export async function listarCamadasBorda(db: Db): Promise<CamadaBordaAdmin[]> {
  const [variacoes, camadas] = await Promise.all([
    db.from("variacoes_produto").select("nome, produto_id").eq("tipo", "borda"),
    db.from("camadas_borda").select("nome, imagem_url"),
  ]);
  const imagens = new Map(exigir(camadas, "Erro ao carregar camadas").map((c) => [c.nome, c.imagem_url]));
  const porNome = new Map<string, Set<string>>();
  for (const v of exigir(variacoes, "Erro ao carregar bordas")) {
    const produtos = porNome.get(v.nome) ?? new Set<string>();
    produtos.add(v.produto_id);
    porNome.set(v.nome, produtos);
  }
  return [...porNome]
    .map(([nome, produtos]) => ({ nome, imagemUrl: imagens.get(nome) ?? null, produtos: produtos.size }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function obterCamadaBorda(db: Db, nome: string): Promise<string | null> {
  const { data, error } = await db.from("camadas_borda").select("imagem_url").eq("nome", nome).maybeSingle();
  if (error) throw new ErroBanco(`Erro ao carregar camada: ${error.message}`, error.code);
  return data?.imagem_url ?? null;
}

export async function definirCamadaBorda(db: Db, nome: string, url: string | null): Promise<void> {
  if (url === null) {
    exigir(await db.from("camadas_borda").delete().eq("nome", nome).select("nome"), "Erro ao remover camada");
    return;
  }
  exigir(
    await db.from("camadas_borda").upsert({ nome, imagem_url: url }, { onConflict: "nome" }).select("nome"),
    "Erro ao salvar camada"
  );
}
