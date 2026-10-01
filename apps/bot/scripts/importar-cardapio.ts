/**
 * Importa o cardápio real (supabase/seed/cardapio-vianna.ts) no Supabase.
 * Idempotente: rodar de novo atualiza preços/descrições pelo nome, sem duplicar.
 *
 *   pnpm cardapio:importar
 *
 * - tamanhos_pizza: Média, Grande, Big, Gigante, Família
 * - categorias e sabores, cada sabor com os 5 tamanhos (base + adicional) e as bordas
 * - fotos das Gourmet (supabase/seed/fotos)
 * - bairros e taxas (substitui a lista atual) e telefone da loja
 * - esconde as categorias de teste antigas (os produtos ficam, por causa do histórico)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@pizzaria/db";
import { BAIRROS, BORDAS, CATEGORIAS, TAMANHOS, TELEFONE } from "../../../supabase/seed/cardapio-vianna";

process.loadEnvFile(resolve(import.meta.dirname, "../.env"));
const db = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const PASTA_FOTOS = resolve(import.meta.dirname, "../../../supabase/seed/fotos");
const CATEGORIAS_DE_TESTE = ["Pizzas Salgadas", "Pizzas Doces"];

function ok<T>(r: { data: T | null; error: { message: string } | null }, contexto: string): T {
  if (r.error) throw new Error(`${contexto}: ${r.error.message}`);
  return r.data as T;
}

const resumo = { tamanhos: 0, categorias: 0, criados: 0, atualizados: 0, fotos: 0, bairros: 0 };

// 1. Tamanhos ---------------------------------------------------------------------
for (const [ordem, t] of TAMANHOS.entries()) {
  const linha = { nome: t.nome, fatias: t.fatias, max_sabores: t.maxSabores, preco_base: t.precoBase, ordem };
  const existente = ok(await db.from("tamanhos_pizza").select("id").ilike("nome", t.nome).maybeSingle(), "tamanho");
  ok(
    existente
      ? await db.from("tamanhos_pizza").update(linha).eq("id", existente.id).select("id")
      : await db.from("tamanhos_pizza").insert(linha).select("id"),
    `salvar tamanho ${t.nome}`
  );
  resumo.tamanhos++;
}

// 2. Esconde o cardápio de teste ---------------------------------------------------------
const antigas = ok(await db.from("categorias").select("id").in("nome", CATEGORIAS_DE_TESTE), "categorias antigas");
if (antigas.length) {
  const ids = antigas.map((c) => c.id);
  ok(await db.from("categorias").update({ ativo: false }).in("id", ids).select("id"), "esconder categorias");
  ok(await db.from("produtos").update({ ativo: false }).in("categoria_id", ids).select("id"), "esconder produtos");
}
ok(await db.from("categorias").update({ ordem: 10 }).eq("nome", "Bebidas").select("id"), "ordem bebidas");

// 3. Categorias e sabores ------------------------------------------------------------------
for (const [ordemCategoria, categoria] of CATEGORIAS.entries()) {
  let cat = ok(await db.from("categorias").select("id").eq("nome", categoria.nome).maybeSingle(), "categoria");
  if (!cat) cat = ok(await db.from("categorias").insert({ nome: categoria.nome, ordem: ordemCategoria + 1, ativo: true }).select("id").single(), "criar categoria");
  else ok(await db.from("categorias").update({ ordem: ordemCategoria + 1, ativo: true }).eq("id", cat.id).select("id"), "atualizar categoria");
  resumo.categorias++;

  for (const [ordem, sabor] of categoria.sabores.entries()) {
    const adicional = sabor.adicional ?? categoria.adicional;
    const desejadas = [
      ...TAMANHOS.map((t, i) => ({ nome: t.nome, tipo: "tamanho" as const, preco: t.precoBase + adicional, ordem: i })),
      ...BORDAS.map((b, i) => ({ nome: b.nome, tipo: "borda" as const, preco: b.preco, ordem: 10 + i })),
    ];

    let produto = ok(await db.from("produtos").select("id").eq("categoria_id", cat.id).eq("nome", sabor.nome).maybeSingle(), "produto");
    if (!produto) {
      produto = ok(
        await db.from("produtos").insert({ categoria_id: cat.id, nome: sabor.nome, descricao: sabor.descricao, ordem, ativo: true }).select("id").single(),
        `criar ${sabor.nome}`
      );
      ok(await db.from("variacoes_produto").insert(desejadas.map((v) => ({ ...v, produto_id: produto!.id, ativo: true }))).select("id"), "criar variações");
      resumo.criados++;
    } else {
      ok(await db.from("produtos").update({ descricao: sabor.descricao, ordem, ativo: true }).eq("id", produto.id).select("id"), "atualizar produto");
      const existentes = ok(await db.from("variacoes_produto").select("id, nome, tipo").eq("produto_id", produto.id), "variações");
      const chave = (tipo: string, nome: string) => `${tipo}:${nome.toLowerCase()}`;
      const porChave = new Map(existentes.map((v) => [chave(v.tipo, v.nome), v.id]));
      for (const v of desejadas) {
        const id = porChave.get(chave(v.tipo, v.nome));
        ok(
          id
            ? await db.from("variacoes_produto").update({ preco: v.preco, ordem: v.ordem, ativo: true }).eq("id", id).select("id")
            : await db.from("variacoes_produto").insert({ ...v, produto_id: produto.id, ativo: true }).select("id"),
          "salvar variação"
        );
        porChave.delete(chave(v.tipo, v.nome));
      }
      // Variações que não existem mais no cardápio: desativa (pode haver pedidos com elas).
      if (porChave.size) ok(await db.from("variacoes_produto").update({ ativo: false }).in("id", [...porChave.values()]).select("id"), "desativar variações");
      resumo.atualizados++;
    }

    if (sabor.foto) {
      const caminho = `${produto.id}/${sabor.foto}`;
      ok(
        await db.storage.from("produtos").upload(caminho, readFileSync(resolve(PASTA_FOTOS, sabor.foto)), { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" }),
        `foto ${sabor.foto}`
      );
      const url = db.storage.from("produtos").getPublicUrl(caminho).data.publicUrl;
      ok(await db.from("produtos").update({ imagem_url: url }).eq("id", produto.id).select("id"), "salvar foto");
      resumo.fotos++;
    }
  }
}

// 4. Bairros (a lista passa a ser exatamente a do cardápio) --------------------------------
const atuais = ok(await db.from("bairros_entrega").select("id, nome"), "bairros");
const desejados = new Map(BAIRROS.map((b) => [b.nome.toLowerCase(), b]));
for (const atual of atuais) {
  const novo = desejados.get(atual.nome.toLowerCase());
  if (novo) {
    ok(await db.from("bairros_entrega").update({ nome: novo.nome, taxa: novo.taxa, ativo: true }).eq("id", atual.id).select("id"), "atualizar bairro");
    desejados.delete(atual.nome.toLowerCase());
  } else {
    ok(await db.from("bairros_entrega").delete().eq("id", atual.id).select("id"), "remover bairro");
  }
}
for (const b of desejados.values()) ok(await db.from("bairros_entrega").insert({ nome: b.nome, taxa: b.taxa, ativo: true }).select("id"), "criar bairro");
resumo.bairros = BAIRROS.length;

// 5. Loja ----------------------------------------------------------------------------------
ok(await db.from("configuracoes").update({ telefone: TELEFONE }).eq("id", true).select("id"), "telefone");

console.log("Cardápio importado:", resumo);
