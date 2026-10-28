"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  alternarAtivoProduto,
  definirAdicionalCategoria,
  definirCamadaBorda,
  definirImagemCamadaIngrediente,
  definirImagemCamadaProduto,
  definirImagemProduto,
  excluirCategoria,
  excluirIngrediente,
  excluirProduto,
  listarCamadasBorda,
  listarTamanhos,
  obterCamadaBorda,
  obterIngredienteAdmin,
  obterProdutoAdmin,
  salvarCategoria,
  salvarIngrediente,
  salvarProduto,
} from "@pizzaria/db";
import { lerReais } from "@pizzaria/shared";
import { exigirAdmin } from "../../../../lib/auth";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const BUCKET = "produtos";
const TIPOS_IMAGEM = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

/** Camadas da montagem visual: bucket público, só PNG/WebP (transparência), até 1 MB. */
const BUCKET_CAMADAS = "camadas";
const TIPOS_CAMADA = { "image/png": "png", "image/webp": "webp" } as const;
const LIMITE_CAMADA = 1024 * 1024;

function atualizarTelas() {
  revalidatePath("/admin/cardapio", "layout");
  revalidatePath("/cardapio");
  revalidatePath("/pedir");
}

function mensagem(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Erro ao [^:]+: /, "") : "Erro inesperado.";
}

// Categorias (formulários simples; erro volta pela URL) ----------------------------

const categoriaSchema = z.object({
  id: z.uuid().optional(),
  nome: z.string().trim().min(2, "Nome muito curto").max(60),
  ordem: z.coerce.number().int().min(0).max(999).default(0),
  ativo: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export async function salvarCategoriaAction(formData: FormData) {
  const { supabase } = await exigirAdmin();
  const dados = categoriaSchema.safeParse({
    id: formData.get("id") || undefined,
    nome: formData.get("nome"),
    ordem: formData.get("ordem") || 0,
    ativo: formData.get("ativo") ?? "false",
  });
  let erro: string | null = null;
  if (!dados.success) erro = dados.error.issues[0]?.message ?? "Dados inválidos";
  else {
    try {
      await salvarCategoria(supabase, dados.data);
    } catch (err) {
      erro = mensagem(err);
    }
  }
  atualizarTelas();
  if (erro) redirect(`/admin/cardapio?erro=${encodeURIComponent(erro)}`);
}

export async function excluirCategoriaAction(formData: FormData) {
  const { supabase } = await exigirAdmin();
  let erro: string | null = null;
  try {
    await excluirCategoria(supabase, z.uuid().parse(formData.get("id")));
  } catch (err) {
    erro = mensagem(err);
  }
  atualizarTelas();
  if (erro) redirect(`/admin/cardapio?erro=${encodeURIComponent(erro)}`);
}

export async function definirAdicionalCategoriaAction(formData: FormData) {
  const { supabase } = await exigirAdmin();
  const adicional = lerReais(String(formData.get("adicional") ?? ""));
  let erro: string | null = null;
  if (adicional === null || adicional < 0 || adicional > 100_000) erro = "Adicional por sabor inválido";
  else {
    try {
      await definirAdicionalCategoria(supabase, z.uuid().parse(formData.get("id")), adicional);
    } catch (err) {
      erro = mensagem(err);
    }
  }
  atualizarTelas();
  if (erro) redirect(`/admin/cardapio?erro=${encodeURIComponent(erro)}`);
}

export async function alternarProdutoAction(formData: FormData) {
  const { supabase } = await exigirAdmin();
  await alternarAtivoProduto(supabase, z.uuid().parse(formData.get("id")), formData.get("ativo") === "true");
  atualizarTelas();
}

// Produto (editor com JS) ----------------------------------------------------------

const produtoSchema = z.object({
  id: z.uuid().optional(),
  categoriaId: z.uuid({ message: "Escolha a categoria" }),
  nome: z.string().trim().min(2, "Nome do produto muito curto").max(80),
  descricao: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
  ativo: z.boolean(),
  ordem: z.number().int().min(0).max(999),
  variacoes: z
    .array(
      z.object({
        id: z.uuid().optional(),
        nome: z.string().trim().min(1, "Toda variação precisa de nome").max(40),
        tipo: z.enum(["tamanho", "borda", "adicional", "padrao"]),
        precoCentavos: z.number().int().min(0, "Preço inválido").max(1_000_000),
        ativo: z.boolean(),
        ordem: z.number().int().min(0),
      })
    )
    .min(1, "Cadastre pelo menos um tamanho ou a variação única")
    .refine((vs) => vs.some((v) => v.tipo === "tamanho" || v.tipo === "padrao"), {
      message: "É preciso ao menos uma variação do tipo tamanho ou única (padrão)",
    })
    .refine((vs) => !(vs.some((v) => v.tipo === "padrao") && vs.some((v) => v.tipo === "tamanho")), {
      message: "Use tamanhos OU variação única, não os dois no mesmo produto",
    }),
});

export type DadosProdutoForm = z.input<typeof produtoSchema>;

export async function salvarProdutoAction(entrada: DadosProdutoForm): Promise<Resultado<{ id: string; aviso?: string }>> {
  const { supabase } = await exigirAdmin();
  const dados = produtoSchema.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: dados.error.issues[0]?.message ?? "Dados inválidos" };
  try {
    // "Monte a sua": as variações (preço base de cada tamanho) são mantidas pelo banco.
    const atual = dados.data.id ? await obterProdutoAdmin(supabase, dados.data.id) : null;
    if (atual?.montagemLivre) dados.data.variacoes = atual.variacoes;
    const { id, desativadas } = await salvarProduto(supabase, dados.data);
    atualizarTelas();
    return {
      ok: true,
      id,
      ...(desativadas
        ? { aviso: `${desativadas} variação(ões) já vendida(s) foram desativadas em vez de excluídas (histórico).` }
        : {}),
    };
  } catch (err) {
    return { ok: false, erro: mensagem(err) };
  }
}

export async function excluirProdutoAction(id: string): Promise<Resultado<{ resultado: "excluido" | "desativado" }>> {
  const { supabase } = await exigirAdmin();
  try {
    const produto = await obterProdutoAdmin(supabase, z.uuid().parse(id));
    const resultado = await excluirProduto(supabase, id);
    if (resultado === "excluido" && produto?.imagemUrl) await removerArquivo(supabase, produto.imagemUrl);
    if (resultado === "excluido" && produto?.imagemCamadaUrl) await removerCamada(supabase, produto.imagemCamadaUrl);
    atualizarTelas();
    return { ok: true, resultado };
  } catch (err) {
    return { ok: false, erro: mensagem(err) };
  }
}

// Fotos ----------------------------------------------------------------------------

type Sessao = Awaited<ReturnType<typeof exigirAdmin>>["supabase"];

async function removerArquivo(supabase: Sessao, url: string) {
  const caminho = url.split(`/storage/v1/object/public/${BUCKET}/`)[1];
  if (caminho) await supabase.storage.from(BUCKET).remove([decodeURIComponent(caminho)]);
}

export async function enviarFotoAction(formData: FormData): Promise<Resultado<{ url: string }>> {
  const { supabase } = await exigirAdmin();
  const produtoId = z.uuid().safeParse(formData.get("produtoId"));
  const foto = formData.get("foto");
  if (!produtoId.success) return { ok: false, erro: "Salve o produto antes de enviar a foto." };
  if (!(foto instanceof File) || foto.size === 0) return { ok: false, erro: "Escolha uma imagem." };
  const extensao = TIPOS_IMAGEM[foto.type as keyof typeof TIPOS_IMAGEM];
  if (!extensao) return { ok: false, erro: "Use JPG, PNG ou WebP." };
  if (foto.size > 5 * 1024 * 1024) return { ok: false, erro: "Imagem maior que 5 MB." };

  const produto = await obterProdutoAdmin(supabase, produtoId.data);
  if (!produto) return { ok: false, erro: "Produto não encontrado." };

  const caminho = `${produto.id}/${Date.now()}.${extensao}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, foto, { contentType: foto.type, cacheControl: "31536000", upsert: false });
  if (error) return { ok: false, erro: `Falha no envio: ${error.message}` };

  const url = supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  await definirImagemProduto(supabase, produto.id, url);
  if (produto.imagemUrl) await removerArquivo(supabase, produto.imagemUrl);
  atualizarTelas();
  return { ok: true, url };
}

export async function removerFotoAction(produtoId: string): Promise<Resultado> {
  const { supabase } = await exigirAdmin();
  const produto = await obterProdutoAdmin(supabase, z.uuid().parse(produtoId));
  if (!produto) return { ok: false, erro: "Produto não encontrado." };
  if (produto.imagemUrl) await removerArquivo(supabase, produto.imagemUrl);
  await definirImagemProduto(supabase, produto.id, null);
  atualizarTelas();
  return { ok: true };
}

// Camadas da montagem visual -----------------------------------------------------------

async function removerCamada(supabase: Sessao, url: string) {
  const caminho = url.split(`/storage/v1/object/public/${BUCKET_CAMADAS}/`)[1];
  if (caminho) await supabase.storage.from(BUCKET_CAMADAS).remove([decodeURIComponent(caminho)]);
}

/** Valida e envia a camada; devolve a URL pública. */
async function enviarCamada(supabase: Sessao, pasta: string, arquivo: FormDataEntryValue | null): Promise<Resultado<{ url: string }>> {
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: "Escolha uma imagem." };
  const extensao = TIPOS_CAMADA[arquivo.type as keyof typeof TIPOS_CAMADA];
  if (!extensao) return { ok: false, erro: "A camada precisa ser PNG ou WebP com fundo transparente." };
  if (arquivo.size > LIMITE_CAMADA) return { ok: false, erro: "Camada maior que 1 MB. Reduza a imagem (ex.: 800×800 px)." };

  const caminho = `${pasta}/${Date.now()}.${extensao}`;
  const { error } = await supabase.storage
    .from(BUCKET_CAMADAS)
    .upload(caminho, arquivo, { contentType: arquivo.type, cacheControl: "31536000", upsert: false });
  if (error) return { ok: false, erro: `Falha no envio: ${error.message}` };
  return { ok: true, url: supabase.storage.from(BUCKET_CAMADAS).getPublicUrl(caminho).data.publicUrl };
}

/** Pasta do Storage a partir de um nome livre (ex.: nome da borda). */
function pastaDoNome(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "borda";
}

export async function enviarCamadaProdutoAction(formData: FormData): Promise<Resultado<{ url: string }>> {
  const { supabase } = await exigirAdmin();
  const produtoId = z.uuid().safeParse(formData.get("id"));
  if (!produtoId.success) return { ok: false, erro: "Salve o produto antes de enviar a camada." };
  const produto = await obterProdutoAdmin(supabase, produtoId.data);
  if (!produto) return { ok: false, erro: "Produto não encontrado." };

  const envio = await enviarCamada(supabase, `produtos/${produto.id}`, formData.get("arquivo"));
  if (!envio.ok) return envio;
  try {
    await definirImagemCamadaProduto(supabase, produto.id, envio.url);
  } catch (err) {
    await removerCamada(supabase, envio.url);
    return { ok: false, erro: mensagem(err) };
  }
  if (produto.imagemCamadaUrl) await removerCamada(supabase, produto.imagemCamadaUrl);
  atualizarTelas();
  return envio;
}

export async function removerCamadaProdutoAction(produtoId: string): Promise<Resultado> {
  const { supabase } = await exigirAdmin();
  const produto = await obterProdutoAdmin(supabase, z.uuid().parse(produtoId));
  if (!produto) return { ok: false, erro: "Produto não encontrado." };
  try {
    await definirImagemCamadaProduto(supabase, produto.id, null);
  } catch (err) {
    return { ok: false, erro: mensagem(err) };
  }
  if (produto.imagemCamadaUrl) await removerCamada(supabase, produto.imagemCamadaUrl);
  atualizarTelas();
  return { ok: true };
}

// Ingredientes ---------------------------------------------------------------------------

const ingredienteSchema = z.object({
  id: z.uuid().optional(),
  nome: z.string().trim().min(2, "Nome do ingrediente muito curto").max(40),
  camadaTipo: z.enum(["pedacos", "cobertura"]),
  ativo: z.boolean(),
  ordem: z.number().int().min(0).max(999),
  precos: z
    .array(z.object({ tamanhoId: z.uuid(), precoCentavos: z.number().int().min(0, "Preço inválido").max(100_000) }))
    .refine((ps) => new Set(ps.map((p) => p.tamanhoId)).size === ps.length, "Tamanho repetido"),
});

export type DadosIngredienteForm = z.input<typeof ingredienteSchema>;

export async function salvarIngredienteAction(entrada: DadosIngredienteForm): Promise<Resultado<{ id: string }>> {
  const { supabase } = await exigirAdmin();
  const dados = ingredienteSchema.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: dados.error.issues[0]?.message ?? "Dados inválidos" };
  try {
    const tamanhos = new Set((await listarTamanhos(supabase)).map((t) => t.id));
    if (dados.data.precos.some((p) => !tamanhos.has(p.tamanhoId))) return { ok: false, erro: "Tamanho de pizza inexistente." };
    const id = await salvarIngrediente(supabase, dados.data);
    atualizarTelas();
    return { ok: true, id };
  } catch (err) {
    return { ok: false, erro: mensagem(err) };
  }
}

export async function excluirIngredienteAction(id: string): Promise<Resultado> {
  const { supabase } = await exigirAdmin();
  try {
    const ingrediente = await obterIngredienteAdmin(supabase, z.uuid().parse(id));
    if (!ingrediente) return { ok: false, erro: "Ingrediente não encontrado." };
    await excluirIngrediente(supabase, ingrediente.id);
    if (ingrediente.imagemCamadaUrl) await removerCamada(supabase, ingrediente.imagemCamadaUrl);
    atualizarTelas();
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: mensagem(err) };
  }
}

export async function enviarCamadaIngredienteAction(formData: FormData): Promise<Resultado<{ url: string }>> {
  const { supabase } = await exigirAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, erro: "Salve o ingrediente antes de enviar a camada." };
  const ingrediente = await obterIngredienteAdmin(supabase, id.data);
  if (!ingrediente) return { ok: false, erro: "Ingrediente não encontrado." };

  const envio = await enviarCamada(supabase, `ingredientes/${ingrediente.id}`, formData.get("arquivo"));
  if (!envio.ok) return envio;
  try {
    await definirImagemCamadaIngrediente(supabase, ingrediente.id, envio.url);
  } catch (err) {
    await removerCamada(supabase, envio.url);
    return { ok: false, erro: mensagem(err) };
  }
  if (ingrediente.imagemCamadaUrl) await removerCamada(supabase, ingrediente.imagemCamadaUrl);
  atualizarTelas();
  return envio;
}

export async function removerCamadaIngredienteAction(id: string): Promise<Resultado> {
  const { supabase } = await exigirAdmin();
  const ingrediente = await obterIngredienteAdmin(supabase, z.uuid().parse(id));
  if (!ingrediente) return { ok: false, erro: "Ingrediente não encontrado." };
  try {
    await definirImagemCamadaIngrediente(supabase, ingrediente.id, null);
  } catch (err) {
    return { ok: false, erro: mensagem(err) };
  }
  if (ingrediente.imagemCamadaUrl) await removerCamada(supabase, ingrediente.imagemCamadaUrl);
  atualizarTelas();
  return { ok: true };
}

// Camadas das bordas (por nome: a mesma borda se repete em cada sabor) ----------------------

async function bordaExistente(supabase: Sessao, nome: unknown): Promise<string | null> {
  if (typeof nome !== "string") return null;
  const bordas = await listarCamadasBorda(supabase);
  return bordas.find((b) => b.nome === nome)?.nome ?? null;
}

export async function enviarCamadaBordaAction(formData: FormData): Promise<Resultado<{ url: string }>> {
  const { supabase } = await exigirAdmin();
  try {
    const nome = await bordaExistente(supabase, formData.get("id"));
    if (!nome) return { ok: false, erro: "Borda não encontrada no cardápio." };
    const anterior = await obterCamadaBorda(supabase, nome);
    const envio = await enviarCamada(supabase, `bordas/${pastaDoNome(nome)}`, formData.get("arquivo"));
    if (!envio.ok) return envio;
    try {
      await definirCamadaBorda(supabase, nome, envio.url);
    } catch (err) {
      await removerCamada(supabase, envio.url);
      throw err;
    }
    if (anterior) await removerCamada(supabase, anterior);
    atualizarTelas();
    return envio;
  } catch (err) {
    return { ok: false, erro: mensagem(err) };
  }
}

export async function removerCamadaBordaAction(nome: string): Promise<Resultado> {
  const { supabase } = await exigirAdmin();
  try {
    const anterior = await obterCamadaBorda(supabase, nome);
    await definirCamadaBorda(supabase, nome, null);
    if (anterior) await removerCamada(supabase, anterior);
    atualizarTelas();
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: mensagem(err) };
  }
}
