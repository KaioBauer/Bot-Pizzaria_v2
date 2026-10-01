import type { Metadata } from "next";
import { proximaAbertura, situacaoLoja } from "@pizzaria/core";
import { criarRepositorios } from "@pizzaria/db";
import { formatarReais, formatarTelefone, type ProdutoCardapio } from "@pizzaria/shared";
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

function Precos({ produto }: { produto: ProdutoCardapio }) {
  const base = produto.variacoes.filter((v) => v.tipo === "tamanho" || v.tipo === "padrao");
  const extras = produto.variacoes.filter((v) => v.tipo === "borda" || v.tipo === "adicional");
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {base.map((v) => (
          <span key={v.id} className="rounded-full bg-marca-50 px-2.5 py-1 text-sm ring-1 ring-marca-100">
            {v.tipo === "tamanho" && <span className="text-stone-600">{v.nome} </span>}
            <b className="text-marca-700">{formatarReais(v.precoCentavos)}</b>
          </span>
        ))}
      </div>
      {extras.length > 0 && (
        <p className="text-xs text-stone-500">
          {extras.map((v) => `${v.nome} +${formatarReais(v.precoCentavos)}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

export default async function CardapioPage() {
  const repos = criarRepositorios(clientePublico());
  const [categorias, config] = await Promise.all([repos.cardapio.ativo(), repos.loja.configuracao()]);
  const agora = new Date();
  const situacao = situacaoLoja(config, agora);
  const abre = situacao.aberta ? null : proximaAbertura(config.horarios, agora, config.fusoHorario);
  const temMeioAMeio = categorias.some((c) => c.produtos.some((p) => p.variacoes.some((v) => v.tipo === "tamanho")));

  const linkWhatsapp = config.whatsappNumero
    ? `https://wa.me/${config.whatsappNumero}?text=${encodeURIComponent("Olá! Quero fazer um pedido 🍕")}`
    : null;
  const linkTelegram = config.telegramUsuario ? `https://t.me/${config.telegramUsuario}?start=cardapio` : null;

  return (
    <div className="min-h-dvh bg-stone-50 pb-28">
      <header className="bg-gradient-to-b from-marca-700 to-marca-600 px-5 pb-8 pt-10 text-white">
        <div className="mx-auto max-w-2xl">
          <p className="text-4xl">🍕</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">{config.nomePizzaria}</h1>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium backdrop-blur">
            <span className={`size-2.5 rounded-full ${situacao.aberta ? "bg-emerald-300" : "bg-red-300"}`} />
            {situacao.aberta
              ? "Aberto agora — peça pelo chat!"
              : situacao.motivo === "pausada"
                ? "Pausamos os pedidos por alguns minutos"
                : `Fechado agora${abre ? ` · abre ${abre}` : ""}`}
          </div>
          {config.endereco && <p className="mt-3 text-sm text-white/80">📍 {config.endereco}</p>}
        </div>
      </header>

      {categorias.length > 1 && (
        <nav className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-3">
            {categorias.map((c) => (
              <a key={c.id} href={`#cat-${c.id}`} className="shrink-0 rounded-full bg-stone-100 px-4 py-1.5 text-sm font-medium hover:bg-stone-200">
                {c.nome}
              </a>
            ))}
          </div>
        </nav>
      )}

      <main className="mx-auto max-w-2xl space-y-8 px-4 py-6">
        {temMeioAMeio && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            🍕 Pizza <b>meio a meio</b>: escolha 2 sabores do mesmo tamanho — vale o preço do mais caro.
          </p>
        )}

        {categorias.length === 0 && <p className="py-12 text-center text-stone-500">Cardápio em atualização. Volte daqui a pouco!</p>}

        {categorias.map((categoria) => (
          <section key={categoria.id} id={`cat-${categoria.id}`} className="scroll-mt-16">
            <h2 className="mb-3 text-xl font-black">{categoria.nome}</h2>
            <ul className="space-y-3">
              {categoria.produtos.map((produto) => (
                <li key={produto.id} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200">
                  {produto.imagemUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={produto.imagemUrl} alt={produto.nome} loading="lazy" className="size-24 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex size-24 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-4xl">🍕</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold">{produto.nome}</h3>
                    {produto.descricao && <p className="text-sm text-stone-600">{produto.descricao}</p>}
                    <Precos produto={produto} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
          <h2 className="text-lg font-black">Informações</h2>
          {config.horarios.length > 0 && (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">Horário</h3>
              <ul className="mt-1 text-sm">
                {DIAS.map((dia, d) => {
                  const turnos = config.horarios.filter((t) => t.diaSemana === d).sort((a, b) => a.abre.localeCompare(b.abre));
                  return (
                    <li key={d} className="flex justify-between border-b border-stone-100 py-1 last:border-0">
                      <span>{dia}</span>
                      <span className="tabular-nums text-stone-600">{turnos.length ? turnos.map((t) => `${t.abre}–${t.fecha}`).join(", ") : "Fechado"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">Entrega</h3>
            {config.bairros.length ? (
              <ul className="mt-1 grid grid-cols-2 gap-x-4 text-sm">
                {config.bairros.map((b) => (
                  <li key={b.id} className="flex justify-between py-0.5">
                    <span>{b.nome}</span>
                    <span className="text-stone-600">{b.taxaCentavos ? formatarReais(b.taxaCentavos) : "Grátis"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-stone-600">No momento, apenas retirada no balcão.</p>
            )}
            {config.pedidoMinimoCentavos > 0 && <p className="mt-1 text-sm text-stone-600">Pedido mínimo: {formatarReais(config.pedidoMinimoCentavos)}</p>}
          </div>
          <p className="text-sm text-stone-600">Pagamento: Pix, dinheiro ou cartão na entrega/retirada.</p>
          {(config.telefone || config.instagram) && (
            <p className="text-sm text-stone-600">
              {config.telefone && <>📞 {formatarTelefone(config.telefone)} </>}
              {config.instagram && (
                <a href={`https://instagram.com/${config.instagram}`} className="underline" target="_blank" rel="noreferrer">
                  @{config.instagram}
                </a>
              )}
            </p>
          )}
        </section>
      </main>

      {(linkWhatsapp || linkTelegram) && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl gap-2">
            {linkWhatsapp && (
              <a href={linkWhatsapp} className="flex-1 rounded-xl bg-[#25D366] py-3.5 text-center font-bold text-white shadow-sm">
                Pedir pelo WhatsApp
              </a>
            )}
            {linkTelegram && (
              <a href={linkTelegram} className="flex-1 rounded-xl bg-[#229ED9] py-3.5 text-center font-bold text-white shadow-sm">
                Pedir pelo Telegram
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
