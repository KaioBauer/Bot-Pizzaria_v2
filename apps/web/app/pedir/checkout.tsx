"use client";

import { Bike, Loader2, Minus, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { formatarReais, pedidoLinkSchema, type BairroEntrega, type FormaPagamento, type TipoEntrega } from "@pizzaria/shared";
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

// Carrinho ------------------------------------------------------------------------------

export function ListaCarrinho({
  itens,
  precos,
  aoAlterar,
  aoEditar,
}: {
  itens: ItemCarrinho[];
  precos: Precos;
  aoAlterar: (itens: ItemCarrinho[]) => void;
  aoEditar: (id: string) => void;
}) {
  if (!itens.length) return <p className="py-10 text-center text-stone-500">Seu carrinho está vazio. Que tal montar uma pizza? 🍕</p>;
  const mudarQuantidade = (id: string, delta: number) =>
    aoAlterar(itens.flatMap((i) => (i.id !== id ? [i] : i.item.quantidade + delta <= 0 ? [] : [{ ...i, item: { ...i.item, quantidade: Math.min(50, i.item.quantidade + delta) } }])));

  return (
    <ul className="divide-y divide-creme-200">
      {itens.map((i) => {
        const p = previaItem(i.item, precos);
        return (
          <li key={i.id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-stone-900">{p.ok ? p.descricao : "Item indisponível"}</p>
              {i.item.observacao && <p className="text-sm text-stone-500">Obs.: {i.item.observacao}</p>}
              {!p.ok && <p className="text-sm text-marca-700">{p.erro}</p>}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex items-center rounded-full bg-white ring-1 ring-creme-300">
                  <button type="button" onClick={() => mudarQuantidade(i.id, -1)} className="flex size-9 items-center justify-center" aria-label="Diminuir">
                    {i.item.quantidade === 1 ? <Trash2 className="size-4 text-marca-700" /> : <Minus className="size-4" />}
                  </button>
                  <span className="w-5 text-center text-sm font-semibold tabular">{i.item.quantidade}</span>
                  <button type="button" onClick={() => mudarQuantidade(i.id, 1)} className="flex size-9 items-center justify-center" aria-label="Aumentar">
                    <Plus className="size-4" />
                  </button>
                </div>
                {ehPizza(i, precos) && (
                  <button type="button" onClick={() => aoEditar(i.id)} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-stone-700 ring-1 ring-creme-300">
                    <Pencil className="size-3.5" /> Editar
                  </button>
                )}
              </div>
            </div>
            <span className="font-semibold tabular">{p.ok ? formatarReais(p.subtotalCentavos) : "—"}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Dados do cliente e envio ---------------------------------------------------------------

const PAGAMENTOS: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "cartao", rotulo: "Cartão na entrega" },
];

const entrada = "h-11 w-full rounded-xl bg-white px-3 text-[15px] ring-1 ring-creme-300 outline-none focus:ring-2 focus:ring-marca-400";

function Rotulo({ texto, children, erro }: { texto: string; children: React.ReactNode; erro?: string | undefined }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-stone-700">{texto}</span>
      {children}
      {erro && <span className="mt-1 block text-sm text-marca-700">{erro}</span>}
    </label>
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
      className="space-y-5"
      noValidate
    >
      {/* Honeypot: invisível para pessoas; robôs preenchem e o bot recusa. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site <input tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} name="site" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Entrega ou retirada">
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
              "flex h-12 items-center justify-center gap-2 rounded-2xl font-semibold transition disabled:opacity-40",
              tipo === valor ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-creme-300"
            )}
          >
            <Icone className="size-5" /> {rotulo}
          </button>
        ))}
      </div>
      {!loja.bairros.length && <p className="-mt-3 text-sm text-stone-500">No momento estamos só com retirada no balcão.</p>}

      <div className="space-y-3">
        <Rotulo texto="Seu nome" erro={erros.cliente_nome}>
          <input {...campo("nome")} autoComplete="name" className={entrada} />
        </Rotulo>
        <Rotulo texto="WhatsApp (com DDD)" erro={erros.cliente_telefone}>
          <input {...campo("telefone")} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 98765-4321" className={entrada} />
        </Rotulo>
      </div>

      {tipo === "entrega" && (
        <div className="space-y-3">
          <Rotulo texto="Bairro" erro={erros["endereco.bairro_id"] ?? erros.endereco}>
            <select {...campo("bairroId")} className={entrada}>
              <option value="">Escolha o bairro</option>
              {loja.bairros.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome} — entrega {formatarReais(b.taxaCentavos)}
                </option>
              ))}
            </select>
          </Rotulo>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <Rotulo texto="Rua" erro={erros["endereco.rua"]}>
              <input {...campo("rua")} autoComplete="address-line1" className={entrada} />
            </Rotulo>
            <Rotulo texto="Número" erro={erros["endereco.numero"]}>
              <input {...campo("numero")} inputMode="numeric" className={entrada} />
            </Rotulo>
          </div>
          <Rotulo texto="Complemento (opcional)">
            <input {...campo("complemento")} placeholder="Apto, bloco..." className={entrada} />
          </Rotulo>
          <Rotulo texto="Ponto de referência (opcional)">
            <input {...campo("referencia")} className={entrada} />
          </Rotulo>
        </div>
      )}

      <div>
        <span className="mb-1 block text-sm font-semibold text-stone-700">Pagamento</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Forma de pagamento">
          {PAGAMENTOS.filter((p) => p.valor !== "pix" || loja.pix).map((p) => (
            <button
              key={p.valor}
              type="button"
              role="radio"
              aria-checked={pagamento === p.valor}
              onClick={() => setPagamento(p.valor)}
              className={cn(
                "min-h-12 rounded-2xl px-2 text-sm font-semibold transition",
                pagamento === p.valor ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-creme-300"
              )}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        {erros.forma_pagamento && <p className="mt-1 text-sm text-marca-700">{erros.forma_pagamento}</p>}
        {pagamento === "pix" && <p className="mt-2 text-sm text-stone-600">O QR Code do Pix aparece na próxima tela. O preparo começa quando o pagamento cair.</p>}
        {pagamento === "dinheiro" && (
          <div className="mt-3">
            <Rotulo texto="Troco para quanto? (deixe vazio se não precisar)" erro={erros.troco_para}>
              <input value={troco} onChange={(e) => setTroco(e.target.value)} inputMode="decimal" placeholder="Ex.: 100" className={entrada} />
            </Rotulo>
          </div>
        )}
      </div>

      <Rotulo texto="Observações do pedido (opcional)">
        <input value={observacoes} onChange={(e) => setObservacoes(e.target.value.slice(0, 300))} className={entrada} />
      </Rotulo>

      <dl className="space-y-1 rounded-2xl bg-creme-100 p-4 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd className="tabular">{formatarReais(subtotal)}</dd>
        </div>
        {tipo === "entrega" && (
          <div className="flex justify-between">
            <dt>Entrega{bairro ? ` (${bairro.nome})` : ""}</dt>
            <dd className="tabular">{bairro ? formatarReais(taxa) : "escolha o bairro"}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-creme-300 pt-2 text-base font-bold">
          <dt>Total</dt>
          <dd className="tabular">{formatarReais(total)}</dd>
        </div>
        <p className="pt-1 text-xs text-stone-500">Valores conferidos pela pizzaria ao confirmar.</p>
      </dl>

      {abaixoDoMinimo && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">O pedido mínimo é {formatarReais(loja.pedidoMinimoCentavos)}.</p>}
      {!cotacao.ok && <p className="rounded-xl bg-marca-50 p-3 text-sm text-marca-800">{cotacao.erros[0]}</p>}
      {erroGeral.length > 0 && (
        <div className="rounded-xl bg-marca-50 p-3 text-sm text-marca-800" role="alert">
          {erroGeral.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      {!loja.aberta || !loja.linkAtivo ? (
        <p className="rounded-xl bg-stone-900 p-3 text-center text-sm text-white">
          {!loja.linkAtivo
            ? "Os pedidos pelo site estão desligados agora."
            : `Estamos fechados${loja.proximaAbertura ? ` — abrimos ${loja.proximaAbertura}` : ""}. Dá para montar, mas não para finalizar.`}
        </p>
      ) : (
        <button
          type="submit"
          disabled={!podeFinalizar || enviando}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-marca-600 py-3.5 text-base font-semibold text-white shadow-elevada disabled:bg-stone-400"
        >
          {enviando ? <Loader2 className="size-5 animate-spin" /> : null}
          {enviando ? "Enviando..." : `Fazer pedido · ${formatarReais(total)}`}
        </button>
      )}
    </form>
  );
}
