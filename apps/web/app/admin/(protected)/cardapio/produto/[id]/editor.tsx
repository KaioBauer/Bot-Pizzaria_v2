"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { ProdutoAdmin } from "@pizzaria/db";
import { centavosParaCampo, lerReais, type TipoVariacao } from "@pizzaria/shared";
import { enviarFotoAction, excluirProdutoAction, removerFotoAction, salvarProdutoAction } from "../../actions";

interface LinhaVariacao {
  chave: string;
  id?: string;
  nome: string;
  tipo: TipoVariacao;
  preco: string;
  ativo: boolean;
}

const ROTULO_TIPO: Record<TipoVariacao, string> = {
  tamanho: "Tamanho",
  padrao: "Única (bebida etc.)",
  borda: "Borda",
  adicional: "Adicional",
};

const campo = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-100";
let contador = 0;
const novaChave = () => `nova-${++contador}`;

export function EditorProduto(props: {
  categorias: Array<{ id: string; nome: string }>;
  produto: ProdutoAdmin | null;
  categoriaInicial: string;
}) {
  const router = useRouter();
  const { produto } = props;
  const [categoriaId, setCategoriaId] = useState(produto?.categoriaId ?? props.categoriaInicial);
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");
  const [ativo, setAtivo] = useState(produto?.ativo ?? true);
  const [ordem, setOrdem] = useState(produto?.ordem ?? 0);
  const [variacoes, setVariacoes] = useState<LinhaVariacao[]>(
    produto?.variacoes.map((v) => ({
      chave: v.id,
      id: v.id,
      nome: v.nome,
      tipo: v.tipo,
      preco: centavosParaCampo(v.precoCentavos),
      ativo: v.ativo,
    })) ?? []
  );
  const [foto, setFoto] = useState(produto?.imagemUrl ?? null);
  const [mensagem, setMensagem] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  const entradaFoto = useRef<HTMLInputElement>(null);

  const alterar = (chave: string, mudanca: Partial<LinhaVariacao>) =>
    setVariacoes((vs) => vs.map((v) => (v.chave === chave ? { ...v, ...mudanca } : v)));
  const adicionar = (...novas: Array<Omit<LinhaVariacao, "chave" | "ativo">>) =>
    setVariacoes((vs) => [...vs, ...novas.map((n) => ({ ...n, chave: novaChave(), ativo: true }))]);

  function salvar() {
    setMensagem(null);
    const invalida = variacoes.find((v) => lerReais(v.preco) === null);
    if (invalida) {
      setMensagem({ tipo: "erro", texto: `Preço inválido em "${invalida.nome || "variação"}". Use, por exemplo, 45,90.` });
      return;
    }
    iniciar(async () => {
      const r = await salvarProdutoAction({
        id: produto?.id,
        categoriaId,
        nome,
        descricao,
        ativo,
        ordem,
        variacoes: variacoes.map((v, i) => ({
          id: v.id,
          nome: v.nome,
          tipo: v.tipo,
          precoCentavos: lerReais(v.preco) ?? 0,
          ativo: v.ativo,
          ordem: i,
        })),
      });
      if (!r.ok) return setMensagem({ tipo: "erro", texto: r.erro });
      setMensagem({ tipo: "ok", texto: r.aviso ?? "Produto salvo!" });
      if (!produto) router.replace(`/admin/cardapio/produto/${r.id}`);
      else router.refresh();
    });
  }

  function enviarFoto(arquivo: File) {
    if (!produto) return;
    const dados = new FormData();
    dados.set("produtoId", produto.id);
    dados.set("foto", arquivo);
    iniciar(async () => {
      const r = await enviarFotoAction(dados);
      if (r.ok) setFoto(r.url);
      setMensagem(r.ok ? { tipo: "ok", texto: "Foto atualizada!" } : { tipo: "erro", texto: r.erro });
    });
  }

  function excluir() {
    if (!produto) return;
    iniciar(async () => {
      const r = await excluirProdutoAction(produto.id);
      if (!r.ok) return setMensagem({ tipo: "erro", texto: r.erro });
      if (r.resultado === "desativado") {
        setAtivo(false);
        setMensagem({ tipo: "ok", texto: "Este produto já foi vendido, então foi desativado (o histórico de pedidos é mantido)." });
      } else router.push("/admin/cardapio");
    });
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/cardapio" className="rounded-lg px-2 py-1 text-stone-600 hover:bg-stone-200">← Cardápio</Link>
        <h1 className="text-2xl font-black">{produto ? "Editar produto" : "Novo produto"}</h1>
      </div>

      <section className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-stone-200 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} placeholder="Ex.: Portuguesa" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Descrição (ingredientes)</span>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={300} className={campo} />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="block flex-1">
              <span className="text-sm font-medium">Categoria</span>
              <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={campo}>
                {props.categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </label>
            <label className="block w-24">
              <span className="text-sm font-medium">Ordem</span>
              <input type="number" min={0} value={ordem} onChange={(e) => setOrdem(Number(e.target.value) || 0)} className={campo} />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="size-5 accent-marca-600" />
            <span className="font-medium">Disponível no cardápio e no bot</span>
          </label>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="size-40 overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200">
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto} alt={nome} className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-5xl">🍕</div>
            )}
          </div>
          <input
            ref={entradaFoto}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => e.target.files?.[0] && enviarFoto(e.target.files[0])}
          />
          <button
            disabled={!produto || salvando}
            onClick={() => entradaFoto.current?.click()}
            className="w-40 rounded-lg py-2 text-sm font-medium ring-1 ring-stone-300 disabled:opacity-50"
            title={produto ? undefined : "Salve o produto antes de enviar a foto"}
          >
            {foto ? "Trocar foto" : "Enviar foto"}
          </button>
          {foto && produto && (
            <button
              onClick={() => iniciar(async () => {
                const r = await removerFotoAction(produto.id);
                if (r.ok) setFoto(null);
              })}
              className="text-sm text-red-700"
            >
              Remover foto
            </button>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
        <div>
          <h2 className="text-lg font-bold">Tamanhos, bordas e preços</h2>
          <p className="text-sm text-stone-500">
            Pizzas: um tamanho por linha (o meio a meio usa o mesmo nome de tamanho nos dois sabores). Bebidas: uma variação “Única”.
            Bordas e adicionais somam ao preço.
          </p>
        </div>

        {variacoes.length === 0 && <p className="text-sm text-stone-500">Nenhuma variação ainda.</p>}
        {variacoes.map((v) => (
          <div key={v.chave} className={`grid grid-cols-[1fr_1fr] gap-2 rounded-xl p-2 ring-1 ring-stone-200 sm:grid-cols-[10rem_1fr_7rem_auto_auto] ${v.ativo ? "" : "bg-stone-50 opacity-70"}`}>
            <select value={v.tipo} onChange={(e) => alterar(v.chave, { tipo: e.target.value as TipoVariacao })} className={campo} aria-label="Tipo">
              {Object.entries(ROTULO_TIPO).map(([tipo, rotulo]) => (
                <option key={tipo} value={tipo}>{rotulo}</option>
              ))}
            </select>
            <input value={v.nome} onChange={(e) => alterar(v.chave, { nome: e.target.value })} placeholder="Nome (ex.: Grande)" className={campo} aria-label="Nome" />
            <input value={v.preco} onChange={(e) => alterar(v.chave, { preco: e.target.value })} inputMode="decimal" placeholder="0,00" className={`${campo} text-right`} aria-label="Preço" />
            <label className="flex items-center gap-1.5 px-1 text-sm">
              <input type="checkbox" checked={v.ativo} onChange={(e) => alterar(v.chave, { ativo: e.target.checked })} className="size-4 accent-marca-600" />
              Ativa
            </label>
            <button onClick={() => setVariacoes((vs) => vs.filter((x) => x.chave !== v.chave))} className="rounded-lg px-3 text-red-700 hover:bg-red-50" aria-label="Remover variação">
              Remover
            </button>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <button onClick={() => adicionar({ nome: "", tipo: "tamanho", preco: "" })} className="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-stone-300">+ Tamanho</button>
          <button onClick={() => adicionar({ nome: "Borda ", tipo: "borda", preco: "" })} className="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-stone-300">+ Borda</button>
          <button onClick={() => adicionar({ nome: "", tipo: "adicional", preco: "" })} className="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-stone-300">+ Adicional</button>
          <button onClick={() => adicionar({ nome: "Única", tipo: "padrao", preco: "" })} className="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-stone-300">+ Variação única</button>
          {variacoes.length === 0 && (
            <button
              onClick={() => adicionar(...["Pequena", "Média", "Grande"].map((n) => ({ nome: n, tipo: "tamanho" as const, preco: "" })))}
              className="rounded-lg bg-marca-50 px-3 py-2 text-sm font-medium text-marca-700 ring-1 ring-marca-100"
            >
              Usar P / M / G
            </button>
          )}
        </div>
      </section>

      {mensagem && (
        <p role="status" className={`rounded-lg px-4 py-3 ${mensagem.tipo === "erro" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
          {mensagem.texto}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button onClick={salvar} disabled={salvando} className="flex-1 rounded-xl bg-marca-600 py-3.5 text-lg font-semibold text-white disabled:opacity-60">
          {salvando ? "Salvando..." : "Salvar produto"}
        </button>
        {produto && (
          <button onClick={excluir} disabled={salvando} className="rounded-xl px-5 py-3.5 font-medium text-red-700 ring-1 ring-red-200 disabled:opacity-60">
            Excluir
          </button>
        )}
      </div>
    </main>
  );
}
