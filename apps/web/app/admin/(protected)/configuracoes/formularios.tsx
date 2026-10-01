"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { BairroAdmin, ConfiguracaoAdmin, TamanhoAdmin } from "@pizzaria/db";
import { centavosParaCampo, lerReais, type TurnoFuncionamento } from "@pizzaria/shared";
import { Botao, Campo, Cartao, cn, estiloEntrada, Interruptor } from "../../../../components/ui";
import { salvarBairrosAction, salvarConfiguracaoAction, salvarHorariosAction, salvarTamanhosAction, type Resultado } from "./actions";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function useSalvar() {
  const [salvando, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
  const salvar = (acao: () => Promise<Resultado>, sucesso = "Alterações salvas") =>
    iniciar(async () => {
      const r = await acao();
      setMensagem(r.ok ? { ok: true, texto: sucesso } : { ok: false, texto: r.erro });
    });
  return { salvando, mensagem, setMensagem, salvar };
}

/** Seção de ajustes: descrição à esquerda, formulário à direita (empilha no celular). */
function Secao({ titulo, descricao, children, rodape }: { titulo: string; descricao: React.ReactNode; children: React.ReactNode; rodape: React.ReactNode }) {
  return (
    <div className="grid gap-4 border-b border-stone-200 pb-10 last:border-0 lg:grid-cols-[17rem_1fr] lg:gap-10">
      <div>
        <h2 className="font-display text-xl font-semibold">{titulo}</h2>
        <p className="mt-1 text-sm text-stone-500">{descricao}</p>
      </div>
      <Cartao>
        <div className="space-y-5 p-5 sm:p-6">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-3 rounded-b-2xl border-t border-stone-100 bg-stone-50/70 px-5 py-3 sm:px-6">{rodape}</div>
      </Cartao>
    </div>
  );
}

function Rodape({ salvando, mensagem, aoSalvar, rotulo }: { salvando: boolean; mensagem: { ok: boolean; texto: string } | null; aoSalvar: () => void; rotulo: string }) {
  return (
    <>
      {mensagem && <span role="status" className={cn("mr-auto text-sm font-medium", mensagem.ok ? "text-manjericao-700" : "text-red-700")}>{mensagem.texto}</span>}
      <Botao onClick={aoSalvar} disabled={salvando}>{salvando ? "Salvando..." : rotulo}</Botao>
    </>
  );
}

export function FormLoja({ inicial }: { inicial: ConfiguracaoAdmin }) {
  const [c, setC] = useState({
    ...inicial,
    telefone: inicial.telefone ?? "",
    endereco: inicial.endereco ?? "",
    whatsappNumero: inicial.whatsappNumero ?? "",
    telegramUsuario: inicial.telegramUsuario ?? "",
    instagram: inicial.instagram ?? "",
    pedidoMinimo: centavosParaCampo(inicial.pedidoMinimoCentavos),
  });
  const { salvando, mensagem, setMensagem, salvar } = useSalvar();
  const mudar = (campo: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setC((atual) => ({ ...atual, [campo]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  return (
    <Secao
      titulo="Pizzaria"
      descricao="Dados que aparecem no cardápio público, nas respostas do bot e no cupom."
      rodape={
        <Rodape
          salvando={salvando}
          mensagem={mensagem}
          rotulo="Salvar"
          aoSalvar={() => {
            const minimo = lerReais(c.pedidoMinimo);
            if (minimo === null) return setMensagem({ ok: false, texto: "Pedido mínimo inválido" });
            const { pedidoMinimo: _ignorado, ...resto } = c;
            salvar(() => salvarConfiguracaoAction({ ...resto, pedidoMinimoCentavos: minimo }));
          }}
        />
      }
    >
      <div className="rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200">
        <Interruptor
          checked={c.aceitandoPedidos}
          onChange={mudar("aceitandoPedidos")}
          rotulo="Recebendo pedidos"
          descricao="Desligue para pausar o bot mesmo dentro do horário (ex.: cozinha lotada)."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome da pizzaria"><input value={c.nomePizzaria} onChange={mudar("nomePizzaria")} className={estiloEntrada} /></Campo>
        <Campo rotulo="Telefone"><input value={c.telefone} onChange={mudar("telefone")} className={estiloEntrada} placeholder="(11) 3333-4444" /></Campo>
        <Campo rotulo="Endereço para retirada" className="sm:col-span-2"><input value={c.endereco} onChange={mudar("endereco")} className={estiloEntrada} placeholder="Rua, número - bairro" /></Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="WhatsApp do bot" dica="DDI + DDD + número"><input value={c.whatsappNumero} onChange={mudar("whatsappNumero")} inputMode="numeric" className={estiloEntrada} placeholder="5511987654321" /></Campo>
        <Campo rotulo="Bot no Telegram" dica="Usuário, sem @"><input value={c.telegramUsuario} onChange={mudar("telegramUsuario")} className={estiloEntrada} placeholder="ViannaPizzariaBot" /></Campo>
        <Campo rotulo="Instagram" dica="Usuário, sem @"><input value={c.instagram} onChange={mudar("instagram")} className={estiloEntrada} placeholder="viannapizzaria" /></Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Pedido mínimo (R$)" dica="0 = sem mínimo"><input value={c.pedidoMinimo} onChange={mudar("pedidoMinimo")} inputMode="decimal" className={cn(estiloEntrada, "tabular")} /></Campo>
        <Campo rotulo="Prazo para pagar o Pix" dica="Minutos até a cobrança expirar e o pedido ser cancelado">
          <input type="number" min={5} max={1440} value={c.pixExpiracaoMinutos} onChange={(e) => setC({ ...c, pixExpiracaoMinutos: Number(e.target.value) })} className={cn(estiloEntrada, "tabular")} />
        </Campo>
      </div>
    </Secao>
  );
}

export function FormHorarios({ inicial }: { inicial: TurnoFuncionamento[] }) {
  const [turnos, setTurnos] = useState(inicial.map((t, i) => ({ ...t, chave: i })));
  const { salvando, mensagem, salvar } = useSalvar();
  const proximaChave = () => Math.max(0, ...turnos.map((t) => t.chave)) + 1;
  const alterar = (chave: number, m: Partial<TurnoFuncionamento>) => setTurnos((ts) => ts.map((t) => (t.chave === chave ? { ...t, ...m } : t)));

  function copiarParaTodos(dia: number) {
    const modelo = turnos.filter((t) => t.diaSemana === dia);
    let chave = proximaChave();
    setTurnos(DIAS.flatMap((_, d) => (d === dia ? modelo : modelo.map((t) => ({ ...t, diaSemana: d, chave: chave++ })))));
  }

  return (
    <Secao
      titulo="Horário de funcionamento"
      descricao="Fora destes horários o bot avisa quando abre e não aceita pedidos. Para virar a noite, use por exemplo 18:00 até 01:00."
      rodape={<Rodape salvando={salvando} mensagem={mensagem} rotulo="Salvar horários" aoSalvar={() => salvar(() => salvarHorariosAction(turnos.map(({ chave: _c, ...t }) => t)))} />}
    >
      <ul className="divide-y divide-stone-100">
        {DIAS.map((dia, d) => {
          const doDia = turnos.filter((t) => t.diaSemana === d);
          return (
            <li key={d} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="w-24 font-medium">{dia}</span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                {doDia.length === 0 && <span className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-500">Fechado</span>}
                {doDia.map((t) => (
                  <span key={t.chave} className="flex items-center gap-1 rounded-xl bg-white p-1 pl-2 ring-1 ring-stone-300">
                    <input type="time" value={t.abre} onChange={(e) => alterar(t.chave, { abre: e.target.value })} className="rounded-md px-1 py-1 tabular outline-none focus:bg-stone-50" aria-label={`${dia}: abre`} />
                    <span className="text-xs text-stone-400">até</span>
                    <input type="time" value={t.fecha} onChange={(e) => alterar(t.chave, { fecha: e.target.value })} className="rounded-md px-1 py-1 tabular outline-none focus:bg-stone-50" aria-label={`${dia}: fecha`} />
                    <button onClick={() => setTurnos((ts) => ts.filter((x) => x.chave !== t.chave))} className="rounded-md p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label="Remover turno">
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <Botao variante="fantasma" tamanho="sm" onClick={() => setTurnos([...turnos, { diaSemana: d, abre: "18:00", fecha: "23:00", chave: proximaChave() }])}>
                  <Plus className="size-4" /> Turno
                </Botao>
                {doDia.length > 0 && (
                  <Botao variante="fantasma" tamanho="sm" onClick={() => copiarParaTodos(d)} title="Copiar para todos os dias">
                    <Copy className="size-4" />
                  </Botao>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Secao>
  );
}

export function FormBairros({ inicial }: { inicial: BairroAdmin[] }) {
  const [bairros, setBairros] = useState(inicial.map((b, i) => ({ ...b, chave: i, taxa: centavosParaCampo(b.taxaCentavos) })));
  const { salvando, mensagem, setMensagem, salvar } = useSalvar();
  const alterar = (chave: number, m: Partial<(typeof bairros)[number]>) => setBairros((bs) => bs.map((b) => (b.chave === chave ? { ...b, ...m } : b)));

  return (
    <Secao
      titulo="Entrega"
      descricao="Bairros atendidos e a taxa de cada um. Sem nenhum bairro ativo, o bot oferece só retirada no balcão."
      rodape={
        <Rodape
          salvando={salvando}
          mensagem={mensagem}
          rotulo="Salvar bairros"
          aoSalvar={() => {
            const invalido = bairros.find((b) => lerReais(b.taxa) === null);
            if (invalido) return setMensagem({ ok: false, texto: `Taxa inválida em "${invalido.nome || "bairro"}"` });
            salvar(() => salvarBairrosAction(bairros.map((b) => ({ id: b.id, nome: b.nome, ativo: b.ativo, taxaCentavos: lerReais(b.taxa) ?? 0 }))));
          }}
        />
      }
    >
      {bairros.length === 0 ? (
        <p className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">Nenhum bairro cadastrado — hoje só há retirada.</p>
      ) : (
        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_8rem_5.5rem_2.5rem] gap-2 px-1 text-xs font-semibold tracking-wide text-stone-400 uppercase sm:grid">
            <span>Bairro</span><span className="text-right">Taxa (R$)</span><span>Ativo</span><span />
          </div>
          {bairros.map((b) => (
            <div key={b.chave} className={cn("grid grid-cols-[1fr_7rem_auto_auto] items-center gap-2 sm:grid-cols-[1fr_8rem_5.5rem_2.5rem]", !b.ativo && "opacity-60")}>
              <input value={b.nome} onChange={(e) => alterar(b.chave, { nome: e.target.value })} placeholder="Nome do bairro" className={estiloEntrada} aria-label="Bairro" />
              <input value={b.taxa} onChange={(e) => alterar(b.chave, { taxa: e.target.value })} inputMode="decimal" placeholder="0,00" className={cn(estiloEntrada, "text-right tabular")} aria-label="Taxa" />
              <Interruptor checked={b.ativo} onChange={(e) => alterar(b.chave, { ativo: e.target.checked })} aria-label="Ativo" />
              <button onClick={() => setBairros((bs) => bs.filter((x) => x.chave !== b.chave))} className="flex size-10 items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label="Remover bairro">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Botao variante="secundario" tamanho="sm" onClick={() => setBairros([...bairros, { nome: "", taxa: "", taxaCentavos: 0, ativo: true, chave: Math.max(0, ...bairros.map((b) => b.chave)) + 1 }])}>
        <Plus className="size-4" /> Adicionar bairro
      </Botao>
    </Secao>
  );
}

export function FormTamanhos({ inicial }: { inicial: TamanhoAdmin[] }) {
  const [tamanhos, setTamanhos] = useState(inicial.map((t) => ({ ...t, preco: centavosParaCampo(t.precoBaseCentavos) })));
  const { salvando, mensagem, setMensagem, salvar } = useSalvar();
  const alterar = (id: string, m: Partial<(typeof tamanhos)[number]>) => setTamanhos((ts) => ts.map((t) => (t.id === id ? { ...t, ...m } : t)));
  if (inicial.length === 0) return null;

  return (
    <Secao
      titulo="Tamanhos de pizza"
      descricao={<>Preço base de cada tamanho (o dos sabores tradicionais), fatias e quantos sabores cabem. Ao mudar o preço base, todos os sabores desse tamanho mudam junto — o adicional dos especiais se mantém.</>}
      rodape={
        <Rodape
          salvando={salvando}
          mensagem={mensagem}
          rotulo="Salvar tamanhos"
          aoSalvar={() => {
            const invalido = tamanhos.find((t) => lerReais(t.preco) === null);
            if (invalido) return setMensagem({ ok: false, texto: `Preço inválido na ${invalido.nome}` });
            salvar(() =>
              salvarTamanhosAction(tamanhos.map((t) => ({ id: t.id, fatias: t.fatias, maxSabores: t.maxSabores, precoBaseCentavos: lerReais(t.preco) ?? 0 })))
            );
          }}
        />
      }
    >
      <div className="space-y-2">
        <div className="hidden grid-cols-[1fr_6rem_6rem_8rem] gap-2 px-1 text-xs font-semibold tracking-wide text-stone-400 uppercase sm:grid">
          <span>Tamanho</span><span className="text-right">Fatias</span><span className="text-right">Sabores</span><span className="text-right">Preço base (R$)</span>
        </div>
        {tamanhos.map((t) => (
          <div key={t.id} className="grid grid-cols-3 items-center gap-2 sm:grid-cols-[1fr_6rem_6rem_8rem]">
            <span className="col-span-3 font-semibold sm:col-span-1">{t.nome}</span>
            <input type="number" min={1} max={32} value={t.fatias} onChange={(e) => alterar(t.id, { fatias: Number(e.target.value) })} className={cn(estiloEntrada, "text-right tabular")} aria-label={`Fatias da ${t.nome}`} />
            <input type="number" min={1} max={6} value={t.maxSabores} onChange={(e) => alterar(t.id, { maxSabores: Number(e.target.value) })} className={cn(estiloEntrada, "text-right tabular")} aria-label={`Sabores da ${t.nome}`} />
            <input value={t.preco} onChange={(e) => alterar(t.id, { preco: e.target.value })} inputMode="decimal" className={cn(estiloEntrada, "text-right tabular")} aria-label={`Preço base da ${t.nome}`} />
          </div>
        ))}
      </div>
    </Secao>
  );
}
