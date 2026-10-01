import type { Metadata } from "next";
import { Bike, Clock, MapPin, MessageCircle, Phone, QrCode, Send, Store } from "lucide-react";
import { momentoLocal, proximaAbertura, situacaoLoja } from "@pizzaria/core";
import { criarRepositorios } from "@pizzaria/db";
import { formatarReais, formatarTelefone, type ProdutoCardapio } from "@pizzaria/shared";
import { cn, Logo, MiniaturaProduto } from "../../components/ui";
import { clientePublico } from "../../lib/supabase/publico";

// Atualiza a cada minuto (status aberto/fechado e mudanças no cardápio).
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const config = await criarRepositorios(clientePublico()).loja.configuracao();
  return {
    title: { absolute: `Cardápio · ${config.nomePizzaria}` },
    description: `Peça pelo WhatsApp ou Telegram. Cardápio completo da ${config.nomePizzaria}.`,
  };
}

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function precoBase(produto: ProdutoCardapio) {
  const base = produto.variacoes.filter((v) => v.tipo === "tamanho" || v.tipo === "padrao");
  const menor = Math.min(...base.map((v) => v.precoCentavos));
  return { base, menor, temTamanhos: base.some((v) => v.tipo === "tamanho") && base.length > 1 };
}

function Produto({ produto }: { produto: ProdutoCardapio }) {
  const { base, menor, temTamanhos } = precoBase(produto);
  const extras = produto.variacoes.filter((v) => v.tipo === "borda" || v.tipo === "adicional");
  return (
    <li className="flex gap-4 py-5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-stone-900">{produto.nome}</h3>
        {produto.descricao && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-stone-500">{produto.descricao}</p>}
        <p className="mt-2 font-semibold text-stone-900">
          {temTamanhos && <span className="text-sm font-normal text-stone-500">a partir de </span>}
          <span className="tabular">{formatarReais(menor)}</span>
        </p>
        {temTamanhos && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {base.map((v) => (
              <span key={v.id} className="rounded-lg bg-creme-100 px-2 py-1 text-xs text-stone-600 ring-1 ring-creme-300">
                {v.nome} <b className="tabular text-stone-800">{formatarReais(v.precoCentavos)}</b>
              </span>
            ))}
          </div>
        )}
        {extras.length > 0 && <p className="mt-2 text-xs text-stone-500">{extras.map((v) => `${v.nome} +${formatarReais(v.precoCentavos)}`).join(" · ")}</p>}
      </div>
      <MiniaturaProduto nome={produto.nome} url={produto.imagemUrl} className="size-24 shrink-0 rounded-2xl text-3xl sm:size-28" />
    </li>
  );
}

export default async function CardapioPage() {
  const repos = criarRepositorios(clientePublico());
  const [categorias, config] = await Promise.all([repos.cardapio.ativo(), repos.loja.configuracao()]);
  const agora = new Date();
  const situacao = situacaoLoja(config, agora);
  const abre = situacao.aberta ? null : proximaAbertura(config.horarios, agora, config.fusoHorario);
  const hoje = momentoLocal(agora, config.fusoHorario).diaSemana;
  const temMeioAMeio = categorias.some((c) => c.produtos.some((p) => p.variacoes.filter((v) => v.tipo === "tamanho").length > 1));

  const linkWhatsapp = config.whatsappNumero ? `https://wa.me/${config.whatsappNumero}?text=${encodeURIComponent("Olá! Quero fazer um pedido 🍕")}` : null;
  const linkTelegram = config.telegramUsuario ? `https://t.me/${config.telegramUsuario}?start=cardapio` : null;
  const temBotoes = Boolean(linkWhatsapp || linkTelegram);

  const status = situacao.aberta
    ? { texto: "Aberto agora", detalhe: "Peça pelo chat — respondemos na hora", cor: "bg-manjericao-500" }
    : situacao.motivo === "pausada"
      ? { texto: "Pausa rápida", detalhe: "Voltamos a receber pedidos em instantes", cor: "bg-amber-400" }
      : { texto: "Fechado agora", detalhe: abre ? `Abrimos ${abre}` : "Confira o horário abaixo", cor: "bg-stone-400" };

  return (
    <div className={cn("min-h-dvh bg-creme-50", temBotoes && "pb-28")}>
      <header className="relative overflow-hidden bg-stone-950 text-white">
        <div aria-hidden className="absolute -top-24 -right-20 size-80 rounded-full bg-marca-600/40 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-16 size-72 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="relative mx-auto max-w-2xl px-5 pt-10 pb-9">
          <div className="flex items-center gap-3">
            <Logo className="size-12" />
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-marca-300 uppercase">Pizzaria</p>
              <h1 className="font-display text-3xl leading-tight font-semibold">{config.nomePizzaria}</h1>
            </div>
          </div>

          <div className="mt-7 flex items-center gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
            <span className="relative flex size-3 shrink-0">
              {situacao.aberta && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", status.cor)} />}
              <span className={cn("relative inline-flex size-3 rounded-full", status.cor)} />
            </span>
            <div>
              <p className="font-semibold">{status.texto}</p>
              <p className="text-sm text-stone-300">{status.detalhe}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-300">
            <span className="flex items-center gap-1.5"><Bike className="size-4 text-marca-300" />{config.bairros.length ? "Entrega e retirada" : "Retirada no balcão"}</span>
            <span className="flex items-center gap-1.5"><QrCode className="size-4 text-marca-300" />Pix, dinheiro ou cartão</span>
            {config.endereco && <span className="flex items-center gap-1.5"><MapPin className="size-4 text-marca-300" />{config.endereco}</span>}
          </div>
        </div>
      </header>

      {categorias.length > 1 && (
        <nav className="sticky top-0 z-10 border-b border-creme-300/70 bg-creme-50/90 backdrop-blur" aria-label="Categorias">
          <div className="sem-barra mx-auto flex max-w-2xl gap-2 overflow-x-auto px-5 py-3">
            {categorias.map((c) => (
              <a key={c.id} href={`#cat-${c.id}`} className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-suave ring-1 ring-stone-900/5 hover:text-marca-700">
                {c.nome}
              </a>
            ))}
          </div>
        </nav>
      )}

      <main className="mx-auto max-w-2xl space-y-10 px-5 py-8">
        {temMeioAMeio && (
          <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">
            <span className="text-xl leading-none">🍕</span>
            <p><b>Pode pedir meio a meio!</b> Dois sabores no mesmo tamanho — vale o preço do sabor mais caro.</p>
          </div>
        )}

        {categorias.length === 0 && <p className="py-16 text-center text-stone-500">Cardápio em atualização. Volte daqui a pouco!</p>}

        {categorias.map((categoria) => (
          <section key={categoria.id} id={`cat-${categoria.id}`} className="scroll-mt-20">
            <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">{categoria.nome}</h2>
            <ul className="divide-y divide-creme-200 rounded-3xl bg-white px-5 py-5 shadow-suave ring-1 ring-stone-900/5">
              {categoria.produtos.map((produto) => <Produto key={produto.id} produto={produto} />)}
            </ul>
          </section>
        ))}

        <section className="grid gap-4 sm:grid-cols-2">
          {config.horarios.length > 0 && (
            <div className="rounded-3xl bg-white p-5 shadow-suave ring-1 ring-stone-900/5">
              <h2 className="flex items-center gap-2 font-semibold"><Clock className="size-4 text-marca-600" /> Horário</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {DIAS.map((dia, d) => {
                  const turnos = config.horarios.filter((t) => t.diaSemana === d).sort((a, b) => a.abre.localeCompare(b.abre));
                  return (
                    <li key={d} className={cn("flex justify-between rounded-lg px-2 py-1", d === hoje && "bg-marca-50 font-semibold text-marca-800")}>
                      <span>{dia}{d === hoje && " · hoje"}</span>
                      <span className="tabular">{turnos.length ? turnos.map((t) => (t.abre === "00:00" && t.fecha === "23:59" ? "24h" : `${t.abre}–${t.fecha}`)).join(", ") : "Fechado"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="rounded-3xl bg-white p-5 shadow-suave ring-1 ring-stone-900/5">
            <h2 className="flex items-center gap-2 font-semibold">
              {config.bairros.length ? <Bike className="size-4 text-marca-600" /> : <Store className="size-4 text-marca-600" />}
              {config.bairros.length ? "Taxa de entrega" : "Retirada"}
            </h2>
            {config.bairros.length ? (
              <ul className="mt-3 space-y-1 text-sm">
                {config.bairros.map((b) => (
                  <li key={b.id} className="flex justify-between px-2 py-1">
                    <span>{b.nome}</span>
                    <span className="tabular text-stone-600">{b.taxaCentavos ? formatarReais(b.taxaCentavos) : "Grátis"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-stone-600">No momento atendemos só com retirada no balcão.</p>
            )}
            {config.pedidoMinimoCentavos > 0 && <p className="mt-3 border-t border-stone-100 pt-3 text-sm text-stone-500">Pedido mínimo: {formatarReais(config.pedidoMinimoCentavos)}</p>}
          </div>
        </section>

        <footer className="flex flex-col items-center gap-2 pt-4 pb-2 text-center text-sm text-stone-500">
          <Logo className="size-8" />
          <p className="font-display text-base font-semibold text-stone-700">{config.nomePizzaria}</p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {config.telefone && <a href={`tel:${config.telefone.replace(/\D/g, "")}`} className="flex items-center gap-1 hover:text-stone-900"><Phone className="size-3.5" /> {formatarTelefone(config.telefone)}</a>}
            {config.instagram && <a href={`https://instagram.com/${config.instagram}`} target="_blank" rel="noreferrer" className="hover:text-stone-900">@{config.instagram}</a>}
          </div>
        </footer>
      </main>

      {temBotoes && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200/80 bg-white/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-2xl gap-2">
            {linkWhatsapp && (
              <a href={linkWhatsapp} className="flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#25D366] font-bold text-white shadow-sm transition hover:brightness-95">
                <MessageCircle className="size-5" /> Pedir no WhatsApp
              </a>
            )}
            {linkTelegram && (
              <a href={linkTelegram} className="flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#229ED9] font-bold text-white shadow-sm transition hover:brightness-95">
                <Send className="size-5" /> Pedir no Telegram
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
