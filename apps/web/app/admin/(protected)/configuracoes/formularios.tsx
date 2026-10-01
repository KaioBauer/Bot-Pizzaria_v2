"use client";

import { useState, useTransition } from "react";
import type { BairroAdmin, ConfiguracaoAdmin } from "@pizzaria/db";
import { centavosParaCampo, lerReais, type TurnoFuncionamento } from "@pizzaria/shared";
import { salvarBairrosAction, salvarConfiguracaoAction, salvarHorariosAction, type Resultado } from "./actions";

const campo = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-100";
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function useSalvar() {
  const [salvando, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
  const salvar = (acao: () => Promise<Resultado>, sucesso = "Salvo!") =>
    iniciar(async () => {
      const r = await acao();
      setMensagem(r.ok ? { ok: true, texto: sucesso } : { ok: false, texto: r.erro });
    });
  return { salvando, mensagem, setMensagem, salvar };
}

function Rodape({ salvando, mensagem, aoSalvar, rotulo }: { salvando: boolean; mensagem: { ok: boolean; texto: string } | null; aoSalvar: () => void; rotulo: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      <button onClick={aoSalvar} disabled={salvando} className="rounded-lg bg-marca-600 px-5 py-2.5 font-semibold text-white disabled:opacity-60">
        {salvando ? "Salvando..." : rotulo}
      </button>
      {mensagem && <span role="status" className={mensagem.ok ? "text-emerald-700" : "text-red-700"}>{mensagem.texto}</span>}
    </div>
  );
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <div>
        <h2 className="text-lg font-bold">{titulo}</h2>
        {descricao && <p className="text-sm text-stone-500">{descricao}</p>}
      </div>
      {children}
    </section>
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
  const mudar = (campoNome: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setC((atual) => ({ ...atual, [campoNome]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  return (
    <Secao titulo="Pizzaria" descricao="Aparece no cardápio público, no bot e no cupom.">
      <label className="flex items-center gap-2 rounded-xl bg-stone-50 p-3">
        <input type="checkbox" checked={c.aceitandoPedidos} onChange={mudar("aceitandoPedidos")} className="size-5 accent-marca-600" />
        <span>
          <b>Recebendo pedidos</b>
          <span className="block text-sm text-stone-500">Desmarque para pausar o bot mesmo dentro do horário (ex.: cozinha lotada).</span>
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="text-sm font-medium">Nome</span><input value={c.nomePizzaria} onChange={mudar("nomePizzaria")} className={campo} /></label>
        <label><span className="text-sm font-medium">Telefone</span><input value={c.telefone} onChange={mudar("telefone")} className={campo} placeholder="(11) 3333-4444" /></label>
        <label className="sm:col-span-2"><span className="text-sm font-medium">Endereço (para retirada)</span><input value={c.endereco} onChange={mudar("endereco")} className={campo} /></label>
        <label><span className="text-sm font-medium">WhatsApp do bot (DDI+DDD+número)</span><input value={c.whatsappNumero} onChange={mudar("whatsappNumero")} inputMode="numeric" className={campo} placeholder="5511987654321" /></label>
        <label><span className="text-sm font-medium">Usuário do bot no Telegram</span><input value={c.telegramUsuario} onChange={mudar("telegramUsuario")} className={campo} placeholder="ViannaPizzariaBot" /></label>
        <label><span className="text-sm font-medium">Instagram</span><input value={c.instagram} onChange={mudar("instagram")} className={campo} placeholder="viannapizzaria" /></label>
        <label><span className="text-sm font-medium">Pedido mínimo (R$)</span><input value={c.pedidoMinimo} onChange={mudar("pedidoMinimo")} inputMode="decimal" className={campo} /></label>
        <label><span className="text-sm font-medium">Prazo para pagar o Pix (minutos)</span><input type="number" min={5} max={1440} value={c.pixExpiracaoMinutos} onChange={(e) => setC({ ...c, pixExpiracaoMinutos: Number(e.target.value) })} className={campo} /></label>
      </div>
      <Rodape
        salvando={salvando}
        mensagem={mensagem}
        rotulo="Salvar dados da pizzaria"
        aoSalvar={() => {
          const minimo = lerReais(c.pedidoMinimo);
          if (minimo === null) return setMensagem({ ok: false, texto: "Pedido mínimo inválido" });
          const { pedidoMinimo: _ignorado, ...resto } = c;
          salvar(() => salvarConfiguracaoAction({ ...resto, pedidoMinimoCentavos: minimo }));
        }}
      />
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
    <Secao titulo="Horário de funcionamento" descricao="Fora destes horários o bot avisa que está fechado e não aceita pedidos. Turno que passa da meia-noite: ex. 18:00 até 01:00.">
      <div className="divide-y divide-stone-100">
        {DIAS.map((dia, d) => {
          const doDia = turnos.filter((t) => t.diaSemana === d);
          return (
            <div key={d} className="flex flex-wrap items-center gap-2 py-2">
              <span className="w-24 font-medium">{dia}</span>
              <div className="flex flex-1 flex-wrap gap-2">
                {doDia.length === 0 && <span className="py-2 text-sm text-stone-400">Fechado</span>}
                {doDia.map((t) => (
                  <span key={t.chave} className="flex items-center gap-1 rounded-lg bg-stone-50 p-1 ring-1 ring-stone-200">
                    <input type="time" value={t.abre} onChange={(e) => alterar(t.chave, { abre: e.target.value })} className="rounded-md px-1 py-1" aria-label="Abre" />
                    <span className="text-stone-400">até</span>
                    <input type="time" value={t.fecha} onChange={(e) => alterar(t.chave, { fecha: e.target.value })} className="rounded-md px-1 py-1" aria-label="Fecha" />
                    <button onClick={() => setTurnos((ts) => ts.filter((x) => x.chave !== t.chave))} className="px-2 text-red-600" aria-label="Remover turno">×</button>
                  </span>
                ))}
              </div>
              <button onClick={() => setTurnos([...turnos, { diaSemana: d, abre: "18:00", fecha: "23:00", chave: proximaChave() }])} className="rounded-lg px-2 py-1 text-sm ring-1 ring-stone-300">+ turno</button>
              {doDia.length > 0 && <button onClick={() => copiarParaTodos(d)} className="rounded-lg px-2 py-1 text-sm text-stone-600 hover:bg-stone-100">copiar p/ todos</button>}
            </div>
          );
        })}
      </div>
      <Rodape salvando={salvando} mensagem={mensagem} rotulo="Salvar horários" aoSalvar={() => salvar(() => salvarHorariosAction(turnos.map(({ chave: _c, ...t }) => t)))} />
    </Secao>
  );
}

export function FormBairros({ inicial }: { inicial: BairroAdmin[] }) {
  const [bairros, setBairros] = useState(inicial.map((b, i) => ({ ...b, chave: i, taxa: centavosParaCampo(b.taxaCentavos) })));
  const { salvando, mensagem, setMensagem, salvar } = useSalvar();
  const alterar = (chave: number, m: Partial<(typeof bairros)[number]>) => setBairros((bs) => bs.map((b) => (b.chave === chave ? { ...b, ...m } : b)));

  return (
    <Secao titulo="Bairros atendidos e taxa de entrega" descricao="Sem nenhum bairro ativo, o bot oferece só retirada no balcão.">
      {bairros.length === 0 && <p className="text-sm text-stone-500">Nenhum bairro cadastrado.</p>}
      {bairros.map((b) => (
        <div key={b.chave} className={`grid grid-cols-[1fr_7rem_auto_auto] items-center gap-2 ${b.ativo ? "" : "opacity-60"}`}>
          <input value={b.nome} onChange={(e) => alterar(b.chave, { nome: e.target.value })} placeholder="Bairro" className={campo} aria-label="Bairro" />
          <input value={b.taxa} onChange={(e) => alterar(b.chave, { taxa: e.target.value })} inputMode="decimal" placeholder="Taxa" className={`${campo} text-right`} aria-label="Taxa" />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={b.ativo} onChange={(e) => alterar(b.chave, { ativo: e.target.checked })} className="size-4 accent-marca-600" /> Ativo</label>
          <button onClick={() => setBairros((bs) => bs.filter((x) => x.chave !== b.chave))} className="px-2 text-red-600" aria-label="Remover bairro">×</button>
        </div>
      ))}
      <button
        onClick={() => setBairros([...bairros, { nome: "", taxa: "", taxaCentavos: 0, ativo: true, chave: Math.max(0, ...bairros.map((b) => b.chave)) + 1 }])}
        className="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-stone-300"
      >
        + Bairro
      </button>
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
    </Secao>
  );
}
