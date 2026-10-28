import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bike, Clock, CupSoda, MapPin, Moon, Phone, QrCode, Store, Wand2 } from "lucide-react";
import { momentoLocal, proximaAbertura, situacaoLoja } from "@pizzaria/core";
import { criarRepositorios } from "@pizzaria/db";
import { formatarReais, formatarTelefone, type ProdutoCardapio, type TamanhoPizza } from "@pizzaria/shared";
import { CAMADAS_BASE, miniaturaDoSabor } from "../../components/pizza-builder/biblioteca";
import { cn, Logo } from "../../components/ui";
import { clientePublico } from "../../lib/supabase/publico";
import { BotaoAdicionar, Carrinho, ChipsCategorias } from "./carrinho";

// Atualiza a cada minuto (status aberto/fechado e mudanças no cardápio).
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const repos = criarRepositorios(clientePublico());
  const [config, categorias] = await Promise.all([repos.loja.configuracao(), repos.cardapio.ativo()]);
  const titulo = `Cardápio · ${config.nomePizzaria}`;
  const descricao = `Monte sua pizza e peça pelo WhatsApp ou Telegram. Cardápio completo da ${config.nomePizzaria}.`;
  // Prévia do link no WhatsApp/Telegram: foto de uma pizza do cardápio.
  const foto = categorias.flatMap((c) => c.produtos).find((p) => p.imagemUrl)?.imagemUrl;
  return {
    title: { absolute: titulo },
    description: descricao,
    openGraph: { title: titulo, description: descricao, type: "website", locale: "pt_BR", ...(foto ? { images: [{ url: foto, width: 450, height: 450 }] } : {}) },
  };
}

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const CARTAO = "rounded-3xl bg-white shadow-[0_1px_3px_rgb(0_0_0/0.06)]";
const PILULA = "flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-[0_1px_3px_rgb(0_0_0/0.06)]";

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
  return { vendaveis, menor, ehPizza, adicional };
}

/** Foto do produto; sem foto, a ilustração do recheio principal (pizza) ou um ícone (bebidas etc.). */
function Miniatura({ produto, ehPizza }: { produto: ProdutoCardapio; ehPizza: boolean }) {
  if (produto.imagemUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={produto.imagemUrl} alt="" loading="lazy" className="size-24 shrink-0 rounded-2xl object-cover" />;
  }
  const recheio = ehPizza ? miniaturaDoSabor(produto.descricao, produto.nome) : null;
  return (
    <span aria-hidden className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_35%_30%,#fffaf0,#efe2c8)]">
      {ehPizza ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={CAMADAS_BASE.massaAssada} alt="" loading="lazy" className="absolute size-[88%] object-contain" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {recheio && <img src={recheio} alt="" loading="lazy" className="relative size-[62%] object-contain drop-shadow-[0_4px_6px_rgb(0_0_0/0.18)]" />}
        </>
      ) : (
        <CupSoda className="size-9 text-marca-600/70" />
      )}
    </span>
  );
}

function Produto({ produto, tamanhos }: { produto: ProdutoCardapio; tamanhos: TamanhoPizza[] }) {
  const { vendaveis, menor, ehPizza, adicional } = precosDoProduto(produto, tamanhos);
  return (
    <li className={cn(CARTAO, "relative flex gap-3 p-3 transition active:scale-[0.99]")}>
      <div className="flex min-w-0 flex-1 flex-col py-0.5 pl-1">
        <h3 className="text-[15px] leading-snug font-bold">{produto.nome}</h3>
        {produto.descricao && <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-stone-500">{produto.descricao}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2">
          {vendaveis.length > 0 && (
            <p className="text-[14.5px] font-extrabold tabular">
              {vendaveis.length > 1 && <span className="text-xs font-medium text-stone-500">a partir de </span>}
              {formatarReais(menor)}
            </p>
          )}
          {adicional > 0 && (
            <span className="rounded-lg bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-wide text-amber-900 uppercase tabular">
              + {formatarReais(adicional)} por sabor
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0">
        <Miniatura produto={produto} ehPizza={ehPizza} />
        <BotaoAdicionar produto={produto} />
      </div>
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
  const canaisPedido = [...(config.whatsappNumero ? (["whatsapp"] as const) : []), ...(config.telegramUsuario ? (["telegram"] as const) : [])];
  const montarPedido = canaisPedido.length > 0;
  const taxas = config.bairros.map((b) => b.taxaCentavos);

  const status = situacao.aberta
    ? { texto: "Aberto agora", tom: "aberta" as const }
    : situacao.motivo === "pausada"
      ? { texto: "Pausa rápida · voltamos em instantes", tom: "pausada" as const }
      : { texto: `Fechado${abre ? ` · abre ${abre}` : ""}`, tom: "fechada" as const };

  return (
    <div className="min-h-dvh bg-[#f6f3ee] text-stone-900">
      <Carrinho
        categorias={categorias}
        tamanhos={config.tamanhos}
        aberta={situacao.aberta}
        canais={canaisPedido}
        linkWhatsapp={linkWhatsapp}
        linkTelegram={linkTelegram}
        nomeLoja={config.nomePizzaria}
        status={status}
      >
        <main className="mx-auto max-w-lg px-4 pb-32">
          {/* Informações da loja, como no topo de um cardápio de delivery */}
          <div className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 pt-3">
            {taxas.length > 0 && (
              <span className={PILULA}>
                <Bike className="size-3.5 text-marca-600" />
                Entrega {Math.min(...taxas) === Math.max(...taxas) ? formatarReais(taxas[0]!) : `a partir de ${formatarReais(Math.min(...taxas))}`}
              </span>
            )}
            <span className={PILULA}>
              <Store className="size-3.5 text-marca-600" />
              Retirada no balcão
            </span>
            {config.pedidoMinimoCentavos > 0 && <span className={PILULA}>Pedido mín. {formatarReais(config.pedidoMinimoCentavos)}</span>}
            <span className={PILULA}>
              <QrCode className="size-3.5 text-marca-600" />
              Pix, dinheiro ou cartão
            </span>
          </div>

          {!situacao.aberta && (
            <div className={cn(CARTAO, "mt-3 flex items-center gap-3 p-4")}>
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-2xl", situacao.motivo === "pausada" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-600")}>
                {situacao.motivo === "pausada" ? <Clock className="size-5" /> : <Moon className="size-5" />}
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-bold">{situacao.motivo === "pausada" ? "Pausa rápida" : "Estamos fechados agora"}</p>
                <p className="text-stone-500">
                  {situacao.motivo === "pausada" ? "Voltamos a receber pedidos em instantes." : abre ? `Abrimos ${abre}.` : "Confira o horário no fim da página."}
                  {montarPedido && " Monte seu pedido: ele fica salvo aqui."}
                </p>
              </div>
            </div>
          )}

          {/* Atalho para o montador visual (só quando o pedido pelo site está ligado) */}
          {config.pedidoLinkAtivo && (
            <Link
              href="/pedir"
              className="group relative mt-3 flex items-center gap-4 overflow-hidden rounded-3xl bg-stone-900 p-4 pr-3 text-white shadow-[0_14px_30px_-16px_rgb(0_0_0/0.6)] transition active:scale-[0.99]"
            >
              <span aria-hidden className="absolute -top-16 -right-10 size-44 rounded-full bg-marca-600/50 blur-3xl" />
              <div className="relative min-w-0 flex-1">
                <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[10.5px] font-extrabold tracking-wide text-marca-200 uppercase">
                  <Wand2 className="size-3" /> Novo
                </span>
                <p className="mt-2 text-lg leading-tight font-extrabold tracking-tight">Monte sua pizza do seu jeito</p>
                <p className="mt-1 text-[12.5px] leading-snug text-stone-300">Escolha os ingredientes, veja a pizza ganhando forma e peça direto pelo site.</p>
                <span className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-marca-600 px-3.5 text-sm font-bold shadow-[0_10px_24px_-10px_rgb(201_53_26/0.8)]">
                  Montar agora <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </span>
              </div>
              <span aria-hidden className="relative flex size-28 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fffaf0,#efe2c8)] shadow-[inset_0_-6px_14px_rgb(0_0_0/0.08)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CAMADAS_BASE.massaAssada} alt="" className="absolute size-[90%] object-contain" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pedir/camadas/mussarela-gratinada.webp" alt="" className="absolute size-[74%] object-contain" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pedir/camadas/pepperoni.webp" alt="" className="absolute size-[54%] object-contain drop-shadow-[0_3px_4px_rgb(0_0_0/0.2)]" />
              </span>
            </Link>
          )}

          {config.tamanhos.length > 0 && (
            <section className={cn(CARTAO, "mt-4 p-4")} aria-labelledby="titulo-tamanhos">
              <div className="mb-3">
                <h2 id="titulo-tamanhos" className="text-[17px] leading-tight font-extrabold tracking-tight">Tamanhos</h2>
                <p className="mt-0.5 text-[12.5px] text-stone-500">
                  Monte com vários sabores. Sabores especiais somam o adicional de cada um.
                  {montarPedido && " Toque em + num sabor e envie o pedido pelo chat."}
                </p>
              </div>
              <ul className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {config.tamanhos.map((t) => (
                  <li key={t.nome} className="flex min-w-[8.5rem] shrink-0 flex-col rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-100">
                    <p className="font-extrabold tracking-tight">{t.nome}</p>
                    <p className="text-[11.5px] text-stone-500">
                      {t.fatias} fatias · {t.maxSabores === 1 ? "1 sabor" : `até ${t.maxSabores} sabores`}
                    </p>
                    <p className="mt-2 text-[11px] text-stone-500">a partir de</p>
                    <p className="text-[15px] leading-tight font-extrabold tabular">{formatarReais(t.precoBaseCentavos)}</p>
                  </li>
                ))}
              </ul>
              {bordas.length > 0 && (
                <div className="mt-3 border-t border-stone-100 pt-3">
                  <p className="mb-2 text-[13px] font-bold">Borda recheada</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bordas.map((b) => (
                      <span key={b.nome} className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700">
                        {b.nome.replace(/^Borda\s+/i, "")} <span className="text-stone-500 tabular">+ {formatarReais(b.precoCentavos)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {categorias.length > 1 && <ChipsCategorias categorias={categorias.map((c) => ({ id: `cat-${c.id}`, nome: c.nome }))} />}

          {categorias.length === 0 && <p className="py-16 text-center text-stone-500">Cardápio em atualização. Volte daqui a pouco!</p>}

          {categorias.map((categoria) => (
            <section key={categoria.id} id={`cat-${categoria.id}`} className="scroll-mt-32 pt-6">
              <h2 className="mb-3 text-lg font-extrabold tracking-tight">{categoria.nome}</h2>
              <ul className="space-y-2.5">
                {categoria.produtos.map((produto) => (
                  <Produto key={produto.id} produto={produto} tamanhos={config.tamanhos} />
                ))}
              </ul>
            </section>
          ))}

          <section className="mt-8 grid gap-3">
            {config.horarios.length > 0 && (
              <div className={cn(CARTAO, "p-4")}>
                <h2 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight">
                  <Clock className="size-4 text-marca-600" /> Horário
                </h2>
                <ul className="mt-3 space-y-0.5 text-sm">
                  {DIAS.map((dia, d) => {
                    const turnos = config.horarios.filter((t) => t.diaSemana === d).sort((a, b) => a.abre.localeCompare(b.abre));
                    return (
                      <li key={d} className={cn("flex justify-between rounded-xl px-3 py-1.5", d === hoje ? "bg-stone-900 font-bold text-white" : "text-stone-600")}>
                        <span>
                          {dia}
                          {d === hoje && " · hoje"}
                        </span>
                        <span className="tabular">{turnos.length ? turnos.map((t) => (t.abre === "00:00" && t.fecha === "23:59" ? "24h" : `${t.abre}–${t.fecha}`)).join(", ") : "Fechado"}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className={cn(CARTAO, "p-4")}>
              <h2 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight">
                {config.bairros.length ? <Bike className="size-4 text-marca-600" /> : <Store className="size-4 text-marca-600" />}
                {config.bairros.length ? "Taxa de entrega" : "Retirada"}
              </h2>
              {config.bairros.length ? (
                <ul className="mt-3 space-y-0.5 text-sm">
                  {config.bairros.map((b) => (
                    <li key={b.id} className="flex justify-between px-3 py-1.5">
                      <span>{b.nome}</span>
                      <span className={cn("font-semibold tabular", b.taxaCentavos ? "text-stone-700" : "text-manjericao-600")}>{b.taxaCentavos ? formatarReais(b.taxaCentavos) : "Grátis"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-stone-600">No momento atendemos só com retirada no balcão.</p>
              )}
              {config.pedidoMinimoCentavos > 0 && <p className="mt-3 border-t border-stone-100 pt-3 text-sm text-stone-500">Pedido mínimo: {formatarReais(config.pedidoMinimoCentavos)}</p>}
            </div>
          </section>

          <footer className="flex flex-col items-center gap-2 pt-8 pb-2 text-center text-sm text-stone-500">
            <Logo className="size-9 drop-shadow-[0_4px_8px_rgb(201_53_26/0.35)]" />
            <p className="text-base font-extrabold tracking-tight text-stone-800">{config.nomePizzaria}</p>
            {config.endereco && (
              <p className="flex items-center gap-1">
                <MapPin className="size-3.5 shrink-0" /> {config.endereco}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              {config.telefone && (
                <a href={`tel:${config.telefone.replace(/\D/g, "")}`} className="flex items-center gap-1 hover:text-stone-900">
                  <Phone className="size-3.5" /> {formatarTelefone(config.telefone)}
                </a>
              )}
              {config.instagram && (
                <a href={`https://instagram.com/${config.instagram}`} target="_blank" rel="noreferrer" className="hover:text-stone-900">
                  @{config.instagram}
                </a>
              )}
            </div>
          </footer>
        </main>
      </Carrinho>
    </div>
  );
}
