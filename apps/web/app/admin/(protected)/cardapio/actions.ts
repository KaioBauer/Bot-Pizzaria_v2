"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  alternarAtivoProduto,
  definirImagemProduto,
  excluirCategoria,
  excluirProduto,
  obterProdutoAdmin,
  salvarCategoria,
  salvarProduto,
} from "@pizzaria/db";
import { exigirAdmin } from "../../../../lib/auth";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const BUCKET = "produtos";
const TIPOS_IMAGEM = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

function atualizarTelas() {
  revalidatePath("/admin/cardapio", "layout");
  revalidatePath("/cardapio");
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
