"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "../../../../lib/db";
import {
  atualizarCategoria,
  atualizarProduto,
  atualizarVariacao,
  criarCategoria,
  criarProduto,
  criarVariacao,
} from "@pizzaria/db";
import type { TipoVariacao } from "@pizzaria/shared";
import { requireAdminSession } from "../../../../lib/auth";

function revalidateCardapio() {
  revalidatePath("/admin/cardapio");
  revalidatePath("/cardapio");
}

export async function criarCategoriaAction(formData: FormData) {
  await requireAdminSession();
  const client = createServiceClient();
  await criarCategoria(client, {
    nome: String(formData.get("nome") ?? ""),
    ordem: Number(formData.get("ordem") ?? 0),
  });
  revalidateCardapio();
}

export async function atualizarCategoriaAction(formData: FormData) {
  await requireAdminSession();
  const client = createServiceClient();
  await atualizarCategoria(client, String(formData.get("id")), {
    nome: String(formData.get("nome") ?? ""),
    ordem: Number(formData.get("ordem") ?? 0),
  });
  revalidateCardapio();
}

export async function criarProdutoAction(formData: FormData) {
  await requireAdminSession();
  const client = createServiceClient();
  await criarProduto(client, {
    categoria_id: String(formData.get("categoria_id")),
    nome: String(formData.get("nome") ?? ""),
    descricao: (formData.get("descricao") as string) || null,
    imagem_url: (formData.get("imagem_url") as string) || null,
  });
  revalidateCardapio();
}

export async function atualizarProdutoAction(formData: FormData) {
  await requireAdminSession();
  const client = createServiceClient();
  await atualizarProduto(client, String(formData.get("id")), {
    nome: String(formData.get("nome") ?? ""),
    descricao: (formData.get("descricao") as string) || null,
    imagem_url: (formData.get("imagem_url") as string) || null,
  });
  revalidateCardapio();
}

export async function alternarAtivoProdutoAction(formData: FormData) {
  await requireAdminSession();
  const client = createServiceClient();
  await atualizarProduto(client, String(formData.get("id")), {
    ativo: formData.get("ativo") === "true",
  });
  revalidateCardapio();
}

export async function criarVariacaoAction(formData: FormData) {
  await requireAdminSession();
  const client = createServiceClient();
  await criarVariacao(client, {
    produto_id: String(formData.get("produto_id")),
    nome: String(formData.get("nome") ?? ""),
    tipo: String(formData.get("tipo") ?? "padrao") as TipoVariacao,
    preco: Number(formData.get("preco") ?? 0),
  });
  revalidateCardapio();
}

export async function atualizarVariacaoAction(formData: FormData) {
  await requireAdminSession();
  const client = createServiceClient();
  await atualizarVariacao(client, String(formData.get("id")), {
    nome: String(formData.get("nome") ?? ""),
    tipo: String(formData.get("tipo") ?? "padrao") as TipoVariacao,
    preco: Number(formData.get("preco") ?? 0),
  });
  revalidateCardapio();
}

export async function alternarAtivoVariacaoAction(formData: FormData) {
  await requireAdminSession();
  const client = createServiceClient();
  await atualizarVariacao(client, String(formData.get("id")), {
    ativo: formData.get("ativo") === "true",
  });
  revalidateCardapio();
}
