import type { Metadata } from "next";
import { Bike, Clock, MapPin, Phone, QrCode, Store } from "lucide-react";
import { momentoLocal, proximaAbertura, situacaoLoja } from "@pizzaria/core";
import { criarRepositorios } from "@pizzaria/db";
import { formatarReais, formatarTelefone, type ProdutoCardapio, type TamanhoPizza } from "@pizzaria/shared";
import { cn, Logo, MiniaturaProduto } from "../../components/ui";
import { clientePublico } from "../../lib/supabase/publico";
import { BotaoAdicionar, Carrinho } from "./carrinho";

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

/** Pizza: preço do sabor por tamanho; adicional = preço - base do tamanho. */
function precosDoProduto(produto: ProdutoCardapio, tamanhos: TamanhoPizza[]) {
  const vendaveis = produto.variacoes.filter((v) => v.tipo === "tamanho" || v.tipo === "padrao");
  const menor = Math.min(...vendaveis.map((v) => v.precoCentavos));
  const ehPizza = vendaveis.some((v) => v.tipo === "tamanho");
  const base = new Map(tamanhos.map((t) => [t.nome.toLowerCase(), t.precoBaseCentavos]));
  const adicionais = vendaveis
    .filter((v) => v.tipo === "tamanho" && base.has(v.nome.toLowerCase()))
    .map((v) => v.precoCentavos - base.get(v.nome.toLowerCase())!);
  const adicional = adicionais.length ? Math.max(0, Math.min(...adicionais)) : 0;
  return { vendaveis, menor, ehPizza, adicional, usaTabela: ehPizza && adicionais.length > 0 };
}

function Produto({ produto, tamanhos }: { produto: ProdutoCardapio; tamanhos: TamanhoPizza[] }) {
  const { vendaveis, menor, ehPizza, adicional, usaTabela } = precosDoProduto(produto, tamanhos);
  return (
    <li className="flex gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-semibold text-stone-900">{produto.nome}</h3>
          {adicional > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">+ {formatarReais(adicional)} por sabor</span>
          )}
        </div>
        {produto.descricao && <p className="mt-1 text-sm leading-relaxed text-stone-500">{produto.descricao}</p>}
        {!usaTabela && (
          <p className="mt-1.5 text-sm font-semibold text-stone-900">
            {ehPizza && vendaveis.length > 1 && <span className="font-normal text-stone-500">a partir de </span>}
            <span className="tabular">{formatarReais(menor)}</span>
          </p>
        )}
        <BotaoAdicionar produto={produto} />
      </div>
      {produto.imagemUrl && <MiniaturaProduto nome={produto.nome} url={produto.imagemUrl} className="size-20 shrink-0 rounded-2xl sm:size-24" />}
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
  // Bordas: as mesmas para todas as pizzas; pega do primeiro sabor que tiver.
  const bordas = [...new Map(categorias.flatMap((c) => c.produtos).flatMap((p) => p.variacoes).filter((v) => v.tipo === "borda").map((v) => [v.nome, v] as const)).values()];

  const linkWhatsapp = config.whatsappNumero ? `https://wa.me/${config.whatsappNumero}?text=${encodeURIComponent("Olá! Quero fazer um pedido 🍕")}` : null;
  const linkTelegram = config.telegramUsuario ? `https://t.me/${config.telegramUsuario}?start=cardapio` : null;
  const temBotoes = Boolean(linkWhatsapp || linkTelegram);
  const montarPedido = Boolean(config.telegramUsuario);

  const status = situacao.aberta
    ? { texto: "Aberto agora", detalhe: "Peça pelo chat — respondemos na hora", cor: "bg-manjericao-500" }
    : situacao.motivo === "pausada"
      ? { texto: "Pausa rápida", detalhe: "Voltamos a receber pedidos em instantes", cor: "bg-amber-400" }
      : { texto: "Fechado agora", detalhe: abre ? `Abrimos ${abre}` : "Confira o horário abaixo", cor: "bg-stone-400" };

  return (
    <div className={cn("min-h-dvh bg-creme-50", (temBotoes || montarPedido) && "pb-28")}>
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

      <Carrinho
        categorias={categorias}
        tamanhos={config.tamanhos}
        aberta={situacao.aberta}
        telegramHabilitado={montarPedido}
        linkWhatsapp={linkWhatsapp}
        linkTelegram={linkTelegram}
      >
      <main className="mx-auto max-w-2xl space-y-10 px-5 py-8">
        {config.tamanhos.length > 0 && (
          <section className="overflow-hidden rounded-3xl bg-stone-950 text-white shadow-elevada" aria-labelledby="titulo-tamanhos">
            <div className="px-5 pt-5 pb-2">
              <h2 id="titulo-tamanhos" className="font-display text-2xl font-semibold">Tamanhos</h2>
              <p className="mt-1 text-sm text-stone-400">
                Monte com vários sabores. Sabores especiais somam o adicional de cada um.
                {montarPedido && " Toque em Montar pizza e envie o pedido pelo Telegram."}
              </p>
            </div>
            <ul className="divide-y divide-white/10 px-5">
              {config.tamanhos.map((t) => (
                <li key={t.nome} className="flex items-center gap-3 py-3">
                  <div className="flex-1">
                    <p className="font-semibold">{t.nome}</p>
                    <p className="text-sm text-stone-400">
                      {t.fatias} fatias · {t.maxSabores === 1 ? "1 sabor" : `até ${t.maxSabores} sabores`}
                    </p>
                  </div>
                  <p className="text-right">
                    <span className="block text-xs text-stone-400">a partir de</span>
                    <span className="font-display text-xl font-semibold tabular">{formatarReais(t.precoBaseCentavos)}</span>
                  </p>
                </li>
              ))}
            </ul>
            {bordas.length > 0 && (
              <div className="mt-2 bg-white/5 px-5 py-4">
                <p className="text-sm font-semibold text-marca-300">Borda recheada</p>
                <p className="mt-1 text-sm text-stone-300">
                  {bordas.map((b) => `${b.nome.replace(/^Borda\s+/i, "")} ${formatarReais(b.precoCentavos)}`).join(" · ")}
                </p>
              </div>
            )}
          </section>
        )}

        {categorias.length === 0 && <p className="py-16 text-center text-stone-500">Cardápio em atualização. Volte daqui a pouco!</p>}

        {categorias.map((categoria) => (
          <section key={categoria.id} id={`cat-${categoria.id}`} className="scroll-mt-20">
            <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">{categoria.nome}</h2>
            <ul className="divide-y divide-creme-200 rounded-3xl bg-white px-5 py-5 shadow-suave ring-1 ring-stone-900/5">
              {categoria.produtos.map((produto) => <Produto key={produto.id} produto={produto} tamanhos={config.tamanhos} />)}
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

      </Carrinho>
    </div>
  );
}
