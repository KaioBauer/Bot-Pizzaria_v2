"use client";

import { Banknote, Bike, CreditCard, CupSoda, Loader2, Minus, Pencil, Plus, QrCode, Store, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import type { CatalogoPedir } from "@pizzaria/db";
import { formatarReais, pedidoLinkSchema, type BairroEntrega, type FormaPagamento, type TipoEntrega } from "@pizzaria/shared";
import { miniaturaDoSabor, visualDoNome } from "../../components/pizza-builder";
import { cn } from "../../components/ui";
import { finalizarPedidoAction } from "./actions";
import { carregar, precificar, previaItem, salvar, type ItemCarrinho, type Precos } from "./modelo";

export interface InfoLoja {
  nome: string;
  aberta: boolean;
  linkAtivo: boolean;
  proximaAbertura: string | null;
  pausada: boolean;
  pix: boolean;
  bairros: BairroEntrega[];
  pedidoMinimoCentavos: number;
  maxIngredientes: number;
}

const ehPizza = (i: ItemCarrinho, precos: Precos) => precos.variacoes.get(i.item.sabores[0]?.variacao_id ?? "")?.tipo === "tamanho";

/** Miniatura do item na sacola: o recheio principal da pizza ou a foto da bebida. */
function miniatura(i: ItemCarrinho, catalogo: CatalogoPedir): string | null {
  const produto = [...catalogo.pizzas, ...catalogo.outros].find((p) => p.id === i.item.sabores[0]?.produto_id);
  if (!produto) return null;
  if (produto.montagemLivre) {
    // O recheio que mais aparece: o primeiro em pedaços (calabresa...), não o queijo.
    const escolhidos = i.item.ingredientes.flatMap((id) => catalogo.ingredientes.filter((x) => x.id === id));
    const ingrediente = escolhidos.find((x) => x.camadaTipo === "pedacos") ?? escolhidos[0];
    return ingrediente ? (ingrediente.camadaUrl ?? visualDoNome(ingrediente.nome)?.url ?? null) : null;
  }
  return produto.camadaUrl ?? miniaturaDoSabor(produto.descricao, produto.nome) ?? produto.imagemUrl;
}

// Sacola -----------------------------------------------------------------------------------

export function ListaCarrinho({
  itens,
  precos,
  catalogo,
  aoAlterar,
  aoEditar,
}: {
  itens: ItemCarrinho[];
  precos: Precos;
  catalogo: CatalogoPedir;
  aoAlterar: (itens: ItemCarrinho[]) => void;
  aoEditar: (id: string) => void;
}) {
  if (!itens.length)
    return (
      <div className="py-12 text-center">
        <p className="text-4xl">🍕</p>
        <p className="mt-2 font-bold">Sua sacola está vazia</p>
        <p className="text-sm text-stone-500">Que tal montar uma pizza?</p>
      </div>
    );
  const mudarQuantidade = (id: string, delta: number) =>
    aoAlterar(itens.flatMap((i) => (i.id !== id ? [i] : i.item.quantidade + delta <= 0 ? [] : [{ ...i, item: { ...i.item, quantidade: Math.min(50, i.item.quantidade + delta) } }])));

  return (
    <ul className="space-y-3">
      {itens.map((i) => {
        const p = previaItem(i.item, precos);
        const imagem = miniatura(i, catalogo);
        return (
          <li key={i.id} className="flex gap-3 rounded-3xl bg-stone-50 p-3">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_35%_30%,#fffaf0,#efe2c8)]">
              {imagem ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagem} alt="" className="size-[85%] object-contain" />
              ) : (
                <CupSoda className="size-7 text-marca-600/70" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] leading-snug font-bold">{p.ok ? p.descricao : "Item indisponível"}</p>
              {i.item.observacao && <p className="mt-0.5 text-xs text-stone-500">Obs.: {i.item.observacao}</p>}
              {!p.ok && <p className="text-xs text-marca-700">{p.erro}</p>}
              <div className="mt-2 flex items-center gap-2">
                <span className="mr-auto text-[15px] font-extrabold tabular">{p.ok ? formatarReais(p.subtotalCentavos) : "—"}</span>
                {ehPizza(i, precos) && (
                  <button type="button" onClick={() => aoEditar(i.id)} className="flex size-9 items-center justify-center rounded-full bg-white text-stone-600 shadow-[0_1px_3px_rgb(0_0_0/0.08)]" aria-label="Editar pizza">
                    <Pencil className="size-4" />
                  </button>
                )}
                <div className="flex items-center rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.08)]">
                  <button type="button" onClick={() => mudarQuantidade(i.id, -1)} className="flex size-9 items-center justify-center text-marca-600" aria-label="Diminuir">
                    {i.item.quantidade === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" strokeWidth={2.5} />}
                  </button>
                  <span className="w-5 text-center text-sm font-bold tabular">{i.item.quantidade}</span>
                  <button type="button" onClick={() => mudarQuantidade(i.id, 1)} className="flex size-9 items-center justify-center text-marca-600" aria-label="Aumentar">
                    <Plus className="size-4" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Dados do cliente e envio --------------------------------------------------------------------

const PAGAMENTOS: { valor: FormaPagamento; rotulo: string; detalhe: string; Icone: typeof QrCode }[] = [
  { valor: "pix", rotulo: "Pix", detalhe: "Pague agora pelo app do banco", Icone: QrCode },
  { valor: "dinheiro", rotulo: "Dinheiro", detalhe: "Na entrega ou na retirada", Icone: Banknote },
  { valor: "cartao", rotulo: "Cartão", detalhe: "Maquininha na entrega", Icone: CreditCard },
];

const entrada =
  "h-12 w-full rounded-2xl bg-white px-4 text-[15px] ring-1 ring-stone-200 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-marca-400";

function Campo({ texto, children, erro }: { texto: string; children: ReactNode; erro?: string | undefined }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-stone-600">{texto}</span>
      {children}
      {erro && <span className="mt-1 block text-[13px] font-medium text-marca-700">{erro}</span>}
    </label>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-stone-50 p-4">
      <h3 className="mb-3 text-[15px] font-extrabold tracking-tight">{titulo}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function FormularioPedido({
  itens,
  precos,
  loja,
  chaveIdempotencia,
  aoConcluir,
}: {
  itens: ItemCarrinho[];
  precos: Precos;
  loja: InfoLoja;
  chaveIdempotencia: string;
  aoConcluir: (token: string) => void;
}) {
  const [dados, setDados] = useState({ nome: "", telefone: "", rua: "", numero: "", bairroId: "", complemento: "", referencia: "" });
  const [tipo, setTipo] = useState<TipoEntrega>(loja.bairros.length ? "entrega" : "retirada");
  const [pagamento, setPagamento] = useState<FormaPagamento | null>(null);
  const [troco, setTroco] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [site, setSite] = useState(""); // honeypot
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string[]>([]);
  const [enviando, iniciar] = useTransition();

  // Cliente que volta: nome, telefone e endereço já preenchidos.
  useEffect(() => {
    const salvo = carregar().cliente;
    if (salvo) setDados((d) => ({ ...d, ...salvo }));
  }, []);

  const cotacao = precificar(itens.map((i) => i.item), precos);
  const subtotal = cotacao.ok ? cotacao.subtotalCentavos : 0;
  const bairro = loja.bairros.find((b) => b.id === dados.bairroId);
  const taxa = tipo === "entrega" ? (bairro?.taxaCentavos ?? 0) : 0;
  const total = subtotal + taxa;
  const abaixoDoMinimo = subtotal < loja.pedidoMinimoCentavos;
  const podeFinalizar = loja.aberta && loja.linkAtivo && cotacao.ok && !abaixoDoMinimo;

  function enviar() {
    const trocoReais = troco.trim() ? Number(troco.replace(/\./g, "").replace(",", ".")) : null;
    const pedido = {
      itens: itens.map((i) => i.item),
      tipo_entrega: tipo,
      endereco:
        tipo === "entrega"
          ? { rua: dados.rua, numero: dados.numero, bairro_id: dados.bairroId, complemento: dados.complemento || null, referencia: dados.referencia || null }
          : null,
      forma_pagamento: pagamento,
      troco_para: pagamento === "dinheiro" && trocoReais ? trocoReais : null,
      cliente_nome: dados.nome,
      cliente_telefone: dados.telefone,
      observacoes: observacoes || null,
      chave_idempotencia: chaveIdempotencia,
    };
    // Mesmo schema do servidor: erros aparecem no campo antes de enviar.
    const validado = pedidoLinkSchema.safeParse(pedido);
    if (!validado.success) {
      const mapa: Record<string, string> = {};
      for (const issue of validado.error.issues) {
        const campo = issue.path[0] === "endereco" ? `endereco.${String(issue.path[1] ?? "")}` : String(issue.path[0]);
        mapa[campo] ??=
          campo === "forma_pagamento" ? "Escolha a forma de pagamento" : campo.startsWith("endereco") ? "Confira este campo" : campo === "cliente_telefone" ? "Telefone com DDD" : issue.message;
      }
      setErros(mapa);
      setErroGeral([]);
      return;
    }
    if (trocoReais !== null && trocoReais * 100 < total) {
      setErros({ troco_para: `O troco precisa ser para um valor maior que ${formatarReais(total)}` });
      return;
    }
    setErros({});
    iniciar(async () => {
      const r = await finalizarPedidoAction({ ...validado.data, site });
      if (!r.ok) {
        setErroGeral(r.erros);
        return;
      }
      salvar({ itens: [], cliente: { nome: dados.nome, telefone: dados.telefone, rua: dados.rua, numero: dados.numero, bairroId: dados.bairroId, complemento: dados.complemento, referencia: dados.referencia } });
      aoConcluir(r.token);
    });
  }

  const campo = (nome: keyof typeof dados) => ({
    value: dados[nome],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDados({ ...dados, [nome]: e.target.value }),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (podeFinalizar && !enviando) enviar();
      }}
      className="space-y-3"
      noValidate
    >
      {/* Honeypot: invisível para pessoas; robôs preenchem e o bot recusa. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site <input tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} name="site" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-1" role="radiogroup" aria-label="Entrega ou retirada">
        {(
          [
            ["entrega", "Entrega", Bike],
            ["retirada", "Retirar", Store],
          ] as const
        ).map(([valor, rotulo, Icone]) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={tipo === valor}
            disabled={valor === "entrega" && !loja.bairros.length}
            onClick={() => setTipo(valor)}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition disabled:opacity-40",
              tipo === valor ? "bg-white text-stone-900 shadow-[0_1px_3px_rgb(0_0_0/0.1)]" : "text-stone-500"
            )}
          >
            <Icone className="size-4" /> {rotulo}
          </button>
        ))}
      </div>
      {!loja.bairros.length && <p className="text-[13px] text-stone-500">No momento estamos só com retirada no balcão.</p>}

      <Bloco titulo="Seus dados">
        <Campo texto="Nome" erro={erros.cliente_nome}>
          <input {...campo("nome")} autoComplete="name" placeholder="Como podemos te chamar?" className={entrada} />
        </Campo>
        <Campo texto="WhatsApp" erro={erros.cliente_telefone}>
          <input {...campo("telefone")} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 98765-4321" className={entrada} />
        </Campo>
      </Bloco>

      {tipo === "entrega" && (
        <Bloco titulo="Endereço de entrega">
          <Campo texto="Bairro" erro={erros["endereco.bairro_id"] ?? erros.endereco}>
            <select {...campo("bairroId")} className={entrada}>
              <option value="">Escolha o bairro</option>
              {loja.bairros.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome} — entrega {formatarReais(b.taxaCentavos)}
                </option>
              ))}
            </select>
          </Campo>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <Campo texto="Rua" erro={erros["endereco.rua"]}>
              <input {...campo("rua")} autoComplete="address-line1" className={entrada} />
            </Campo>
            <Campo texto="Número" erro={erros["endereco.numero"]}>
              <input {...campo("numero")} inputMode="numeric" className={entrada} />
            </Campo>
          </div>
          <Campo texto="Complemento (opcional)">
            <input {...campo("complemento")} placeholder="Apto, bloco..." className={entrada} />
          </Campo>
          <Campo texto="Ponto de referência (opcional)">
            <input {...campo("referencia")} className={entrada} />
          </Campo>
        </Bloco>
      )}

      <Bloco titulo="Pagamento">
        <div className="space-y-2" role="radiogroup" aria-label="Forma de pagamento">
          {PAGAMENTOS.filter((p) => p.valor !== "pix" || loja.pix).map(({ valor, rotulo, detalhe, Icone }) => {
            const ativo = pagamento === valor;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => setPagamento(valor)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left transition",
                  ativo ? "ring-2 ring-marca-500" : "ring-1 ring-stone-200"
                )}
              >
                <span className={cn("flex size-10 items-center justify-center rounded-xl", ativo ? "bg-marca-50 text-marca-600" : "bg-stone-100 text-stone-600")}>
                  <Icone className="size-5" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-bold">{rotulo}</span>
                  <span className="block text-xs text-stone-500">{detalhe}</span>
                </span>
                <span className={cn("flex size-5 items-center justify-center rounded-full border-2", ativo ? "border-marca-600" : "border-stone-300")}>
                  {ativo && <span className="size-2.5 rounded-full bg-marca-600" />}
                </span>
              </button>
            );
          })}
        </div>
        {erros.forma_pagamento && <p className="text-[13px] font-medium text-marca-700">{erros.forma_pagamento}</p>}
        {pagamento === "pix" && <p className="text-[13px] text-stone-500">O QR Code aparece na próxima tela. O preparo começa quando o pagamento cair.</p>}
        {pagamento === "dinheiro" && (
          <Campo texto="Troco para quanto? (deixe vazio se não precisar)" erro={erros.troco_para}>
            <input value={troco} onChange={(e) => setTroco(e.target.value)} inputMode="decimal" placeholder="Ex.: 100" className={entrada} />
          </Campo>
        )}
      </Bloco>

      <Bloco titulo="Observações do pedido">
        <input value={observacoes} onChange={(e) => setObservacoes(e.target.value.slice(0, 300))} placeholder="Opcional" className={entrada} />
      </Bloco>

      <dl className="space-y-1.5 rounded-3xl bg-stone-50 p-4 text-sm">
        <div className="flex justify-between text-stone-600">
          <dt>Subtotal</dt>
          <dd className="tabular">{formatarReais(subtotal)}</dd>
        </div>
        {tipo === "entrega" && (
          <div className="flex justify-between text-stone-600">
            <dt>Entrega{bairro ? ` · ${bairro.nome}` : ""}</dt>
            <dd className="tabular">{bairro ? formatarReais(taxa) : "escolha o bairro"}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-extrabold">
          <dt>Total</dt>
          <dd className="tabular">{formatarReais(total)}</dd>
        </div>
      </dl>

      {abaixoDoMinimo && <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">O pedido mínimo é {formatarReais(loja.pedidoMinimoCentavos)}.</p>}
      {!cotacao.ok && <p className="rounded-2xl bg-marca-50 p-3 text-sm text-marca-800">{cotacao.erros[0]}</p>}
      {erroGeral.length > 0 && (
        <div className="rounded-2xl bg-marca-50 p-3 text-sm text-marca-800" role="alert">
          {erroGeral.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      {!loja.aberta || !loja.linkAtivo ? (
        <p className="rounded-2xl bg-stone-900 p-3.5 text-center text-sm font-medium text-white">
          {!loja.linkAtivo
            ? "Os pedidos pelo site estão desligados agora."
            : `Estamos fechados${loja.proximaAbertura ? ` — abrimos ${loja.proximaAbertura}` : ""}. Dá para montar, mas não para finalizar.`}
        </p>
      ) : (
        <button
          type="submit"
          aria-busy={enviando} disabled={!podeFinalizar || enviando}
          className="flex h-14 w-full items-center justify-between rounded-2xl bg-marca-600 px-5 text-base font-bold text-white shadow-[0_12px_24px_-12px_rgb(201_53_26/0.9)] disabled:not-aria-busy:bg-stone-300 disabled:not-aria-busy:shadow-none"
        >
          <span className="flex items-center gap-2">
            {enviando && <Loader2 className="size-5 animate-spin" />}
            {enviando ? "Enviando..." : "Fazer pedido"}
          </span>
          <span className="tabular">{formatarReais(total)}</span>
        </button>
      )}
    </form>
  );
}
