"use client";

import { Carrot, CircleDashed, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CamadaBordaAdmin, IngredienteAdmin } from "@pizzaria/db";
import { centavosParaCampo, lerReais } from "@pizzaria/shared";
import { Botao, CabecalhoCartao, Cartao, cn, estiloEntrada, Interruptor, Selo, Vazio } from "../../../../../components/ui";
import {
  enviarCamadaBordaAction,
  enviarCamadaIngredienteAction,
  excluirIngredienteAction,
  removerCamadaBordaAction,
  removerCamadaIngredienteAction,
  salvarIngredienteAction,
} from "../actions";
import { EditorCamada } from "../camada";

type Tamanho = { id: string; nome: string };

interface Linha {
  chave: string;
  id?: string;
  nome: string;
  camadaTipo: "pedacos" | "cobertura";
  ordem: number;
  ativo: boolean;
  imagemCamadaUrl: string | null;
  /** tamanho_id -> texto do campo ("" = não oferecido). */
  precos: Record<string, string>;
}

let contador = 0;

function paraLinha(i: IngredienteAdmin, tamanhos: Tamanho[]): Linha {
  return {
    chave: i.id,
    id: i.id,
    nome: i.nome,
    camadaTipo: i.camadaTipo,
    ordem: i.ordem,
    ativo: i.ativo,
    imagemCamadaUrl: i.imagemCamadaUrl,
    precos: Object.fromEntries(tamanhos.map((t) => [t.id, i.precos[t.id] === undefined ? "" : centavosParaCampo(i.precos[t.id]!)])),
  };
}

export function ListaIngredientes({ inicial, tamanhos }: { inicial: IngredienteAdmin[]; tamanhos: Tamanho[] }) {
  const [linhas, setLinhas] = useState(() => inicial.map((i) => paraLinha(i, tamanhos)));

  function adicionar() {
    const ordem = Math.max(0, ...linhas.map((l) => l.ordem)) + 1;
    setLinhas((ls) => [
      ...ls,
      { chave: `novo-${++contador}`, nome: "", camadaTipo: "pedacos", ordem, ativo: true, imagemCamadaUrl: null, precos: Object.fromEntries(tamanhos.map((t) => [t.id, ""])) },
    ]);
  }

  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Ingredientes"
        descricao="Preço cobrado por ingrediente em cada tamanho. Deixe o campo vazio para não oferecer o ingrediente naquele tamanho. Desativado, some da montagem."
        acoes={<Selo>{linhas.filter((l) => l.id).length}</Selo>}
      />
      {tamanhos.length === 0 && (
        <p className="px-5 pt-5 text-sm text-amber-800 sm:px-6">Cadastre os tamanhos de pizza antes de definir preços de ingredientes.</p>
      )}
      {linhas.length === 0 ? (
        <Vazio icone={<Carrot className="size-6" />} titulo="Nenhum ingrediente cadastrado" descricao="Ex.: Calabresa, Cebola, Bacon, Azeitona. Cada um com a sua camada para desenhar a pizza." />
      ) : (
        <ul className="divide-y divide-stone-100">
          {linhas.map((l) => (
            <LinhaIngrediente
              key={l.chave}
              inicial={l}
              tamanhos={tamanhos}
              aoRemover={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
            />
          ))}
        </ul>
      )}
      <div className="border-t border-stone-100 px-5 py-4 sm:px-6">
        <Botao variante="secundario" tamanho="sm" onClick={adicionar}>
          <Plus className="size-4" /> Adicionar ingrediente
        </Botao>
      </div>
    </Cartao>
  );
}

function LinhaIngrediente({ inicial, tamanhos, aoRemover }: { inicial: Linha; tamanhos: Tamanho[]; aoRemover: () => void }) {
  const router = useRouter();
  const [l, setL] = useState(inicial);
  const [alterado, setAlterado] = useState(!inicial.id);
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const mudar = (m: Partial<Linha>) => {
    setL((atual) => ({ ...atual, ...m }));
    setAlterado(true);
    setMensagem(null);
  };

  function salvar() {
    const precos: Array<{ tamanhoId: string; precoCentavos: number }> = [];
    for (const t of tamanhos) {
      const texto = (l.precos[t.id] ?? "").trim();
      if (!texto) continue;
      const centavos = lerReais(texto);
      if (centavos === null || centavos < 0) return setMensagem({ ok: false, texto: `Preço inválido na ${t.nome}. Use, por exemplo, 4,50.` });
      precos.push({ tamanhoId: t.id, precoCentavos: centavos });
    }
    iniciar(async () => {
      const r = await salvarIngredienteAction({ id: l.id, nome: l.nome, camadaTipo: l.camadaTipo, ordem: l.ordem, ativo: l.ativo, precos });
      if (!r.ok) return setMensagem({ ok: false, texto: r.erro });
      setL((atual) => ({ ...atual, id: r.id }));
      setAlterado(false);
      setMensagem({ ok: true, texto: precos.length ? "Salvo" : "Salvo (sem preço em nenhum tamanho: não aparece na montagem)" });
      router.refresh();
    });
  }

  function excluir() {
    if (!l.id) return aoRemover();
    if (!window.confirm(`Excluir o ingrediente "${l.nome}"?`)) return;
    iniciar(async () => {
      const r = await excluirIngredienteAction(l.id!);
      if (!r.ok) return setMensagem({ ok: false, texto: r.erro });
      aoRemover();
      router.refresh();
    });
  }

  return (
    <li className={cn("space-y-3 px-5 py-4 sm:px-6", !l.ativo && "bg-stone-50/70")}>
      <div className="flex flex-wrap items-center gap-3">
        <EditorCamada
          compacto
          id={l.id ?? null}
          nome={l.nome || "Ingrediente"}
          url={l.imagemCamadaUrl}
          enviar={enviarCamadaIngredienteAction}
          remover={removerCamadaIngredienteAction}
          semId="Salve o ingrediente para enviar a camada"
        />
        <input
          value={l.nome}
          onChange={(e) => mudar({ nome: e.target.value })}
          placeholder="Nome (ex.: Calabresa)"
          maxLength={40}
          className={cn(estiloEntrada, "min-w-40 flex-1")}
          aria-label="Nome do ingrediente"
        />
        <input
          type="number"
          min={0}
          max={999}
          value={l.ordem}
          onChange={(e) => mudar({ ordem: Number(e.target.value) || 0 })}
          className={cn(estiloEntrada, "w-20 text-right tabular")}
          aria-label="Ordem"
          title="Ordem na lista"
        />
        <select
          value={l.camadaTipo}
          onChange={(e) => mudar({ camadaTipo: e.target.value as Linha["camadaTipo"] })}
          className={cn(estiloEntrada, "w-auto")}
          aria-label="Como aparece na pizza"
          title="Pedaços caem espalhados; cobertura cobre a pizza inteira (ex.: queijo ralado)"
        >
          <option value="pedacos">Cai em pedaços</option>
          <option value="cobertura">Cobre a pizza</option>
        </select>
        <Interruptor checked={l.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} rotulo={<span className="text-sm">Ativo</span>} />
        <div className="ml-auto flex items-center gap-2">
          <Botao tamanho="sm" disabled={ocupado || !alterado} onClick={salvar}>
            {ocupado ? "Salvando..." : "Salvar"}
          </Botao>
          <button
            type="button"
            disabled={ocupado}
            onClick={excluir}
            className="flex size-8 items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600"
            aria-label={`Excluir ${l.nome || "ingrediente"}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {tamanhos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {tamanhos.map((t) => {
            const vazio = !(l.precos[t.id] ?? "").trim();
            return (
              <label key={t.id} className="block">
                <span className="mb-1 block text-xs font-semibold tracking-wide text-stone-400 uppercase">{t.nome}</span>
                <input
                  value={l.precos[t.id] ?? ""}
                  onChange={(e) => mudar({ precos: { ...l.precos, [t.id]: e.target.value } })}
                  inputMode="decimal"
                  placeholder="não oferecido"
                  className={cn(estiloEntrada, "py-2 text-right tabular", vazio && "bg-stone-50")}
                  aria-label={`Preço na ${t.nome} (R$)`}
                />
              </label>
            );
          })}
        </div>
      )}

      {mensagem && (
        <p role={mensagem.ok ? "status" : "alert"} className={cn("text-sm font-medium", mensagem.ok ? "text-manjericao-700" : "text-red-700")}>
          {mensagem.texto}
        </p>
      )}
    </li>
  );
}

export function ListaCamadasBorda({ bordas }: { bordas: CamadaBordaAdmin[] }) {
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Camadas das bordas"
        descricao="Uma imagem por nome de borda (a mesma borda se repete em cada sabor). Anel da borda visto de cima, com o centro e o fundo transparentes — PNG ou WebP, até 1 MB."
      />
      {bordas.length === 0 ? (
        <Vazio icone={<CircleDashed className="size-6" />} titulo="Nenhuma borda no cardápio" descricao="Cadastre bordas nos produtos (tipo “Borda”) para enviar as camadas." />
      ) : (
        <ul className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
          {bordas.map((b) => (
            <li key={b.nome} className="flex items-center gap-3">
              <EditorCamada compacto id={b.nome} nome={b.nome} url={b.imagemUrl} enviar={enviarCamadaBordaAction} remover={removerCamadaBordaAction} />
              <div className="min-w-0">
                <p className="truncate font-medium">{b.nome}</p>
                <p className="text-xs text-stone-500">
                  {b.produtos} produto(s){b.imagemUrl ? "" : " · sem camada"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
