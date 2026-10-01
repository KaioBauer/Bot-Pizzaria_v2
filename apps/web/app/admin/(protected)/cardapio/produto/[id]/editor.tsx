"use client";

import { ChevronLeft, ImagePlus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { ProdutoAdmin } from "@pizzaria/db";
import { centavosParaCampo, lerReais, type TipoVariacao } from "@pizzaria/shared";
import { Aviso, Botao, CabecalhoCartao, Campo, Cartao, cn, estiloEntrada, Interruptor, MiniaturaProduto } from "../../../../../../components/ui";
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
  padrao: "Única",
  borda: "Borda",
  adicional: "Adicional",
};

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
    produto?.variacoes.map((v) => ({ chave: v.id, id: v.id, nome: v.nome, tipo: v.tipo, preco: centavosParaCampo(v.precoCentavos), ativo: v.ativo })) ?? []
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
        variacoes: variacoes.map((v, i) => ({ id: v.id, nome: v.nome, tipo: v.tipo, precoCentavos: lerReais(v.preco) ?? 0, ativo: v.ativo, ordem: i })),
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
    <main className="mx-auto max-w-4xl space-y-6 p-4 pb-32 sm:p-8 sm:pb-32">
      <div>
        <Link href="/admin/cardapio" className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-900">
          <ChevronLeft className="size-4" /> Cardápio
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{produto ? nome || "Produto" : "Novo produto"}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Cartao>
          <CabecalhoCartao titulo="Informações" descricao="Como o produto aparece no cardápio e para o bot." />
          <div className="space-y-4 p-5 sm:p-6">
            <Campo rotulo="Nome">
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={estiloEntrada} placeholder="Ex.: Portuguesa" />
            </Campo>
            <Campo rotulo="Descrição" dica="Ingredientes, em uma frase. Aparece no cardápio e ajuda o bot a responder.">
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} maxLength={300} className={estiloEntrada} />
            </Campo>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Campo rotulo="Categoria">
                <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={estiloEntrada}>
                  {props.categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Ordem">
                <input type="number" min={0} value={ordem} onChange={(e) => setOrdem(Number(e.target.value) || 0)} className={estiloEntrada} />
              </Campo>
            </div>
            <Interruptor checked={ativo} onChange={(e) => setAtivo(e.target.checked)} rotulo="Disponível" descricao="Desligado, some do cardápio e o bot não oferece." />
          </div>
        </Cartao>

        <Cartao className="h-fit">
          <CabecalhoCartao titulo="Foto" />
          <div className="space-y-3 p-5">
            <MiniaturaProduto nome={nome || "?"} url={foto} className="aspect-square w-full rounded-xl text-6xl" />
            <input ref={entradaFoto} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && enviarFoto(e.target.files[0])} />
            <Botao
              variante="secundario"
              className="w-full"
              disabled={!produto || salvando}
              onClick={() => entradaFoto.current?.click()}
              title={produto ? undefined : "Salve o produto antes de enviar a foto"}
            >
              <ImagePlus className="size-4" /> {foto ? "Trocar foto" : "Enviar foto"}
            </Botao>
            {!produto && <p className="text-center text-xs text-stone-500">Salve o produto para adicionar a foto.</p>}
            {foto && produto && (
              <button
                className="w-full text-sm font-medium text-red-700 hover:underline"
                onClick={() => iniciar(async () => {
                  const r = await removerFotoAction(produto.id);
                  if (r.ok) setFoto(null);
                })}
              >
                Remover foto
              </button>
            )}
          </div>
        </Cartao>
      </div>

      <Cartao>
        <CabecalhoCartao
          titulo="Tamanhos, bordas e preços"
          descricao="Pizzas: um tamanho por linha, com o mesmo nome em todos os sabores (é assim que o meio a meio casa os tamanhos). Bebidas: uma variação única. Bordas e adicionais somam ao preço."
        />
        <div className="space-y-2 p-5 sm:p-6">
          {variacoes.length === 0 && <p className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">Nenhuma variação ainda — adicione abaixo.</p>}
          {variacoes.length > 0 && (
            <div className="hidden grid-cols-[8.5rem_1fr_8rem_6rem_2.5rem] gap-2 px-1 text-xs font-semibold tracking-wide text-stone-400 uppercase sm:grid">
              <span>Tipo</span><span>Nome</span><span className="text-right">Preço (R$)</span><span>Ativa</span><span />
            </div>
          )}
          {variacoes.map((v) => (
            <div key={v.chave} className={cn("grid grid-cols-2 items-center gap-2 rounded-xl p-1 sm:grid-cols-[8.5rem_1fr_8rem_6rem_2.5rem]", !v.ativo && "opacity-60")}>
              <select value={v.tipo} onChange={(e) => alterar(v.chave, { tipo: e.target.value as TipoVariacao })} className={estiloEntrada} aria-label="Tipo">
                {Object.entries(ROTULO_TIPO).map(([tipo, rotulo]) => (
                  <option key={tipo} value={tipo}>{rotulo}</option>
                ))}
              </select>
              <input value={v.nome} onChange={(e) => alterar(v.chave, { nome: e.target.value })} placeholder="Ex.: Grande" className={estiloEntrada} aria-label="Nome" />
              <input value={v.preco} onChange={(e) => alterar(v.chave, { preco: e.target.value })} inputMode="decimal" placeholder="0,00" className={cn(estiloEntrada, "text-right tabular")} aria-label="Preço" />
              <Interruptor checked={v.ativo} onChange={(e) => alterar(v.chave, { ativo: e.target.checked })} aria-label="Ativa" />
              <button onClick={() => setVariacoes((vs) => vs.filter((x) => x.chave !== v.chave))} className="flex size-10 items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label="Remover variação">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 pt-2">
            {variacoes.length === 0 && (
              <Botao variante="secundario" tamanho="sm" className="bg-marca-50 text-marca-700 ring-marca-200" onClick={() => adicionar(...["Pequena", "Média", "Grande"].map((n) => ({ nome: n, tipo: "tamanho" as const, preco: "" })))}>
                Usar P / M / G
              </Botao>
            )}
            <Botao variante="secundario" tamanho="sm" onClick={() => adicionar({ nome: "", tipo: "tamanho", preco: "" })}><Plus className="size-4" /> Tamanho</Botao>
            <Botao variante="secundario" tamanho="sm" onClick={() => adicionar({ nome: "Borda ", tipo: "borda", preco: "" })}><Plus className="size-4" /> Borda</Botao>
            <Botao variante="secundario" tamanho="sm" onClick={() => adicionar({ nome: "", tipo: "adicional", preco: "" })}><Plus className="size-4" /> Adicional</Botao>
            <Botao variante="secundario" tamanho="sm" onClick={() => adicionar({ nome: "Única", tipo: "padrao", preco: "" })}><Plus className="size-4" /> Variação única</Botao>
          </div>
        </div>
      </Cartao>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-stone-200 bg-white/90 backdrop-blur md:bottom-0 md:left-20 lg:left-64">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3 sm:px-8">
          {mensagem ? (
            <Aviso tom={mensagem.tipo === "erro" ? "perigo" : "sucesso"} className="flex-1 py-2">{mensagem.texto}</Aviso>
          ) : (
            <span className="flex-1 text-sm text-stone-500">{produto ? "Alterações só valem depois de salvar." : "Preencha e salve para criar o produto."}</span>
          )}
          {produto && (
            <Botao variante="perigo" disabled={salvando} onClick={excluir}>
              <Trash2 className="size-4" /> Excluir
            </Botao>
          )}
          <Botao tamanho="lg" disabled={salvando} onClick={salvar}>
            {salvando ? "Salvando..." : "Salvar produto"}
          </Botao>
        </div>
      </div>
    </main>
  );
}
